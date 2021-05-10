/* eslint-disable no-inner-declarations */
import path from 'path'

import { Transpiled, transpile } from './transpile'

import { SourceMapConsumer } from 'source-map'

import {
  CompilerHost,
  CompilerOptions,
  convertCompilerOptionsFromJson,
  createProgram,
  flattenDiagnosticMessageText,
  createSourceFile,
  getDefaultLibFilePath,
  getPreEmitDiagnostics,
  readConfigFile,
  ScriptTarget,
  SourceFile,
  sys as tsSys,
  DiagnosticCategory,
  getLineAndCharacterOfPosition,
} from 'typescript'

/* ========================================================================== *
 * EXPORTED TYPES                                                             *
 * ========================================================================== */

/** Our main interface for reports */
export interface Report {
  /** The TypeScript error code (TSxxxx) */
  code: number,
  /** The message associated with this report */
  message: string,
  /** The severity of this report */
  severity: 'error' | 'message' | 'suggestion' | 'warning' | 'unknown',
  /** Set to _true_ if this report is an _error_ report */
  isError?: true,
  /** Set to _true_ if this report is a _warning_ report */
  isWarning?: true,
  /** The file name (if known) associated with this report */
  fileName?: string,
  /** The optional location of this report */
  location?: {
    line: number,
    column: number,
    context: string,
    contextLength: number,
  }
}

/* ========================================================================== *
 * TYPESCRIPT COMPILER HOST                                                   *
 * ========================================================================== */

function reportLocationForPosition(
    file: SourceFile,
    start: number,
    length?: number,
): Report['location'] | undefined {
  const position = getLineAndCharacterOfPosition(file, start)

  const lineStart = file.getLineStarts()[position.line]
  const lineEnd = file.getLineEndOfPosition(start)

  const contextLine = file.getFullText().substring(lineStart, lineEnd)
  let contextLength = length || 0

  // If the end goes beyond one line, cut it to the end of it
  if ((position.character + contextLength) > contextLine.length) {
    contextLength = contextLine.length - position.character
  }

  // All done!
  return {
    line: position.line + 1,
    column: position.character,
    context: contextLine,
    contextLength: contextLength,
  }
}

function reportLocationForTranspiledPosition(
    file: SourceFile,
    transpiled: Transpiled,
    start: number,
    length?: number,
): Report['location'] | undefined {
  const position = getLineAndCharacterOfPosition(file, start)

  // Make sure we have a source map consumer (lazy init)
  if (! transpiled.sourceMapConsumer) {
    transpiled.sourceMapConsumer = new SourceMapConsumer(transpiled.sourceMap)
  }

  // Get the original position in the template
  const originalPosition = transpiled.sourceMapConsumer.originalPositionFor({
    line: position.line + 1,
    column: position.character,
  })

  // If we don't know the original position, or the original line... pointless
  if (!(originalPosition && originalPosition.line)) return

  // Make sure we have some lines (lazy init)
  if (! transpiled.templateLines) {
    transpiled.templateLines = transpiled.template.split('\n')
  }

  // Get our context line
  const { line, column = 0 } = originalPosition
  const contextLine = transpiled.templateLines[line - 1]

  // Use a regenerated position's last column to calculate the length (if any)
  let contextLength = length || 0

  // If the end goes beyond one line, cut it to the end of it
  if ((column + contextLength) > contextLine.length) {
    contextLength = contextLine.length - column
  }

  // All done!
  return {
    line: line,
    column: column,
    context: contextLine,
    contextLength: contextLength,
  }
}

const VUE_JS_TEMPLATE_SHIM = [
  'import type { DefineComponent } from "vue";',
  'declare const component: DefineComponent<{}, {}>;',
  'export default component;',
].join('\n')

const VUE_JS_TEMPLATE = Symbol()

export class VueCompilerHost implements CompilerHost {
  private _getSourceFileCache: Record<string, SourceFile | undefined> = {}
  private _transpiledCache: Record<string, Transpiled> = {}

  readonly compilerOptions: CompilerOptions

  constructor(tsConfigFileName: string) {
    const json = readConfigFile(tsConfigFileName, this.readFile.bind(this))
    const converted = convertCompilerOptionsFromJson(json.config.compilerOptions, tsSys.getCurrentDirectory())
    this.compilerOptions = converted.options
  }

  /* ======================================================================== */

  private _createSourceFile(
      fileName: string,
      languageVersion: ScriptTarget,
      onError?: (message: string) => void,
  ): SourceFile | undefined {
    const sourceContents = this.readFile(fileName)
    if (sourceContents === undefined) return

    fileName = this.getCanonicalFileName(fileName)

    if (fileName.endsWith('.vue') || fileName.endsWith('.vue/index.ts')) {
      try {
        const transpiled = transpile(fileName, sourceContents)
        if (transpiled != null) {
          this._transpiledCache[fileName] = transpiled
          return createSourceFile(fileName, transpiled.content, languageVersion)
        } else {
          const file = createSourceFile(fileName, VUE_JS_TEMPLATE_SHIM, languageVersion)
          Object.defineProperty(file, VUE_JS_TEMPLATE, { value: true })
          return file
        }
      } catch (error) {
        if (onError) onError(error.message || error)
        else throw error
      }
    } else {
      return createSourceFile(fileName, sourceContents, languageVersion)
    }
  }

  private _resolveFileName(fileName: string): string {
    return path.resolve(this.getCurrentDirectory(), fileName)
  }

