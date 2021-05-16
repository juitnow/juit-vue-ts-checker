import { colors } from './lib/colors'
import { createCache } from './lib/cache'
import { logger } from './lib/logger'
import { transpile } from './transpile'

import {
  RawSourceMap,
  SourceMapConsumer,
} from 'source-map'

import {
  isPseudoPathFound,
  isPseudoPathNotFound,
  isVuePath,
  pseudoPath,
} from './lib/pseudo'

import {
  CompilerOptions,
  IScriptSnapshot,
  LanguageServiceHost,
  ModuleResolutionCache,
  ModuleResolutionHost,
  Path,
  ResolvedModule,
  ResolvedProjectReference,
  ScriptSnapshot,
  createModuleResolutionCache,
  getDefaultCompilerOptions,
  getDefaultLibFilePath,
  resolveModuleName,
} from 'typescript'

import {
  CASE_SENSITIVE_FS,
  OS_EOL,
  cwd,
  resolve,
} from './lib/files'

const log = logger('language host')
const { k, f } = colors()

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

  /** The contents cache is keyed by the _pseudo_ file */
  private readonly _cache = createCache<IScriptSnapshot>()
  /** `RawSourceMap`s cache, based on fully resolved paths */
  private readonly _rawSourceMaps: Record<string, RawSourceMap> = {}
  /** `SourceMapConsumer`s cache, based on fully resolved paths (lazyly initialized) */
  private readonly _sourceMapConsumers: Record<string, SourceMapConsumer> = {}

  /** Our set of root scripts */
  private readonly _scripts = new Set<Path>()

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

  addScriptFileName(file: string): Path[] {
    const pseudo = pseudoPath(file)

    if (isVuePath(pseudo)) {
      this._scripts.add(pseudo.index)
      this._scripts.add(pseudo.render)
      this._scripts.add(pseudo.script)
      return [ pseudo.render, pseudo.script ]
    } else {
      this._scripts.add(pseudo.path)
      return [ pseudo.path ]
    }
  }

  getScriptFileNames(): string[] {
    return Array.from(this._scripts)
  }

  /* ======================================================================== *
   * SOURCE MAPS AND SOURCE MAP CONSUMERS                                     *
   * ======================================================================== */

  getSourceMapConsumer(file: string): SourceMapConsumer | undefined {
    const path = resolve(file)

    if (path in this._sourceMapConsumers) return this._sourceMapConsumers[path]
    if (path in this._rawSourceMaps) {
      const rawSourceMap = this._rawSourceMaps[path]
      const sourceMapConsumer = new SourceMapConsumer(rawSourceMap)
      this._sourceMapConsumers[path] = sourceMapConsumer
      return sourceMapConsumer
    }
  }

  /* ======================================================================== *
   * READING AND CACHING OF FILES BASED ON SNAPSHOTS                          *
   * ======================================================================== */

  private _readSnapshot(file: string, encoding?: string): IScriptSnapshot | undefined {
    const [ pseudo, result ] = this._cache(file, (pseudo, contents) => {
      if (isVuePath(pseudo)) {
        log.info('Transpiling', f(pseudo.vue), k(`(${contents.length} chars)`))

        const transpiled = transpile(pseudo.vue, contents)

        const vueSnapsot = ScriptSnapshot.fromString(contents)
        const indexSnapshot = ScriptSnapshot.fromString(VUE_SHIM)
        const renderSnapshot = ScriptSnapshot.fromString(transpiled.render)
        const scriptSnapshot = ScriptSnapshot.fromString(transpiled.script)

        this._cache.set(pseudo.vue, vueSnapsot, pseudo.timestamp)
        this._cache.set(pseudo.index, indexSnapshot, pseudo.timestamp)
        this._cache.set(pseudo.render, renderSnapshot, pseudo.timestamp)
        this._cache.set(pseudo.script, scriptSnapshot, pseudo.timestamp)

        this._rawSourceMaps[pseudo.render] = transpiled.renderSourceMap
        this._rawSourceMaps[pseudo.script] = transpiled.scriptSourceMap

        switch (pseudo.type) {
          case 'vue': return vueSnapsot
          case 'index': return indexSnapshot
          case 'render': return renderSnapshot
          case 'script': return scriptSnapshot
        }
      } else {
        log.debug('Reading', f(pseudo.path), k(`(${contents.length} chars)`))
        return ScriptSnapshot.fromString(contents)
      }
    }, encoding as BufferEncoding)

    if (result) {
      return result
    } else if (isVuePath(pseudo)) {
      // We don't purge source maps... The last one found is valid even if the
      // file got deleted between _now_ and when we ask for reports...
      this._cache.del(pseudo.vue)
      this._cache.del(pseudo.index)
      this._cache.del(pseudo.render)
      this._cache.del(pseudo.script)
    } else {
      this._cache.del(pseudo.path)
    }
  }

  /* ======================================================================== *
   * FILE AND DIRECTORY OPERATIONS                                            *
   * ======================================================================== */

  getScriptVersion(file: string): string {
    const pseudo = pseudoPath(file)

    if (isPseudoPathFound(pseudo)) {
      return pseudo.timestamp.toString()
    } else {
      return 'not-found-' + Date.now()
    }
  }

  getScriptSnapshot(file: string): IScriptSnapshot | undefined {
    return this._readSnapshot(file)
  }

  readFile(file: string, encoding?: string): string | undefined {
    const snapshot = this._readSnapshot(file, encoding)
    if (snapshot) return snapshot.getText(0, snapshot.getLength())
  }

  fileExists(file: string): boolean {
    const pseudo = pseudoPath(file)

    if (isPseudoPathNotFound(pseudo)) {
      return false
    } else if (isVuePath(pseudo)) {
      switch (pseudo.type) {
        case 'vue':
          return false // never show our ".vue" file
        case 'index':
        case 'script':
        case 'render':
          return true
      }
    } else {
      return true
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
