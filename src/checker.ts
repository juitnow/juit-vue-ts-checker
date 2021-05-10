import {
  VueCompilerHost,
} from './compiler'

import { filesCache,
  resolveFileName,
} from './files'

import { diagnosticsReport,
  Report,
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

  check(files: string[]): Report[] {
    // This will get our options, host and some initial reports related to the
    // parsing of our "tsconfig.json" file... If the "tsconfig.json" changes
    // the options will be re-parsed, host recreated and reports re-generated
    const [ options, host, reports ] = this._state()

    const relativeFiles: string[] = files.map((fileName) => {
      const resolvedFileName = resolveFileName(fileName)
      return resolvedFileName
    })

    const program = createProgram(relativeFiles, options, host)
    sourceFilesReport(program.getSourceFiles(), reports)
    diagnosticsReport(getPreEmitDiagnostics(program), reports)

    if (reports.length === 0) {
      const emitResults = program.emit()
      diagnosticsReport(emitResults.diagnostics, reports)
    }

    return reports
  }
}
