import {
  filesCache,
  resolveFileName,
} from './files'

import {
  Transpiled,
  transpile,
  transpiled,
} from './transpile'

import {
  CompilerHost,
  CompilerOptions,
  ScriptTarget,
  SourceFile,
  createSourceFile,
  getDefaultLibFilePath,
  sys,
} from 'typescript'

import {
  basename,
  dirname,
  sep,
} from 'path'

/* ========================================================================== *
 * TYPESCRIPT COMPILER HOST                                                   *
 * -------------------------------------------------------------------------- *
 * In order to correctly check that the generated render function works with  *
 * the template, we expand any (existing on disk) `/dir/file.vue` file name   *
 * into three pseudo files:                                                   *
 *                                                                            *
 * - `/dir/file.vue/script.ts`  the contents of our <script> tag              *
 * - `/dir/file.vue/render.ts`  the <template> converted to render function   *
 * - `/dir/file.vue/index.ts`   the index file binding the two files above    *
 *   and                                                                      *
 * - `/dir/file.vue`  will also serve as an index, pointing TypeScript to the *
 *                    "./file.vue/script.ts" and "./file.vue/render.ts" files *
 *                    we described above.                                     *
 *                                                                            *
 * We use this structure because of a few reasons:                            *
 *                                                                            *
 * - if `/dir/file.vue` exists on disk, no other directory with the same name *
 *   can exists, so, we're safe when it comes to shadowing the filesystem     *
 *                                                                            *
 * - TypeScript will automagically import `/dir/file.vue/index.ts` while      *
 *   processing `import ...` statement, effectively saving us some work       *
 *                                                                            *
 * - But TypeScript will ignore the rule above when `createProgram(...)`      *
 *   explicitly mentions the `/dir/file.vue`, so we'll also need to preserve  *
 *   this file, and dynamically replacing it with some imports (groan!), as   *
 *   maybe someone, somewhere will want to use this compiler host directly    *
 *                                                                            *
 * So, ultimately, this four-files approach is the cleanest option I could    *
 * find, but I might be missing something, so suggestions welcome!!!          *
 *                                                                            *
 * CAVEAT: we _could_ have used a single file containing script + template    *
 * (this was in fact the original approach) but we easily mess up when mixing *
 * the two scopes (e.g. if the script declares a variable with the same name  *
 * as an import or variable of the generated template - like "render")        *
 * ========================================================================== */

/* ========================================================================== *
 * INTERNAL CONSTANTS, TYPES, FUNCTIONS, ...                                  *
 * ========================================================================== */

/**
 * This is the shim to be used when the Vue component was in JavaScript. It
 * essentially defines a component with nothing in there, and most definitely
 * _not_ pointing to our `render.ts` and `script.ts` pseudo files...
 */
const VUE_JS_SHIM = [
  'import { defineComponent } from "vue";',
  'export default defineComponent({});',
].join('\n')

/**
 * This shim joins our "script" and "template" from a single entry point
 * and is sent back to TypeScript when requesting `/dir/file.vue/index.ts`
 */
const VUE_TS_SHIM_INDEX = [
  'import "./render";',
  'export * from "./script";',
  'import _default_ from "./script";',
  'export default _default_;',
].join('\n')

/**
 * As above, this is another shim, but this time used in lieu of the regular
 * `/dir/file.vue` file.
 *
 * **NOTE** The `__FILENAME__` token in this _must_ be replaced with the
 * _base name_ of the actual template file (e.g. `file.vue`).
 */
const VUE_TS_SHIM_VUE_TEMPLATE = [
  'import "./__FILENAME__/render";',
  'export * from "./__FILENAME__/script";',
  'import _default_ from "./__FILENAME__/script";',
  'export default _default_;',
].join('\n')

/** A quick function converting the shim template above in a proper shim */
function vueTsShimVue(fileName: string) {
  const name = basename(fileName)
  return VUE_TS_SHIM_VUE_TEMPLATE
      .replace(/__FILENAME__/gm, name)
}

/** The extension for the vue files to consider */
const VUE_EXT = '.vue'
/** The length of the `.vue` extension (it's 4, doh!) */
const VUE_LEN = VUE_EXT.length

/** The pseudo-file suffix for the index file, `/index.ts` */
const VUE_PSEUDO_INDEX_SFX = `${sep}index.ts`
/** The pseudo-file extension for the index file, `.vue/index.ts` */
const VUE_PSEUDO_INDEX_EXT = `${VUE_EXT}${VUE_PSEUDO_INDEX_SFX}`
/** The number of characters to cut to convert a pseudo index into a file */
const VUE_PSEUDO_INDEX_LEN = VUE_PSEUDO_INDEX_SFX.length

/** The pseudo-file suffix for the render file, `/render.ts` */
const VUE_PSEUDO_RENDER_SFX = `${sep}render.ts`
/** The pseudo-file extension for the render file, `.vue/render.ts` */
const VUE_PSEUDO_RENDER_EXT = `${VUE_EXT}${VUE_PSEUDO_RENDER_SFX}`
/** The number of characters to cut to convert a pseudo render into a file */
const VUE_PSEUDO_RENDER_LEN = VUE_PSEUDO_RENDER_SFX.length

