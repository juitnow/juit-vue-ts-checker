import { VueLanguageServiceHost } from './compiler'
import { createCache } from './lib/cache'
import { cwd } from './lib/files'
import { k, w } from './lib/colors'
import { logger } from './lib/logger'
import { makeReports, Reports } from './reports'
import { pseudoPath } from './lib/pseudo'

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
  private readonly cache = createCache<LanguageService>(true)
  private readonly configFile: string

  private currentLanguageService?: LanguageService
  private initialDiagnostics!: Diagnostic[]
  private currentHost!: VueLanguageServiceHost

  constructor(configFile: string) {
    this.configFile = configFile
  }

  check(...paths: string[]): Reports {
    const cached = this.cache(this.configFile, ({ file }) => {
      if (this.currentLanguageService) {
        log.debug('Disposing of existing Vue Language Service')
        this.currentLanguageService.dispose()
        log.info('Reloading compiler options from', w(file))
      } else {
        log.info('Loading compiler options from', w(file))
      }

      // Use TypeScript to read the file, it might have extends/imports/...
      const contents = readConfigFile(file, sys.readFile)
      const json = contents.config.compilerOptions
      const { options, errors } = convertCompilerOptionsFromJson(json, cwd())
      this.initialDiagnostics = errors

      // Let's create a new language service and remember it. We'll want to
      // dispose of it if the "tsconfig.json" is changed so that we free memory
      this.currentHost = new VueLanguageServiceHost(options)
      const service = createLanguageService(this.currentHost)
      this.currentLanguageService = service
      return service
    })

    if (! cached) throw new Error('Unable to find configuration file ' + this.configFile)
    const { result: service } = cached

    const reports = makeReports(this.currentHost, this.initialDiagnostics)
    if (reports.hasErrors) return reports

    const files = paths.reduce((files, path) => {
      files.push(...this.currentHost.addScriptFileName(path))
      return files
    }, [] as Path[])

    for (const file of files) {
      const pseudo = pseudoPath(file)
      if (log.isInfoEnabled) {
        if (pseudo.type) {
          log.info('Checking', w(pseudo.file), k(`(${pseudo.type})`))
        } else if (pseudo.file) {
          log.info('Checking', w(pseudo.file))
        }
      }

      reports.addDiagnostics(service.getSemanticDiagnostics(file))
      reports.addDiagnostics(service.getSyntacticDiagnostics(file))
      if (pseudo.type !== 'render') { // not much we can do here, right?
        reports.addDiagnostics(service.getSuggestionDiagnostics(file))
      }
    }

    return reports.sort()
  }
}
