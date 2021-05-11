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
 * INTERNAL CONSTANTS & TYPES                                                 *
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
const VUE_TS_SHIM_FILE_TEMPLATE = [
  'import "./__FILENAME__/render";',
  'export * from "./__FILENAME__/script";',
  'import _default_ from "./__FILENAME__/script";',
  'export default _default_;',
].join('\n')

/** The extension for the vue files to consider */
const VUE_EXT = '.vue'
/** The length of the `.vue` extension (it's 4, doh!) */
const VUE_LEN = VUE_EXT.length
/** The pseudo-file extension for the index file, `.vue/index.ts` */
const VUE_PSEUDO_INDEX_EXT = `${VUE_EXT}${sep}index.ts`
/** The number of characters to cut to convert a pseudo index into a file */
const VUE_PSEUDO_INDEX_CUT = VUE_PSEUDO_INDEX_EXT.length - VUE_LEN
/** The pseudo-file extension for the render file, `.vue/render.ts` */
const VUE_PSEUDO_RENDER_EXT = `${VUE_EXT}${sep}render.ts`
/** The number of characters to cut to convert a pseudo render into a file */
const VUE_PSEUDO_RENDER_CUT = VUE_PSEUDO_RENDER_EXT.length - VUE_LEN
/** The pseudo-file extension for the script file, `.vue/render.ts` */
const VUE_PSEUDO_SCRIPT_EXT = `${VUE_EXT}${sep}script.ts`
/** The number of characters to cut to convert a pseudo script into a file */
const VUE_PSEUDO_SCRIPT_CUT = VUE_PSEUDO_SCRIPT_EXT.length - VUE_LEN

/* ========================================================================== */

/**
 * The result of the resolution of a pseudo file-name.
 *
 * This union can be one of:
 * - { fileName: undefined, templateFileName: undefined } // file not found
 * - { fileName: string,    templateFileName: undefined } // non-pseudo file
 * - { fileName: string,    templateFileName: string }    // pseudo-file
 */
type ResolvedPseudoFile =
    { fileName: string, templateFileName?: string } |
    { fileName: string | undefined, templateFileName?: undefined }

/** A constant for _file not found_ */
const NOT_FOUND: ResolvedPseudoFile = { fileName: undefined }

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
 * Return the _actual_ template file name `/dir/file.vue` from a pseudo file
 * name (e.g. `/dir/file.vue/index.ts`) if and only if it exists on disk
*/
function resolvePseudoFileName(maybeRelativeFileName: string): ResolvedPseudoFile {
  const fileName = resolveFileName(maybeRelativeFileName)

  let templateFileName: string
  if (fileName.endsWith(VUE_EXT)) {
    return sys.fileExists(fileName) ? { fileName, templateFileName: fileName } : NOT_FOUND // not our extensions
    // return NOT_FOUND // no ".vue" _file_ is allowed to exist in our pseudo tree
  } else if (fileName.endsWith(VUE_PSEUDO_INDEX_EXT)) {
    templateFileName = fileName.substr(0, fileName.length - VUE_PSEUDO_INDEX_CUT)
  } else if (fileName.endsWith(VUE_PSEUDO_RENDER_EXT)) {
    templateFileName = fileName.substr(0, fileName.length - VUE_PSEUDO_RENDER_CUT)
  } else if (fileName.endsWith(VUE_PSEUDO_SCRIPT_EXT)) {
    templateFileName = fileName.substr(0, fileName.length - VUE_PSEUDO_SCRIPT_CUT)
  } else {
    return sys.fileExists(fileName) ? { fileName } : NOT_FOUND // not our extensions
  }

  // This _could_ be a pseudo-file, or we can have a directory called "dir.vue"
  if (sys.directoryExists(templateFileName)) {
    return sys.fileExists(fileName) ? { fileName } : NOT_FOUND
  } else {
    return sys.fileExists(templateFileName) ? { fileName, templateFileName } : NOT_FOUND
  }
}

const MARK = '/Users/pier/Developer/juitnow/web-frontend-main/src/'

/** The root of all evil, our Vue TypeScript `CompilerHost` */
export class VueCompilerHost implements CompilerHost {
  // private _cache = filesCache<SourceFile>()

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
    if (maybeRelativeFileName.match(/\.vue(\/|$)/)) {
      console.log('GETSOURCE', maybeRelativeFileName, resolvePseudoFileName(maybeRelativeFileName))
    }

