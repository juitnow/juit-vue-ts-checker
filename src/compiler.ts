import {
  CompilerOptions,
  IScriptSnapshot,
  LanguageServiceHost,
  ModuleResolutionHost,
  ResolvedModule,
  ResolvedProjectReference,
  getDefaultLibFilePath,
  ScriptSnapshot,
  readConfigFile,
  convertCompilerOptionsFromJson,
  resolveModuleName,
  ModuleResolutionCache,
  createModuleResolutionCache,
} from 'typescript'

import { cache, Cache } from './lib/cache'

import { logger } from './lib/logger'
import { transpile, Transpiled } from './transpile'
import {
  CASE_SENSITIVE_FS,
  OS_EOL,
  ResolvedPath,
  cwd,
  fileExists,
  fileLastModified,
  fileRead,
  resolve,
  resolvePseudoPath,
} from './lib/files'

/* ========================================================================== *
 * VUE LANGUAGE SERVICE HOST                                                  *
 * -------------------------------------------------------------------------- *
 * In order to correctly check that the generated render function works with  *
 * the template, we expand any (existing on disk) `/dir/file.vue` file name   *
 * into three pseudo files:                                                   *
 *                                                                            *
 * - `/dir/file.vue/script.ts`  the contents of our <script> tag              *
 * - `/dir/file.vue/render.ts`  the <template> converted to render function   *
 * - `/dir/file.vue/index.ts`   the index file binding the two files above    *
 *                                                                            *
 * We use this structure because of a couple of reasons:                      *
 *                                                                            *
 * - if `/dir/file.vue` exists on disk, no other directory with the same name *
 *   can exists, so, we're safe when it comes to shadowing the filesystem     *
 *                                                                            *
 * - TypeScript will automagically import `/dir/file.vue/index.ts` while      *
 *   processing `import ...` statement, effectively saving us some work       *
 *                                                                            *
 * So, ultimately, this four-files approach is the cleanest option I could    *
 * find, but I might be missing something, so suggestions welcome!!!          *
 *                                                                            *
 * CAVEAT: we _could_ have used a single file containing script + template    *
 * (this was in fact the original approach) but we easily mess up when mixing *
 * the two scopes (e.g. if the script declares a variable with the same name  *
 * as an import or variable of the generated template - like "render")        *
 * ========================================================================== */

/** A _shim_ that will be generated templates using JavaScript (a no-op) */
const VUE_JS_SHIM = [
  'import { defineComponent } from "vue";',
  'export default defineComponent({});',
].join('\n')

/** A _shim_ that will be generated templates using TypeScript */
const VUE_TS_SHIM = [
  'import "./render";',
  'export * from "./script";',
  'import _default_ from "./script";',
  'export default _default_;',
].join('\n')


export class VueLanguageServiceHost implements LanguageServiceHost, ModuleResolutionHost {
  private readonly _compilationSettings: CompilerOptions
  private readonly _moduleResolutionCache: ModuleResolutionCache
  private readonly _transpiledCache: Cache<Transpiled | null>

  private readonly _log = logger('language service')
  private _scripts: Record<string, ResolvedPath> = {}

  constructor() {
    const json = readConfigFile('tsconfig.json', this.readFile.bind(this))
    const jsonOptions = json.config.compilerOptions
    const { options } = convertCompilerOptionsFromJson(jsonOptions, this.getCurrentDirectory())
    // TODO: how to get errors returned by languageService.getCompilerOptionsDiagnostics() ???
    this._compilationSettings = options

    this._moduleResolutionCache = createModuleResolutionCache(cwd(), resolve, options)
    this._transpiledCache = cache()
  }

  /* ======================================================================== *
   * SIMPLE GETTERS                                                           *
   * ======================================================================== */

  getCompilationSettings(): CompilerOptions {
    this._log.trace('getCompilationSettings')
    return this._compilationSettings
  }

