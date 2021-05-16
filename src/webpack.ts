import { colors } from './lib/colors'
import { logger } from './lib/logger'

import {
  Compilation,
  Compiler,
  NormalModule,
  WebpackError,
} from 'webpack'

import {
  AsyncChecker,
  createAsyncChecker,
} from './async'

import {
  Report,
  Reports,
  makeReports,
} from './core/reports'

// Pretty colors!
const { K, R, X, C, Y, w, r, g, y, k } = colors()

// For our checker
logger.level = 'warn'

// For webpack
const name = 'JuitWebpackCheckerPlugin'

/** Options for the construction of our `JuitWebpackCheckerPlugin` */
export interface JuitWebpackCheckerPluginOptions {
  /**
   * The `tsconfig.json` filename to use.
   *
   * If none was specified, we'll check for it in the current directory, and
   * we'll use it if found, otehrwise we'll use TypeScript's defaults.
   */
  tsconfig?: string

  /** An `Array` of extensions to check (defaults to `[ 'ts', 'vue' ]`) */
  extensions?: string[]
}

/**
 * Our TypeScript checker and reporter plugin for Webpack 5.x
 */
export class JuitWebpackCheckerPlugin {
  /** Reports encountered compiling, keyed by file name */
  private _state: Record<string, Promise<Reports>> = {}
  /** Whether WebPack is watching or just a single run */
  private _watching: boolean = false
  /** Our `AsyncChecker` instance */
  private _checker: AsyncChecker
  /** A matcher for our extensions */
  private _matcher: RegExp

  constructor(options: JuitWebpackCheckerPluginOptions = {}) {
    const tsconfig = options.tsconfig
    const extensions = options.extensions || [ 'ts', 'vue' ]

    this._checker = createAsyncChecker(tsconfig)
    this._matcher = new RegExp(`\\.(${extensions.join('|')})$`)
  }

  private _shouldCheck(file: string): boolean {
    return !! file.match(this._matcher)
  }