/** The pseudo-file suffix for the script file, `/script.ts` */
const VUE_PSEUDO_SCRIPT_SFX = `${sep}script.ts`
/** The pseudo-file extension for the script file, `.vue/render.ts` */
const VUE_PSEUDO_SCRIPT_EXT = `${VUE_EXT}${VUE_PSEUDO_SCRIPT_SFX}`
/** The number of characters to cut to convert a pseudo script into a file */
const VUE_PSEUDO_SCRIPT_CUT = VUE_PSEUDO_SCRIPT_SFX.length

/* ========================================================================== */

/** HACK ZONE: hijack the `SourceFile` to include our `Transpiled` instance */
declare module 'typescript/lib/typescript' {
  export interface SourceFile {
    /**
     * The `Transpiled` associated with the source file, or `null` if this file
     * was a JavaScript template, or undefined if it was plain TS/JS/JSON file.
     *
     * @deprecated For real, remove me!
     */
    [transpiled]?: Transpiled | null
  }
}

/**
 * Resolve a potentially non absolute file name into a tuple comprising of
 * `[ fileName, templateFileName ]`.
 *
 * This can return:
 *
 * `[ ]` : the _empty_ tuple indicates that the file doesn't exist on disk
 *
 * `[ fileName ]` : the (now resolved) `fileName` exists on disk, but is not
 *                  a pseudo-file (not part of a Vue template)
 *
 * `[ fileName, templateFileName ]` : the (now resolved) `fileName` refers to a
 *                                    pseudo file, and its contents are derived
 *                                    from the (now resolved) `templateFileName`
 *
 * Examples:
 *
 * - Calling `resolvePseudoFileName('dir/file.vue/render.ts')` will return
 *   `[ '/cwd/dir/file.vue/render.ts', '/cwd/dir/file.vue' ]`
 *
 * - Calling `resolvePseudoFileName('dir/file.vue')` will return
 *   `[ '/cwd/dir/file.vue', '/cwd/dir/file.vue' ]`
 *   _(here `fileName` is the same as the `templateFileName`)_
 *
 * - Calling `resolvePseudoFileName('dir/file.ts')` will return
 *   `[ '/cwd/dir/file.ts' ]`
 *   _(here there is no `templateFileName`)_
 */
function resolvePseudoFileName(maybeRelativeFileName: string): [] | [ string ] | [ string, string ] {
  const fileName = resolveFileName(maybeRelativeFileName)

  let templateFileName: string
  if (fileName.endsWith(VUE_EXT)) {
    templateFileName = fileName
  } else if (fileName.endsWith(VUE_PSEUDO_INDEX_EXT)) {
    templateFileName = fileName.substr(0, fileName.length - VUE_PSEUDO_INDEX_LEN)
  } else if (fileName.endsWith(VUE_PSEUDO_RENDER_EXT)) {
    templateFileName = fileName.substr(0, fileName.length - VUE_PSEUDO_RENDER_LEN)
  } else if (fileName.endsWith(VUE_PSEUDO_SCRIPT_EXT)) {
    templateFileName = fileName.substr(0, fileName.length - VUE_PSEUDO_SCRIPT_CUT)
  } else {
    return sys.fileExists(fileName) ? [ fileName ] : []
  }

  // This _could_ be a pseudo-file, or we can have a directory called "dir.vue"
  if (sys.directoryExists(templateFileName)) {
    return sys.fileExists(fileName) ? [ fileName ] : []
  } else {
    return sys.fileExists(templateFileName) ? [ fileName, templateFileName ] : []
  }
}

/** A type aggregating our four `SourceFile` outputs for a VUE template */
type TemplateSourceFiles = {
  /** The shim for when we're looking for `/dir/file.vue` */
  vue: SourceFile,
  /** The shim for when we're looking for `/dir/file.vue/index.ts` */
  index: SourceFile,
  /** The code generated from <template> for `/dir/file.vue/render.ts` */
  render: SourceFile,
  /** The code generated from <script> for `/dir/file.vue/render.ts` */
  script: SourceFile,
  /** The `Transpiled` associated with this or _null_ for JS components */
  transpiled: Transpiled | null
}

/* ========================================================================== *
 * VUE COMPILER HOST FOR TYPESCRIPT                                           *
 * ========================================================================== */

/** The root of all evil, our Vue TypeScript `CompilerHost` */
export class VueCompilerHost implements CompilerHost {
  private _sourcesCache = filesCache<SourceFile>()
  private _templatesCache = filesCache<TemplateSourceFiles>()