  /* ======================================================================== *
   * ROOT SCRIPTS                                                             *
   * ======================================================================== */

  addScriptFileName(path: string): string[] {
    const [ file, pseudo ] = resolvePseudoPath(path)

    if (pseudo) {
      this._scripts[pseudo.index] = pseudo.vue
      this._scripts[pseudo.render] = pseudo.vue
      this._scripts[pseudo.script] = pseudo.vue
      return [ pseudo.index, pseudo.render, pseudo.script ]
    } else if (file) {
      this._scripts[file] = file
      return [ file ]
    } else {
      return []
    }
  }

  getScriptFileNames(): string[] {
    this._log.trace('getScriptFileNames')
    return Object.keys(this._scripts)
  }

  /* ======================================================================== *
   * SCRIPT VERSION AND SNAPSHOT                                              *
   * ======================================================================== */

  getScriptVersion(path: string): string {
    this._log.trace('getScriptVersion', path)

    const [ file, pseudo ] = resolvePseudoPath(path)

    const lastModified =
      pseudo ? fileLastModified(pseudo.vue) :
      file ? fileLastModified(file) :
      undefined

    return lastModified?.toString() || 'unknown'
  }

  getScriptSnapshot(path: string): IScriptSnapshot | undefined {
    this._log.trace('getScriptSnapshot', path)

    const content = this.readFile(path)
    return content === undefined ? undefined :
      ScriptSnapshot.fromString(content)
  }

  /* ======================================================================== *
   * FILE AND DIRECTORY OPERATIONS                                            *
   * ======================================================================== */

  readFile(path: string, encoding?: string): string | undefined {
    this._log.trace('readFile', path)

    const [ file, pseudo ] = resolvePseudoPath(path)

    if (pseudo) {
      const transpiled = this._transpiledCache(pseudo.vue, (contents) => {
        return transpile(pseudo.vue, contents)
      })

      if (transpiled === undefined) throw new Error('NO TRANSPILED FOR ' + path)

      if (transpiled === null) {
        switch (pseudo.type) {
          case 'vue': return undefined
          case 'index': return VUE_TS_SHIM
          case 'script': return '// script'
          case 'render': return '// render'
        }
      } else {
        switch (pseudo.type) {
          case 'vue': return undefined
          case 'index': return VUE_JS_SHIM
          case 'script': return transpiled.script
          case 'render': return transpiled.render
        }
      }
    } else if (file) {
      return fileRead(file, encoding as BufferEncoding)
    }
  }

  fileExists(path: string): boolean {
    this._log.trace('fileExists', path)

    const [ file, pseudo ] = resolvePseudoPath(path)

    if (pseudo) {
      switch (pseudo.type) {
        case 'vue':
          return false // never show our ".vue" file
        case 'index':
        case 'script':
        case 'render':
          return true
      }
    } else if (file) {
      return fileExists(file)
    } else {
      return false
    }
  }

  /* ======================================================================== *
   * MODULE RESOLUTION                                                        *
   * ======================================================================== */

  resolveModuleNames(
      moduleNames: string[],
      containingFile: string,
      reusedNames: string[] | undefined,
      redirectedReference: ResolvedProjectReference | undefined,
      options: CompilerOptions,
  ): (ResolvedModule | undefined)[] {
    this._log.trace('resolveModuleNames', moduleNames)

    return moduleNames.map((moduleName) => {
      const module = resolveModuleName(moduleName, containingFile, options, this, this._moduleResolutionCache, redirectedReference)
      return module.resolvedModule
    })
  }

  /* ======================================================================== *
   * STRAIGHT FROM TYPESCRIPT / FILES                                         *
   * ======================================================================== */

  getDefaultLibFileName = (options: CompilerOptions): string => getDefaultLibFilePath(options)

  getCurrentDirectory = cwd
  getNewLine = (): string => OS_EOL
  useCaseSensitiveFileNames = ():boolean => CASE_SENSITIVE_FS
}
