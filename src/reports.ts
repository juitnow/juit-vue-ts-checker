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

/** Generate an array of `Report`s from an array of `Diagnostic`s */
export function makeReports(diagnostics?: Diagnostic[]): Reports {
  const reports: Reports = Object.defineProperties([], {
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
function addDiagnostics(this: Reports, diagnostics: Readonly<Diagnostic[]>): Reports {
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
      report.fileName = relativeFileName(file.fileName)

      // If we have a position we can include it as well
      if (diag.start !== undefined) {
        report.location = reportLocationForPosition(file, diag.start, diag.length)
      }
    }
    this.push(report)
  })

  return this
}

/** Getter for `Reports.hasErrors` */
function hasErrors(this: Report[]): boolean {
  const report = this.find((report) => report.isError)
  return report?.isError || false
}

/** Getter for `Reports.hasWarnings` */
function hasWarnings(this: Report[]): boolean {
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
function sort(this: Report[], comparator?: (a: Report, b: Report) => number): Report[] {
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

// /** Create report location mapping it back to the original Vue file */
// function reportLocationForTranspiledPosition(
//     file: SourceFile,
//     transpiled: Transpiled,
//     start: number,
//     length?: number,
// ): Report['location'] | undefined {
//   const position = getLineAndCharacterOfPosition(file, start)
//   return undefined

//   /*
//   // Make sure we have a source map consumer (lazy init)
//   if (! transpiled.sourceMapConsumer) {
//     transpiled.sourceMapConsumer = new SourceMapConsumer(transpiled.sourceMap)
//   }

//   // Get the original position in the template
//   const originalPosition = transpiled.sourceMapConsumer.originalPositionFor({
//     line: position.line + 1,
//     column: position.character,
//   })

//   // If we don't know the original position, or the original line... pointless
//   if (!(originalPosition && originalPosition.line)) return

//   // Make sure we have some lines (lazy init)
//   if (! transpiled.templateLines) {
//     transpiled.templateLines = transpiled.template.split('\n')
//   }

//   // Get our context line
//   const { line, column = 0 } = originalPosition
//   const contextLine = transpiled.templateLines[line - 1]

//   // Use a regenerated position's last column to calculate the length (if any)
//   let contextLength = length || 0

//   // If the end goes beyond one line, cut it to the end of it
//   if ((column + contextLength) > contextLine.length) {
//     contextLength = contextLine.length - column
//   }

//   // All done!
//   return {
//     line: line,
//     column: column,
//     context: contextLine,
//     contextLength: contextLength,
//   }
//   */
// }
