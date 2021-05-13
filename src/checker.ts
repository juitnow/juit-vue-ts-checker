import { VueLanguageServiceHost } from './compiler'
import { createCache } from './lib/cache'

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

import { logger } from './lib/logger'
import { k, w } from './lib/colors'
import { pseudoPath } from './lib/pseudo'
const log = logger('language service')


export class Checker {
  private readonly cache = createCache<LanguageService>()

  private readonly configFile: ResolvedPath

  private currentLanguageService?: LanguageService
  private initialDiagnostics!: Diagnostic[]
  private currentHost!: VueLanguageServiceHost

  constructor(path: string) {
    this.configFile = resolve(path)
  }

  check(...paths: string[]): Reports {
    const service = this.cache(this.configFile, () => {
      log.info('Reloading compiler options from', w(this.configFile))

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
      log.debug('Disposing of existing Vue Language Service')
      this.currentLanguageService.dispose()
    }
    this.currentLanguageService = service

    const reports = makeReports(this.currentHost, this.initialDiagnostics)
    if (reports.hasErrors) return reports

    const files = paths.reduce((files, path) => {
      files.push(...this.currentHost.addScriptFileName(path))
      return files
    }, [] as ResolvedPath[])

    for (const file of files) {
      if (log.isInfoEnabled) {
        const pseudo = pseudoPath(file)
        if (pseudo.type) {
          if (pseudo.type === 'render') log.info('Checking', w(pseudo.file), k('(template)'))
          if (pseudo.type === 'script') log.info('Checking', w(pseudo.file), k('(script)'))
        } else if (pseudo.file) {
          log.info('Checking', w(pseudo.file))
        }
      }

      reports.addDiagnostics(service.getSemanticDiagnostics(file))
      reports.addDiagnostics(service.getSyntacticDiagnostics(file))
      // no suggestions diagnostics... they are too informative in templates :-)
    }

    return reports.sort()
  }
}