  private _relativeFileName(fileName: string): string {
    const resolvedFileName = this._resolveFileName(fileName)

    const pathPrefix = this.getCurrentDirectory() + path.sep
    return resolvedFileName.startsWith(pathPrefix) ?
      resolvedFileName.substr(pathPrefix.length) :
      resolvedFileName
  }

  /* ======================================================================== */

  getSourceFile(
      fileName: string,
      languageVersion: ScriptTarget,
      onError?: (message: string) => void,
      shouldCreateNewSourceFile?: boolean,
  ): SourceFile | undefined {
    if (shouldCreateNewSourceFile) {
      return this._createSourceFile(fileName, languageVersion)
    }

    if (fileName in this._getSourceFileCache) {
      return this._getSourceFileCache[fileName]
    } else {
      const sourceFile = this._createSourceFile(fileName, languageVersion, onError)
      return this._getSourceFileCache[fileName] = sourceFile
    }
  }

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

  // Our "canonical" name of a "file.vue" file name is "file.vue/index.ts"
  // (so that we won't get into trouble when another file is accidentally
  // called "file.vue.ts"). TypeScript will atomatically search this path
  // when processing includes, soooo... We're happy!
  getCanonicalFileName(fileName: string): string {
    if (fileName.endsWith('.vue')) {
      if (tsSys.fileExists(fileName)) fileName += '/index.ts'
    }

    const resolvedFileName = this._resolveFileName(fileName)
    if (tsSys.useCaseSensitiveFileNames) return resolvedFileName
    return resolvedFileName.toLowerCase()
  }

  // Check if a file exists... According to the rules above we migth
  // have to strip the "/index.ts" from
  fileExists(fileName: string): boolean {
    const resolvedFileName = this._resolveFileName(fileName)

    // If the file exists on disk, then no further questions
    if (tsSys.fileExists(resolvedFileName)) return true

    // If the file is our magical "file.vue/index.ts" then check it
    if (resolvedFileName.endsWith('.vue/index.ts')) {
      return tsSys.fileExists(resolvedFileName.substr(0, resolvedFileName.length - 9))
    } else {
      return false
    }
  }

  readFile(fileName: string): string | undefined {
    const resolvedFileName = this._resolveFileName(fileName)

    // If the file exists on disk, then no further questions
    const contents = tsSys.readFile(resolvedFileName)
    if (contents !== undefined) return contents

    // If the file is our magical "file.vue/index.ts" then check it
    if (resolvedFileName.endsWith('.vue/index.ts')) {
      return tsSys.readFile(resolvedFileName.substr(0, resolvedFileName.length - 9))
    }
  }

  getDefaultLibFileName(options: CompilerOptions): string {
    return getDefaultLibFilePath(options) // we need the full path
  }

  getDefaultLibLocation(): string {
    const executingFilePath = tsSys.getExecutingFilePath()
    const tsLibraryPath = path.dirname(executingFilePath)
    return this._resolveFileName(tsLibraryPath)
  }

  getCurrentDirectory(): string {
    return tsSys.getCurrentDirectory()
  }

  useCaseSensitiveFileNames(): boolean {
    return tsSys.useCaseSensitiveFileNames
  }

  getNewLine(): string {
    return tsSys.newLine
  }

  /* ======================================================================== */

  check(files: string[]): Report[] {
    const relativeFiles: string[] = files.map((fileName) => {
      const resolvedFileName = this._resolveFileName(fileName)
      return path.relative(this.getCurrentDirectory(), resolvedFileName)
    })

    const program = createProgram(relativeFiles, this.compilerOptions, this)
    const diagnostics = getPreEmitDiagnostics(program).slice(0) // clone
    const reports: Report[] = []

    program.getSourceFiles().forEach((sourceFile) => {
      if (VUE_JS_TEMPLATE in sourceFile) {
        reports.push({
          code: 0,
          message: 'File is not a TypeScript-based Vue single file component',
          severity: 'warning',
          fileName: this._relativeFileName(sourceFile.fileName),
        })
      }
    })

    if (diagnostics.length === 0) {
      const emitResults = program.emit()
      diagnostics.push(...emitResults.diagnostics)
    }

    // console.log(ts.formatDiagnosticsWithColorAndContext(diagnostics, this))

    reports.push(...diagnostics.map((diag) => {
      // The basics...
      const code = diag.code
      const message = flattenDiagnosticMessageText(diag.messageText, tsSys.newLine, 2)
      const severity =
        diag.category === DiagnosticCategory.Error ? 'error' :
        diag.category === DiagnosticCategory.Message ? 'message' :
        diag.category === DiagnosticCategory.Suggestion ? 'suggestion' :
        diag.category === DiagnosticCategory.Warning ? 'warning' :
        'unknown'
      const isError = diag.category === DiagnosticCategory.Error ? true : undefined
      const isWarning = diag.category === DiagnosticCategory.Warning ? true : undefined

      // This is our basic report...
      const report: Report = { code, message, severity, isError, isWarning }

      // If we have a file we can include it...
      if (diag.file) {
        const file = diag.file
        const fileName = this._resolveFileName(file.fileName)
        report.fileName = this._relativeFileName(file.fileName)

        console.log(fileName, Object.keys(this._transpiledCache))

        // If we have a position we can include it as well
        if (diag.start !== undefined) {
          // If the file was transpiled by us, we have to look up the position
          // in the original .vue template, using our source map
          if (fileName in this._transpiledCache) {
            const transpiled = this._transpiledCache[fileName]
            report.location = reportLocationForTranspiledPosition(file, transpiled, diag.start, diag.length)
          } else {
            report.location = reportLocationForPosition(file, diag.start, diag.length)
          }
        }
      }
      return report
    }))

    return reports
  }
}
