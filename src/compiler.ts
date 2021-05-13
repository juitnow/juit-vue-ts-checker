import { createCache } from './lib/cache'
import { logger } from './lib/logger'
import { pseudoPath, pseudoType } from './lib/pseudo'

import {
  CompilerOptions,
  IScriptSnapshot,
  LanguageServiceHost,
  ModuleResolutionCache,
  ModuleResolutionHost,
  ResolvedModule,
  ResolvedProjectReference,
  ScriptSnapshot,
  createModuleResolutionCache,
  getDefaultCompilerOptions,
  getDefaultLibFilePath,
  resolveModuleName,
} from 'typescript'

import {
  Transpiled,
  transpile,
} from './transpile'

import {
  CASE_SENSITIVE_FS,
  OS_EOL,
  cwd,
  fileExists,
  fileLastModified,
  fileRead,
  resolve,
  ResolvedPath,
} from './lib/files'
import { SourceMapConsumer } from 'source-map'

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

/** A _shim_ that will be returned for `/dir/file.vue/index.ts` */
const VUE_SHIM = [
  'import "./render";',
  'export * from "./script";',
  'import _default_ from "./script";',
  'export default _default_;',
].join('\n')


export class VueLanguageServiceHost implements LanguageServiceHost, ModuleResolutionHost {
  private readonly _compilationSettings: CompilerOptions
  private readonly _moduleResolutionCache: ModuleResolutionCache

  private readonly _log = logger('language service')
  private readonly _transpiledCache = createCache<Transpiled>()
  private readonly _scripts = new Set<string>()

  constructor(options?: CompilerOptions) {
    this._compilationSettings = options || getDefaultCompilerOptions()
    this._moduleResolutionCache = createModuleResolutionCache(cwd(), resolve, options)
  }

  /* ======================================================================== *
   * SIMPLE GETTERS                                                           *
   * ======================================================================== */

  getCompilationSettings(): CompilerOptions {
    return this._compilationSettings
  }

  /* ======================================================================== *
   * ROOT SCRIPTS                                                             *
   * ======================================================================== */

  addScriptFileName(path: string): ResolvedPath[] {
    const pseudo = pseudoPath(path)

    if (pseudo.type) {
      this._scripts.add(pseudo.index)
      this._scripts.add(pseudo.render)
      this._scripts.add(pseudo.script)
      return [ pseudo.index, pseudo.render, pseudo.script ]
    } else if (pseudo.file) {
      this._scripts.add(pseudo.file)
      return [ pseudo.file ]
    } else {
      return []
    }
  }

  getScriptFileNames(): string[] {
    return Array.from(this._scripts)
  }

  getSourceMapConsumer(path: string): SourceMapConsumer | undefined {
    const [ file, type ] = pseudoType(path)
    if (file && type) {
      const transpiled = this._transpiledCache.get(file)
      if (! transpiled) return

      if (type === 'render') {
        if (! transpiled.renderSourceMapConsumer) {
          transpiled.renderSourceMapConsumer = new SourceMapConsumer(transpiled.renderSourceMap)
        }
        return transpiled.renderSourceMapConsumer
      } else if (type === 'script') {
        if (! transpiled.scriptSourceMapConsumer) {
          transpiled.scriptSourceMapConsumer = new SourceMapConsumer(transpiled.scriptSourceMap)
        }
        return transpiled.scriptSourceMapConsumer
      }
    }
  }

  /* ======================================================================== *
   * SCRIPT VERSION AND SNAPSHOT                                              *
   * ======================================================================== */

  getScriptVersion(path: string): string {
    const pseudo = pseudoPath(path)

    const lastModified =
      pseudo.file ? fileLastModified(pseudo.file) :
      undefined

    return lastModified?.toString() || 'not-found'
  }

  getScriptSnapshot(path: string): IScriptSnapshot | undefined {
    const content = this.readFile(path)
    return content === undefined ? undefined :
      ScriptSnapshot.fromString(content)
  }

  /* ======================================================================== *
   * FILE AND DIRECTORY OPERATIONS                                            *
   * ======================================================================== */

  readFile(path: string, encoding?: string): string | undefined {
    const pseudo = pseudoPath(path)

    if (pseudo.type) {
      const transpiled = this._transpiledCache(pseudo.file, (contents) => {
        return transpile(pseudo.file, contents)
      })

      if (transpiled) {
        switch (pseudo.type) {
          case 'index': return VUE_SHIM
          case 'script': return transpiled.script
          case 'render': return transpiled.render
        }
      }
    } else if (pseudo.file) {
      return fileRead(pseudo.file, encoding as BufferEncoding)
    }
  }

  fileExists(path: string): boolean {
    const pseudo = pseudoPath(path)

    if (pseudo.type) {
      switch (pseudo.type) {
        case 'vue':
          return false // never show our ".vue" file
        case 'index':
        case 'script':
        case 'render':
          return true
      }
    } else if (pseudo.file) {
      return fileExists(pseudo.file)
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