    const { fileName, templateFileName } = resolvePseudoFileName(maybeRelativeFileName)

    // No file name ? NO SOURCE
    if (! fileName) return undefined

    if (! templateFileName) {
      const sourceContents = sys.readFile(fileName)
      if (sourceContents === undefined) return undefined
      return createSourceFile(fileName, sourceContents, languageVersion)
    }

    const templateSource = sys.readFile(templateFileName)
    if (templateSource === undefined) return undefined

    const template = transpile(templateFileName, templateSource)

    if (fileName.endsWith(VUE_PSEUDO_INDEX_EXT)) {
      if (template === null) return createSourceFile(fileName, VUE_JS_SHIM, languageVersion)
      console.log('SHIM1 SHIM1', '\n' + VUE_TS_SHIM_INDEX)
      return createSourceFile(fileName, VUE_TS_SHIM_INDEX, languageVersion)
    } else if (fileName.endsWith(VUE_PSEUDO_RENDER_EXT)) {
      if (template === null) return undefined
      console.log('RENDER RENDER', '\n' + template.render)
      return createSourceFile(fileName, template.render, languageVersion)
    } else if (fileName.endsWith(VUE_PSEUDO_SCRIPT_EXT)) {
      if (template === null) return undefined
      console.log('SCRIPT SCRIPT', '\n' + template.script)
      return createSourceFile(fileName, template.script, languageVersion)
    } else if (fileName.endsWith(VUE_EXT)) {
      const name = basename(fileName)
      const shim = VUE_TS_SHIM_FILE_TEMPLATE.replace(/__FILENAME__/gm, name)
      console.log('SHIM2 SHIM2', '\n' + shim)
      return createSourceFile(fileName, shim, languageVersion)
      // return
    }

    // const sourceFileName = templateFileName || fileName

    // if (fileName?.endsWith('.vue')) {
    //   return this.getSourceFile(
    //       maybeRelativeFileName + '/index.ts',
    //       languageVersion,
    //       onError,
    //       noCache,
    //   )
    // }

    // if (sourceFileName === undefined) return undefined

    // return this._cache(sourceFileName, (fileName, sourceContents) => {
    //   if (maybeRelativeFileName.match(/\.vue(\/|$)/) || fileName.startsWith(MARK)) {
    //     console.log('CREATE', { fileName, templateFileName, sourceFileName })
    //   }

    // If this is _not_ a Vue file, we return it straigh away
    // if (!(fileName.endsWith('.vue') || fileName.endsWith('.vue/index.ts'))) {
    //   return createSourceFile(fileName, sourceContents, languageVersion)
    // }

    // This is a Vue file, we have some transpiling to do...
    // const xpiled = transpile(fileName, sourceContents)
    // const content = xpiled ? VUE_TS_TEMPLATE_SHIM : VUE_JS_TEMPLATE_SHIM

    // const file = createSourceFile(fileName, content, languageVersion)
    // file[transpiled] = xpiled
    // return file

    // }, onError, noCache)
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

    if (! sys.useCaseSensitiveFileNames) fileName = fileName.toLowerCase()

    if (fileName.match(/\.vue(\/|$)/)) {
      console.log('RESOLVE', maybeRelativeFileName)
      console.log('-------', fileName)
    }

    return fileName
  }

  /** @deprecated don't use it in _this_ code */
  fileExists(maybeRelativeFileName: string): boolean {
    if (maybeRelativeFileName.match(/\.vue(\/|$)/)) {
      console.log('EXISTS', maybeRelativeFileName, resolvePseudoFileName(maybeRelativeFileName))
    }
    const { fileName } = resolvePseudoFileName(maybeRelativeFileName)
    return fileName != undefined
  }

  /** @deprecated don't use it in _this_ code */
  readFile(maybeRelativeFileName: string): string | undefined {
    if (maybeRelativeFileName.match(/\.vue(\/|$)/)) {
      console.log('READ', maybeRelativeFileName, resolvePseudoFileName(maybeRelativeFileName))
    }
    const { fileName, templateFileName } = resolvePseudoFileName(maybeRelativeFileName)
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
