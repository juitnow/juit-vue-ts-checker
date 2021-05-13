import {
  Diagnostic,
  DiagnosticCategory,
  SourceFile,
  flattenDiagnosticMessageText,
  getLineAndCharacterOfPosition,
  sys,
} from 'typescript'

import { pseudoPath } from './lib/pseudo'
import { cwd, PATH_SEP, resolve } from './lib/files'
import { VueLanguageServiceHost } from './compiler'
import { SourceMapConsumer } from 'source-map'

/* ========================================================================== *
 * EXPORTS                                                                    *
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

/**
 * A `Reports` instance is an `Array` of `Report`s with a couple of extra
 * flags (`hasErrors` and `hasWarnings`) added for convenience.
 */
export interface Reports extends Array<Report> {
  readonly hasErrors: boolean
  readonly hasWarnings: boolean

  addDiagnostics(diagnostics: Diagnostic[]): this
}

interface ReportsInternal extends Reports {
  readonly _getSourceMapConsumer: (path: string) => SourceMapConsumer | undefined
}

/** Generate an array of `Report`s from an array of `Diagnostic`s */
export function makeReports(host: VueLanguageServiceHost, diagnostics?: Diagnostic[]): Reports {
  const reports: Reports = Object.defineProperties([], {
    _getSourceMapConsumer: { value: host.getSourceMapConsumer.bind(host) },

    hasErrors: { enumerable: true, get: hasErrors },
    hasWarnings: { enumerable: true, get: hasWarnings },
    addDiagnostics: { value: addDiagnostics },
    sort: { value: sort },
  })

  if (diagnostics) reports.addDiagnostics(diagnostics)
  return reports
}

/* ========================================================================== *
 * REPORTS PUBLIC METHODS                                                     *
 * ========================================================================== */

/** Add diagnostics to a `Reports` instance */
function addDiagnostics(this: ReportsInternal, diagnostics: Readonly<Diagnostic[]>): Reports {
  diagnostics.forEach((diag) => {
    // The basics...
    const code = diag.code
    const message = flattenDiagnosticMessageText(diag.messageText, sys.newLine, 2)
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

      // At least we have a name...
      report.fileName = relativeFileName(file.fileName)

      // If we have a position we can include it as well
      if (diag.start !== undefined) {
        const sourceMap = this._getSourceMapConsumer(file.fileName)
        if (sourceMap) {
          reportLocationWithSourceMap(report, file, diag.start, diag.length, sourceMap)
        } else {
          reportLocation(report, file, diag.start, diag.length)
        }
      }
    }
    this.push(report)
  })

  return this
}

/** Getter for `Reports.hasErrors` */
function hasErrors(this: Reports): boolean {
  const report = this.find((report) => report.isError)
  return report?.isError || false
}

/** Getter for `Reports.hasWarnings` */
function hasWarnings(this: Reports): boolean {
  const report = this.find((report) => report.isWarning)
  return report?.isWarning || false
}

/** Comparator for `Report` instances */
function compare(a: Report, b: Report): number {
  const msi = Number.MAX_SAFE_INTEGER
  const { fileName: af = '' } = a
  const { fileName: bf = '' } = b
  const { line: al = msi, column: ac = msi } = a.location || {}
  const { line: bl = msi, column: bc = msi } = b.location || {}

  return af < bf ? -1 : // file
         af > bf ? +1 : //
         al < bl ? -1 : // line
         al > bl ? +1 : //
         ac < bc ? -1 : // column
         ac > bc ? +1 : //
         0
}

/** Sort a `Reports` instance in place */
function sort(this: Reports, comparator?: (a: Report, b: Report) => number): Reports {
  Array.prototype.sort.call(this, comparator || compare)
  return this
}

/* ========================================================================== *
 * INTERNALS                                                                  *
 * ========================================================================== */

/** Return a relative file name in current working directory */
function relativeFileName(path: string): string {
  const pseudo = pseudoPath(path)

  const file = pseudo.file || resolve(path)
  const directory = cwd() + PATH_SEP

  return file.startsWith(directory) ? file.substr(directory.length) : file
}

/** Create report location for a generic (non-Vue) associated file */
function reportLocation(
    report: Report,
    file: SourceFile,
    start: number,
    length?: number,
): void {
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
  report.location = {
    line: position.line + 1,
    column: position.character,
    context: contextLine,
    contextLength: contextLength,
  }
}

/** Create report location mapping it back to the original Vue file */
function reportLocationWithSourceMap(
    report: Report,
    file: SourceFile,
    start: number,
    length: number | undefined,
    sourceMapConsumer: SourceMapConsumer,
): void {
  const position = getLineAndCharacterOfPosition(file, start)

  // Get the original position in the template
  const originalPosition = sourceMapConsumer.originalPositionFor({
    line: position.line + 1,
    column: position.character,
  })

  // If we don't know the original position, or the original line... pointless
  if (!(originalPosition && originalPosition.line)) return

  // We might have a different file name for the report
  if (originalPosition.name) report.fileName = relativeFileName(originalPosition.name)

  // Get our context line
  const source = sourceMapConsumer.sourceContentFor(originalPosition.source, false)
  const { line, column = 0 } = originalPosition
  const contextLine = source.split('\n')[line - 1] || ''

  // Use a regenerated position's last column to calculate the length (if any)
  let contextLength = length || 0

  // If the end goes beyond one line, cut it to the end of it
  if ((column + contextLength) > contextLine.length) {
    contextLength = contextLine.length - column
  }

  // All done!
  report.location = {
    line: line,
    column: column,
    context: contextLine,
    contextLength: contextLength,
  }
}