  apply(compiler: Compiler): void {
    // =========================================================================
    // "DONE" hook: when compilation is done... If not watching, we'll
    // _kindly_ destroy our checker so that Webpack can exit cleanly
    compiler.hooks.done.tapPromise(name, async (/* stats */) => {
      if (!this._watching) await this._checker.destroy()
    })

    // =========================================================================
    // "WATCHRUN" hook: simply mark we're watching when a watch runs...
    compiler.hooks.watchRun.tap(name, (/* compiler */) => {
      this._watching = true
    })

    // =========================================================================
    // "WATCHCLOSE" hook: destroy our checker on watch close... This really
    // doesn't have much of an effect, as normally it's called by CTRL-C
    compiler.hooks.watchClose.tap(name, () => {
      this._watching = false
      this._checker.destroy().catch((error) => {
        compiler.getInfrastructureLogger(name).error(error)
      })
    })

    // =========================================================================
    // "AFTER COMPILE" hook: every time we compile, we ask our checker for the
    // dependencies on our files, and re-inject those into the compilation
    compiler.hooks.afterCompile.tapPromise(name, async (compilation) => {
      const files = Array.from(compilation.fileDependencies)
          .filter((file) => this._shouldCheck(file))
          .sort()

      // Make sure the checker has finished checking...
      const promises = files
          .map((file) => this._state[file]) // file => Reports
          .filter((reports) => !!reports) // should never happen, but...
      await Promise.all(promises)

      // Add all dependencies to this compilation, so that ... ???????????
      const dependencies = await this._checker.dependencies(...files)
      compilation.fileDependencies.addAll(dependencies)
    })

    // =========================================================================
    // "COMPILATION" hook: a new compilation starts, so we can initialize our
    // checker and start checking (if we can, obviously)
    compiler.hooks.compilation.tap(name, (compilation) => {
      if (compilation.compiler != compiler) return

      // We need to see if `init()` gave us some bad reports... If so we don't
      // really want to check any file, but just report the errors...
      const canRun: Promise<boolean> = this._checker.init().then((reports) => {
        // Report whatever we found...
        compilationReports(compilation, reports)
        return ! reports.hasErrors
      })

      // We keep a list of files checked while compiling. At the end of the
      // compilation we'll check whatever we're missing from the compilation's
      // own file dependencies
      const checked = new Set<string>()

      // -----------------------------------------------------------------------
      // "NORMAL MODULE LOADER" hook: every time a normal module is loaded (a
      // file for mere mortals) we'll tell our checker to _eventually_ check it
      NormalModule.getCompilationHooks(compilation).loader.tap(name, (loaderContext, module) => {
        if (! this._shouldCheck(module.resource)) return

        // It'd be simpler if this were an async hook, buuuut....
        canRun.then((canRun) => {
          if (! canRun) return // don't check if we can't run...

          // We want a _promise_ up in the state, so we can wait on it
          this._state[module.resource] = this._checker.check(module.resource)
          checked.add(module.resource)
        }).catch((error) => {
          compiler.getInfrastructureLogger(name).error(error)
        })
      })

      // -----------------------------------------------------------------------
      // "COMPILATION AFTER SEAL" hook: called at the end of the process, here
      // we add all reports and additionally check missing files from the watch
      compilation.hooks.afterSeal.tapPromise(name, async () => {
        if (compilation.compiler != compiler) return

        // Quickly bail out if we can't run... Above we already reported the
        // problems in our `tsconfig.json` so we can move on with our lives..
        if (!(await canRun)) return

        // From all the file dependencies, only consider what needs checking
        const dependencies = Array.from(compilation.fileDependencies)
            .filter((file) => this._shouldCheck(file))

        // OK, here is the interesting part: in a watch run, the hook above only
        // checked the files that changed, but _not_ all of our tree. We really
        // want tho also check the other files (which should have been already
        // been parsed and prepared in a previous watch run - so, this is fast)
        // because if one of the files changed modified a _type_ that one of the
        // missing files is using, then the whole thing falls apart!
        dependencies
            .filter((file) => ! checked.has(file))
            .forEach((file) => this._state[file] = this._checker.check(file))

        // Now we get all the `Promise`s to `Reports` but _only_ for the files
        // which are included in this compilation... Files not in our tree are
        // really not relevant anymore (could be undeleted leftovers, who cares)
        const promises: Promise<Reports>[] = dependencies
            .map((file) => this._state[file]) // file => Reports
            .filter((reports) => !!reports) // should never happen, but...

        // And finally, we await on all our `Promise`s for reports, sort our
        // errors, and report them to webpack!
        const reports = (await Promise.all(promises))
            .reduce((previous, current) => {
              previous.push(...current)
              return previous
            }, makeReports())
            .sort()
        compilationReports(compilation, reports)
      })
    })
  }
}

/** Convert `Reports` into `WebpackError`s and add them to the `Compilation` */
function compilationReports(compilation: Compilation, reports: Report[]): void {
  for (const report of reports) {
    if (report.isError || report.isWarning) {
      const error = createWebpackError(report)
      if (report.isError) compilation.errors.push(error)
      if (report.isWarning) compilation.warnings.push(error)
    }
  }
}

/** Create a `WebpackError` from a `Report` */
function createWebpackError(report: Report): WebpackError {
  let message = `${K}[${C}TS${report.code}${K}]${X} `
  if (report.isError) message += `${R}ERROR${X} `
  if (report.isWarning) message += `${Y}WARNING${X} `
  message += report.message

  if (report.location) {
    const { column, context, contextLength } = report.location

    message += `\n${K} | ${X}\n${K} | ${X}`
    if ((column > 0) && (contextLength > 0)) {
      const skip = column > 40 ? column - 40 : 0 // shift context if too right

      if (skip > 0) message += k(' \u2026\u2026 ') // hellipsis on shifted col
      message += context.substr(skip, column)
      message += w(context.substr(column + skip, contextLength))
      message += context.substr(column + skip + contextLength)

      message += `\n${K} | ${X}`
      if (skip > 0) message += '    ' // pad the hellipsis above
      message += ' '.repeat(column - skip)
      if (report.isError) {
        message += r('^'.repeat(contextLength))
      } else if (report.isWarning) {
        message += y('^'.repeat(contextLength))
      } else {
        message += g('^'.repeat(contextLength))
      }
    } else {
      message += context
    }
  }

  const error = new WebpackError(message)
  error.hideStack = true

  if (report.fileName) error.file = report.fileName

  if (report.location) {
    error.loc = {
      start: { line: report.location.line, column: report.location.column },
      end: { line: report.location.line, column: report.location.column + report.location.contextLength },
    }
  }

  return error
}