  // Generate (or get a cached instance of) a `SourceFile` for the given file.
  // Here we'll transpile any `.vue` file into _some_ TypeScript code, the
  // properly transpiled source, or an empty shim if the component was written
  // in JavaScript (there was no <script lang="ts"> in there)...
  /** @deprecated don't use it in _this_ code */
  getSourceFile(
      maybeRelativeFileName: string,
      languageVersion: ScriptTarget,
      onError?: (message: string) => void,
      noCache?: boolean,
  ): SourceFile | undefined {
    const [ fileName, templateFileName ] = resolvePseudoFileName(maybeRelativeFileName)

    // No fileName? No SourceFile!
    if (! fileName) return undefined

    // If we don't have a templateFileName, this is a normal typescript file
    if (! templateFileName) {
      return this._sourcesCache(fileName, (fileName, contents) => {
        return createSourceFile(fileName, contents, languageVersion)
      }, onError, noCache)
    }

    // We have a templateFileName, we can try to generate our code...
    const templateSourceFiles = this._templatesCache(templateFileName, (templateFileName, contents) => {
      const transpiled = transpile(templateFileName, contents)

      const indexFileName = templateFileName + VUE_PSEUDO_INDEX_SFX
      const renderFileName = templateFileName + VUE_PSEUDO_RENDER_SFX
      const scriptFileName = templateFileName + VUE_PSEUDO_SCRIPT_SFX

      return transpiled ? {
        vue: createSourceFile(templateFileName, vueTsShimVue(templateFileName), languageVersion),
        index: createSourceFile(indexFileName, VUE_TS_SHIM_INDEX, languageVersion),
        render: createSourceFile(renderFileName, transpiled.render, languageVersion),
        script: createSourceFile(scriptFileName, transpiled.script, languageVersion),
        transpiled,
      } : {
        vue: createSourceFile(templateFileName, VUE_JS_SHIM, languageVersion),
        index: createSourceFile(indexFileName, VUE_JS_SHIM, languageVersion),
        render: createSourceFile(renderFileName, '', languageVersion),
        script: createSourceFile(scriptFileName, '', languageVersion),
        transpiled,
      }
    })

    console.log('GOTCHA', fileName)

    // This should never happen, as we always check for the file's existence
    if (! templateSourceFiles) throw new Error(`Template unavailable for ${templateFileName}???`)

    // Return the correct `SourceFile` for the pseudo file we're looking for
    if (fileName.endsWith(VUE_EXT)) return templateSourceFiles.vue
    if (fileName.endsWith(VUE_PSEUDO_INDEX_SFX)) return templateSourceFiles.index
    if (fileName.endsWith(VUE_PSEUDO_RENDER_SFX)) return templateSourceFiles.render
    if (fileName.endsWith(VUE_PSEUDO_SCRIPT_SFX)) return templateSourceFiles.script

    // Also, this should never happen, as we always check all extensions
    if (! templateSourceFiles) throw new Error(`Invalid pseudo file ${fileName}???`)
  }

  /** @deprecated don't use it in _this_ code */
  writeFile(
      fileName: string,
      // data: string,
      // writeByteOrderMark: boolean,
      // onError?: (message: string) => void,
      // sourceFiles?: readonly SourceFile[],
  ): void {
    throw new Error(`Cowardly refusing to output ${fileName}`)
  }

  /** @deprecated don't use it in _this_ code */
  getCanonicalFileName(maybeRelativeFileName: string): string {
    // Canonical will be used by TypeScript to determine if the file is a ".ts"
    // file, so when we create a program with "file.vue" we need to return
    // "file.vue/index.ts" otherwise TypeScript will tell us "unsupported extension"
    //
    // THAT SAID, it doesn't seem to be using the canonical filename representation
    // later when getting the _actual_ source for the file... Hmmm....
    let fileName = resolveFileName(maybeRelativeFileName)

    if (fileName.endsWith(VUE_EXT) && sys.fileExists(fileName)) {
      fileName = fileName.substr(0, fileName.length - VUE_LEN) + VUE_PSEUDO_INDEX_EXT
    }

    return sys.useCaseSensitiveFileNames ? fileName : fileName.toLowerCase()
  }

  /** @deprecated don't use it in _this_ code */
  fileExists(maybeRelativeFileName: string): boolean {
    const [ fileName ] = resolvePseudoFileName(maybeRelativeFileName)
    return fileName != undefined
  }

  /** @deprecated don't use it in _this_ code */
  readFile(maybeRelativeFileName: string): string | undefined {
    const [ fileName, templateFileName ] = resolvePseudoFileName(maybeRelativeFileName)
    if (templateFileName !== undefined) return sys.readFile(templateFileName)
    if (fileName !== undefined ) return sys.readFile(fileName)
  }

  /** @deprecated don't use it in _this_ code */
  getDefaultLibFileName(options: CompilerOptions): string {
    return getDefaultLibFilePath(options) // we need the full path
  }

  /** @deprecated don't use it in _this_ code */
  getDefaultLibLocation(): string {
    const executingFilePath = sys.getExecutingFilePath()
    const tsLibraryPath = dirname(executingFilePath)
    return resolveFileName(tsLibraryPath)
  }

  /** @deprecated don't use it in _this_ code */
  getCurrentDirectory(): string {
    return sys.getCurrentDirectory()
  }

  /** @deprecated don't use it in _this_ code */
  useCaseSensitiveFileNames(): boolean {
    return sys.useCaseSensitiveFileNames
  }

  /** @deprecated don't use it in _this_ code */
  getNewLine(): string {
    return sys.newLine
  }
}
