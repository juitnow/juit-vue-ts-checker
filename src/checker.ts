import { VueLanguageServiceHost } from './compiler'
import { createCache } from './lib/cache'
import { cwd } from './lib/files'
import { k, w } from './lib/colors'
import { logger } from './lib/logger'
import { pseudoPath } from './lib/pseudo'

import {
  Reports,
  makeReports,
} from './reports'

import {
  Diagnostic,
  LanguageService,
  Path,
  convertCompilerOptionsFromJson,
  createLanguageService,
  readConfigFile,
  sys,
} from 'typescript'

const log = logger('language service')

export class Checker {
  private readonly _cache = createCache<LanguageService>()
  private readonly _configFile: string

  private _initialDiagnostics: Diagnostic[] = []
  private _currentLanguageService?: LanguageService
  private _currentHost!: VueLanguageServiceHost

  constructor(configFile: string) {
    this._configFile = configFile
  }

  check(...files: string[]): Reports {
    const [ , service ] = this._cache(this._configFile, ({ path }) => {
      if (this._currentLanguageService) {
        log.debug('Disposing of existing Vue Language Service')
        this._currentLanguageService.dispose()
        log.info('Reloading compiler options from', w(path))
      } else {
        log.info('Loading compiler options from', w(path))
      }

      // Use TypeScript to read the file, it might have extends/imports/...
      const contents = readConfigFile(path, sys.readFile)
      const json = contents.config.compilerOptions
      const { options, errors } = convertCompilerOptionsFromJson(json, cwd())
      this._initialDiagnostics = errors

      // Let's create a new language service and remember it. We'll want to
      // dispose of it if the "tsconfig.json" is changed so that we free memory
      this._currentHost = new VueLanguageServiceHost(options)
      const service = createLanguageService(this._currentHost)
      this._currentLanguageService = service
      return service
    })

    if (! service) throw new Error('Unable to find configuration file ' + this._configFile)

    const reports = makeReports(this._currentHost, this._initialDiagnostics)
    if (reports.hasErrors) return reports

    const paths = files.reduce((paths, file) => {
      paths.push(...this._currentHost.addScriptFileName(file))
      return paths
    }, [] as Path[])

    for (const path of paths) {
      const pseudo = pseudoPath(path)

      if (log.isInfoEnabled) {
        if (pseudo.type) {
          log.info('Checking', w(pseudo.vue), k(`(${pseudo.type})`))
        } else if (pseudo.path) {
          log.info('Checking', w(pseudo.path))
        }
      }

      reports.addDiagnostics(service.getSemanticDiagnostics(pseudo.path))
      reports.addDiagnostics(service.getSyntacticDiagnostics(pseudo.path))
      // We don't run the _suggestion_ diagnostics... Simply use ESLINT for it
    }

    return reports.sort()
  }
}
