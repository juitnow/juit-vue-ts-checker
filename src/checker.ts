import { VueLanguageServiceHost } from './compiler'
import { createCache } from './lib/cache'
import { logger } from './lib/logger'

import {
  Diagnostic,
  LanguageService,
  convertCompilerOptionsFromJson,
  createLanguageService,
  readConfigFile,
  sys,
} from 'typescript'

import {
  ResolvedPath,
  cwd,
  resolve,
} from './lib/files'
import { makeReports, Reports } from './reports'

export class Checker {
  private readonly _log = logger('language service')
  private readonly cache = createCache<LanguageService>()

  private readonly configFile: ResolvedPath

  private currentLanguageService?: LanguageService
  private initialDiagnostics!: Diagnostic[]
  private currentHost!: VueLanguageServiceHost

  constructor(path: string) {
    this.configFile = resolve(path)
  }

  check(path: string): Reports {
    const service = this.cache(this.configFile, () => {
      this._log.info('Reloading compiler options from', this.configFile)

      // Use TypeScript to read the file, it might have extends/imports/...
      const contents = readConfigFile(this.configFile, sys.readFile)
      const json = contents.config.compilerOptions
      const { options, errors } = convertCompilerOptionsFromJson(json, cwd())
      this.initialDiagnostics = errors
      this.currentHost = new VueLanguageServiceHost(options)
      return createLanguageService(this.currentHost)
    })

    if (! service) throw new Error('Unable to find ' + this.configFile)

    if (this.currentLanguageService && (this.currentLanguageService != service)) {
      this._log.debug('Disposing of existing Vue Language Service')
      this.currentLanguageService.dispose()
    }
    this.currentLanguageService = service

    const reports = makeReports(this.initialDiagnostics)

    const files = this.currentHost.addScriptFileName(path)
    for (const file of files) {
      this._log.info('Checking', file)
      reports.addDiagnostics(service.getSemanticDiagnostics(file))
      reports.addDiagnostics(service.getSyntacticDiagnostics(file))
      reports.addDiagnostics(service.getSuggestionDiagnostics(file))
    }

    return reports
  }
}
