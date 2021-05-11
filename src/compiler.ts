import {
  filesCache,
  resolveFileName,
} from './files'

import {
  Transpiled,
  transpile,
  transpiled,
} from './transpile'

import ts, {
  CompilerHost,
  CompilerOptions,
  ScriptTarget,
  SourceFile,
  createSourceFile,
  getDefaultLibFilePath,
  sys,
} from 'typescript'

import {
  dirname,
  sep,
} from 'path'
import { template } from '@babel/core'

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
 *                                                                            *
 * We use this structure because of a few reasons:                            *
 *                                                                            *
 * - if `/dir/file.vue` exists on disk, no other directory with the same name *
 *   can exists, so, we're safe when it comes to shadowing the filesystem     *
 *                                                                            *
 * - TypeScript will automagically import `/dir/file.vue/index.ts` when it    *
 *   can not find the file on disk, so by tweaking the way our `fileExists`   *
 *   below work, we can make TypeScript believe it's importing the directory  *
 *                                                                            *
 * - We _could_ use a single file containing script + template (this was the  *
 *   original approach) but we easily mess up if the script declares a        *
 *   variable with the same name as an import or variable of the generated    *
 *   template (we don't want to mess with scopes, really!)                    *
 *                                                                            *
 * So, ultimately, this three-files approach is the cleanest option I could   *
 * find, but I might be missing something, so suggestions welcome!!!          *
 * ========================================================================== */

/** This is the shim to be used when the Vue component was in JavaScript */
const VUE_JS_TEMPLATE_SHIM = [
  'import { defineComponent } from "vue";',
  'export default defineComponent({});',
].join('\n')

/** This shim joins our "script" and "template" as a single component */
const VUE_TS_TEMPLATE_SHIM = [
  'export * from "./script";',
  'export * from "./render";',
  'import script from "./script";',
  'export default script;',
].join('\n')

/** HACK ZONE: hijack the `SourceFile` to include our `Transpiled` instance */
declare module 'typescript/lib/typescript' {
  export interface SourceFile {
    /**
     * The `Transpiled` associated with the source file, or `null` if this file
     * was a JavaScript template, or undefined if it was plain TS/JS/JSON file.
     */
    [transpiled]?: Transpiled | null
  }
}

/**
 * Return the _actual_ template file name `/dir/file.vue` from a pseudo file
 * name (e.g. `/dir/file.vue/index.ts`) if and only if it exists on disk
*/
function resolvePseudoFileName(maybeRelativeFileName: string): string | undefined {
  const fileName = resolveFileName(maybeRelativeFileName)

  if (fileName.endsWith('.vue')) {
    return undefined // no ".vue" file is allowed to exist in our pseudo tree
  } else if (fileName.endsWith(`.vue${sep}index.ts`)) {
    const templateFileName = fileName.substr(0, fileName.length - 9)
    return sys.fileExists(templateFileName) ? templateFileName : undefined
  } else if (fileName.endsWith(`.vue${sep}render.ts`)) {
    const templateFileName = fileName.substr(0, fileName.length - 10)
    return sys.fileExists(templateFileName) ? templateFileName : undefined
  } else if (fileName.endsWith(`.vue${sep}script.ts`)) {
    const templateFileName = fileName.substr(0, fileName.length - 10)
    return sys.fileExists(templateFileName) ? templateFileName : undefined
  } else {
    return sys.fileExists(fileName) ? fileName : undefined
  }
}

/** The root of all evil, our Vue TypeScript `CompilerHost` */
export class VueCompilerHost implements CompilerHost {
  private _cache = filesCache<SourceFile>()

  // Generate (or get a cached instance of) a `SourceFile` for the given file.
  // Here we'll transpile any `.vue` file into _some_ TypeScript code, the
  // properly transpiled source, or an empty shim if the component was written
  // in JavaScript (there was no <script lang="ts"> in there)...
  /** @deprecated don't use it in _this_ code */
  getSourceFile(
      _fileName: string,
      languageVersion: ScriptTarget,
      onError?: (message: string) => void,
      noCache?: boolean,
  ): SourceFile | undefined {
    return this._cache(_fileName, (fileName, sourceContents) => {
      if (_fileName.match(/\.vue($|\/)/)) console.log('GETTING', _fileName)

      // If this is _not_ a Vue file, we return it straigh away
      if (!(fileName.endsWith('.vue') || fileName.endsWith('.vue/index.ts'))) {
        return createSourceFile(fileName, sourceContents, languageVersion)
      }

      // This is a Vue file, we have some transpiling to do...
      const xpiled = transpile(fileName, sourceContents)
      const content = xpiled ? VUE_TS_TEMPLATE_SHIM : VUE_JS_TEMPLATE_SHIM

      const file = createSourceFile(fileName, content, languageVersion)
      file[transpiled] = xpiled
      return file
    }, onError, noCache)
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
    if (maybeRelativeFileName.match(/\.vue($|\/)/)) console.log('CANONICAL1', maybeRelativeFileName)

    let fileName = resolveFileName(maybeRelativeFileName)

    // Canonicalization of `/dir/file.vue` into `/dir/file.vue/index.ts`
    if (fileName.endsWith('.vue') && sys.fileExists(fileName)) {
      fileName = `${fileName}${sep}index.ts`
    }

    if (maybeRelativeFileName.match(/\.vue($|\/)/)) console.log('CANONICAL2', maybeRelativeFileName, fileName, sys.useCaseSensitiveFileNames)

    // In case the filesystem is case insensitive, we return the lower
    // case version of the file (we trust TypeScript for checking this)
    if (sys.useCaseSensitiveFileNames) return fileName
    return fileName.toLowerCase()
  }

  /** @deprecated don't use it in _this_ code */
  fileExists(maybeRelativeFileName: string): boolean {
    const fileName = resolvePseudoFileName(maybeRelativeFileName)
    if (maybeRelativeFileName.match(/\.vue($|\/)/)) {
      console.log('EXISTS', maybeRelativeFileName, fileName)
    }
    return fileName != undefined
  }

  /** @deprecated don't use it in _this_ code */
  readFile(maybeRelativeFileName: string): string | undefined {
    const fileName = resolvePseudoFileName(maybeRelativeFileName)
    if (maybeRelativeFileName.match(/\.vue($|\/)/)) {
      console.log('READ', maybeRelativeFileName, fileName)
    }
    return fileName ? ts.sys.readFile(fileName) : undefined
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
