import { VueLanguageServiceHost } from './compiler'
import { createCache } from './lib/cache'
import { colors } from './lib/colors'
import { cwd, fileLastModified, resolve } from './lib/files'
import { logger } from './lib/logger'
import { pseudoPath } from './lib/pseudo'

import {
  Reports,
  makeReports,
  diagnosticsReports,
} from './reports'

import {
  LanguageService,
  Path,
  convertCompilerOptionsFromJson,
  createLanguageService,
  readConfigFile,
  sys,
  getDefaultCompilerOptions,
} from 'typescript'

const log = logger('language service')
const { f, k } = colors()

/* ========================================================================== *
 * CHECKER INTERFACE AND ABSTRACT CLASS                                       *
 * ========================================================================== */

/** A `Checker` checks a number of source files and returns `Reports` */
export interface Checker {
  /** Initialize this `Checker` and return the current `initialReports` */
  init(): Reports
  /** Check all the files specified and return the `Reports` for them */
  check(...files: string[]): Reports
  /** Destroy this `Checker` instance */
  destroy(): void
}

/** Our abstract `Checker` implementation */
abstract class AbstractChecker implements Checker {
  protected abstract readonly _currentHost: VueLanguageServiceHost
  protected abstract readonly _languageService: LanguageService

  abstract init(): Reports

  destroy(): void {
    this._languageService.dispose()
  }

  check(...files: string[]): Reports {
    // Start by creating an empty reports instance
    const reports = makeReports()

    // Add each file to be checked, and collect the paths
    const paths = files.reduce((paths, file) => {
      paths.push(...this._currentHost.addScriptFileName(file))
      return paths
    }, [] as Path[])

    // Check each path
    for (const path of paths) {
      // Logging....
      if (log.isInfoEnabled) {
        const pseudo = pseudoPath(path)
        if (pseudo.type) {
          log.info('Checking', f(pseudo.vue), k(`(${pseudo.type})`))
        } else if (pseudo.path) {
          log.info('Checking', f(pseudo.path))
        }
      }

      // Syntactic reports
      reports.push(...diagnosticsReports(
          this._currentHost,
          this._languageService.getSyntacticDiagnostics(path)),
      )

      // Semantic reports
      reports.push(...diagnosticsReports(
          this._currentHost,
          this._languageService.getSemanticDiagnostics(path)),
      )

      // We don't run the _suggestion_ diagnostics...
    }

    return reports.sort()
  }
}

/* ========================================================================== *
 * CHECKER WITH DEFAULT OPTIONS                                               *
 * ========================================================================== */

class DefaultChecker extends AbstractChecker {
  protected readonly _currentHost: VueLanguageServiceHost
  protected readonly _languageService: LanguageService

  constructor() {
    super()
    const options = getDefaultCompilerOptions()
    this._currentHost = new VueLanguageServiceHost(options)
    this._languageService = createLanguageService(this._currentHost)
  }

  init(): Reports {
    return makeReports()
  }
}

/* ========================================================================== *
 * CHECKER RELOADING A TSCONFIG EVERY TIME IT CHANGES                         *
 * ========================================================================== */

type ConfiguredCheckerState = {
  host: VueLanguageServiceHost,
  service: LanguageService,
  reports: Reports,
}

class ConfiguredChecker extends AbstractChecker {
  private _previousLanguageService?: LanguageService
  private readonly _cache = createCache<ConfiguredCheckerState>()
  private readonly _tsconfig: Path

  constructor(tsconfig: Path) {
    super()
    this._tsconfig = tsconfig
  }

  private get _state(): ConfiguredCheckerState {
    const [ , state ] = this._cache(this._tsconfig, ({ path }) => {
      if (this._previousLanguageService) {
        log.debug('Disposing of existing Vue Language Service')
        this._previousLanguageService.dispose()
        log.info('Reloading compiler options from', f(path))
      } else {
        log.info('Loading compiler options from', f(path))
      }

      // Use TypeScript to read the file, it might have extends/imports/...
      const contents = readConfigFile(this._tsconfig, sys.readFile)
      const json = contents.config.compilerOptions
      const { options, errors } = convertCompilerOptionsFromJson(json, cwd())

      // Create our new state
      const host = new VueLanguageServiceHost(options)
      const service = createLanguageService(host)
      const reports = makeReports(diagnosticsReports(host, errors))

      // Remember this instance, to _dispose_ of it on reload
      this._previousLanguageService = service

      // Return our new state
      return { host, service, reports }
    })

    if (! state) throw new Error('Unable to read ' + this._tsconfig)
    return state
  }

  protected get _languageService(): LanguageService {
    return this._state.service
  }

  protected get _currentHost(): VueLanguageServiceHost {
    return this._state.host
  }

  init(): Reports {
    return this._state.reports
  }
}

/* ========================================================================== *
 * CREATE OUR CHECKER                                                         *
 * ========================================================================== */

export function createChecker(tsconfig?: string): Checker {
  if (tsconfig === undefined) {
    const resolved = resolve('tsconfig.json')
    const timestamp = fileLastModified(resolved)
    if (timestamp !== undefined) {
      return new ConfiguredChecker(resolved)
    } else {
      return new DefaultChecker()
    }
  } else {
    return new ConfiguredChecker(resolve(tsconfig))
  }
}
