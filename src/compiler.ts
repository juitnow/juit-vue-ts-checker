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
  dirname,
} from 'path'

/* ========================================================================== *
 * TYPESCRIPT COMPILER HOST                                                   *
 * ========================================================================== */

/** This is a shim to be used when the Vue component was in JavaScript */
const VUE_JS_TEMPLATE_SHIM = [
  'import type { DefineComponent } from "vue";',
  'declare const component: DefineComponent<{}, {}>;',
  'export default component;',
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
      // If this is _not_ a Vue file, we return it straigh away
      if (!(fileName.endsWith('.vue') || fileName.endsWith('.vue/index.ts'))) {
        return createSourceFile(fileName, sourceContents, languageVersion)
      }

      // This is a Vue file, we have some transpiling to do...
      const xpiled = transpile(fileName, sourceContents)
      const content = xpiled ? xpiled.content : VUE_JS_TEMPLATE_SHIM

      const file = createSourceFile(fileName, content, languageVersion)
      file[transpiled] = xpiled
      return file
    }, onError, noCache)
  }

  /** @deprecated don't use it in _this_ code */
  writeFile(
      fileName: string,
      data: string,
      writeByteOrderMark: boolean,
      onError?: (message: string) => void,
      sourceFiles?: readonly SourceFile[],
  ): void {
    // NO-OP: no writing, just checking!
    void sourceFiles
  }

  /** @deprecated don't use it in _this_ code */
  getCanonicalFileName(fileName: string): string {
    if (fileName.endsWith('.vue')) {
      if (sys.fileExists(fileName)) fileName += '/index.ts'
    }

    const resolvedFileName = resolveFileName(fileName)
    if (sys.useCaseSensitiveFileNames) return resolvedFileName
    return resolvedFileName.toLowerCase()
  }

  // Check if a file exists... According to the rules above we migth
  // have to strip the "/index.ts" from
  /** @deprecated don't use it in _this_ code */
  fileExists(fileName: string): boolean {
    const resolvedFileName = resolveFileName(fileName)

    // If the file exists on disk, then no further questions
    if (sys.fileExists(resolvedFileName)) return true

    // If the file is our magical "file.vue/index.ts" then check it
    if (resolvedFileName.endsWith('.vue/index.ts')) {
      return sys.fileExists(resolvedFileName.substr(0, resolvedFileName.length - 9))
    } else {
      return false
    }
  }

  /** @deprecated don't use it in _this_ code */
  readFile(fileName: string): string | undefined {
    const resolvedFileName = resolveFileName(fileName)

    // If the file exists on disk, then no further questions
    const contents = sys.readFile(resolvedFileName)
    if (contents !== undefined) return contents

    // If the file is our magical "file.vue/index.ts" then check it
    if (resolvedFileName.endsWith('.vue/index.ts')) {
      return sys.readFile(resolvedFileName.substr(0, resolvedFileName.length - 9))
    }
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
