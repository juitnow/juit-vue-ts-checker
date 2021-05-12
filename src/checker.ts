import {
  VueCompilerHost,
} from './compiler'

import { filesCache,
  resolveFileName,
} from './cache'

import { diagnosticsReport,
  Reports,
  makeReports,
  sourceFilesReport,
} from './reports'

import {
  CompilerHost,
  CompilerOptions,
  convertCompilerOptionsFromJson,
  createProgram,
  getDefaultCompilerOptions,
  getPreEmitDiagnostics,
  readConfigFile,
  sys,
} from 'typescript'


// An internal tuple for our internal state
type CheckerState = [ CompilerOptions, CompilerHost, Reports ]

export class Checker {
  private _state: () => CheckerState

  constructor(tsConfigFileName?: string) {
    if (tsConfigFileName) {
      // If we have a config file name, the "state" will be resolved during
      // "check", and our cache will make sure that everything is reinitialized
      // correctly when the config filename changes on disk...
      const cache = filesCache<CheckerState>()
      this._state = (): CheckerState => {
        const state = cache(tsConfigFileName, (resolvedConfigFileName) => {
          const json = readConfigFile(resolvedConfigFileName, sys.readFile)
          const jsonOptions = json.config.compilerOptions
          const { options, errors } = convertCompilerOptionsFromJson(jsonOptions, sys.getCurrentDirectory())
          const reports = diagnosticsReport(errors)
          return [ options, new VueCompilerHost(), reports ]
        })

        if (state) return state

        const options = getDefaultCompilerOptions()
        const host = new VueCompilerHost()
        return [ options, host, makeReports({
          code: 0,
          message: 'File not found',
          severity: 'error',
          fileName: tsConfigFileName,
        }) ]
      }
    } else {
      // If we don't have a config file, we just use some defaults
      // and we never end up recreating the compiler host...
      const options = getDefaultCompilerOptions()
      const host = new VueCompilerHost()
      const reports = makeReports()
      this._state = (): CheckerState => [ options, host, reports ]
    }
  }

  check(...files: string[]): Reports {
    // This will get our options, host and some initial reports related to the
    // parsing of our "tsconfig.json" file... If the "tsconfig.json" changes
    // the options will be re-parsed, host recreated and reports re-generated
    const [ options, host, initialReports ] = this._state()

    // Clone our initial reports, and bail on errors
    const reports = makeReports(...initialReports)
    if (reports.hasErrors) return reports

    // Resolve all our files before passing it off to the compiler
    const resolvedFiles: string[] = files.map(resolveFileName)

    console.log('CHECKING', resolvedFiles)

    // Create a new "program" for TypeScript.. The host caches all internal
    // `SourceFile`s for us, so we're pretty much ok running over and over...
    const program = createProgram(resolvedFiles, options, host)
    sourceFilesReport(program.getSourceFiles(), reports)
    diagnosticsReport(getPreEmitDiagnostics(program), reports)

    // We _should_ be safe not running the `emit(...)` part of the process.
    // Theoretically that will just _render_ the various TypeScript ASTs into
    // some JS code, while running some optional transformers. As we do not
    // write files, but only check, the "createProgram" stage should suffice...
    return reports
  }
}
