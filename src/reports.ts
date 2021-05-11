import {
  Transpiled,
  transpiled,
} from './transpile'

import {
  relativeFileName,
} from './files'

import {
  SourceMapConsumer,
} from 'source-map'

import {
  Diagnostic,
  DiagnosticCategory,
  SourceFile,
  flattenDiagnosticMessageText,
  getLineAndCharacterOfPosition,
  sys,
} from 'typescript'

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
}

/**
 * Utility function to create a `Reports` instance.
 */
export function makeReports(...reports: Report[]): Reports {
  function hasErrors(this: Report[]): boolean {
    const report = this.find((report) => report.isError)
    return report?.isError || false
  }

  function hasWarnings(this: Report[]): boolean {
    const report = this.find((report) => report.isWarning)
    return report?.isWarning || false
  }

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

  function sort(this: Report[], comparator?: (a: Report, b: Report) => number): Report[] {
    Array.prototype.sort.call(this, comparator || compare)
    return this
  }

  // Here "reports" is always a new array, as it comes from the ... operator
  return Object.defineProperties(reports, {
    hasErrors: { enumerable: true, get: hasErrors.bind(reports) },
    hasWarnings: { enumerable: true, get: hasWarnings.bind(reports) },
    sort: { value: sort },
  })
}

/**
 * Generate an array of `Report`s from an array of `SourceFile`s.
 *
 * For now this function only checks if a `.vue` file could not be transpiled
 * because it was written in _JavaScript_ rather than _TypeScript_.
 *
 * If a `reports` array is specified, `Report`s will be added to it and the
 * same instance will be returned.
 */
export function sourceFilesReport(
    sourceFiles: Readonly<SourceFile[]>,
    reports: Reports = makeReports(),
): Reports {
  sourceFiles.forEach((sourceFile) => {
    const xpiled = sourceFile[transpiled]
    if (xpiled === null) {
      reports.push({
        code: 0,
        message: 'File is not a TypeScript-based Vue single file component',
        severity: 'warning',
        fileName: relativeFileName(sourceFile.fileName),
      })
    }
  })

  return reports
}

/**
 * Generate an array of `Report`s from an array of `Diagnostic`s.
 *
 * If a `reports` array is specified, `Report`s will be added to it and the
 * same instance will be returned.
 */
export function diagnosticsReport(
    diagnostics: Readonly<Diagnostic[]>,
    reports: Reports = makeReports(),
): Reports {
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
        // If the file was transpiled by us, we have to look up the position
        // in the original .vue template, using our source map
        const xpiled = file[transpiled]
        if (xpiled) {
          report.location = reportLocationForTranspiledPosition(file, xpiled, diag.start, diag.length)
        } else {
          report.location = reportLocationForPosition(file, diag.start, diag.length)
        }
      }
    }
    reports.push(report)
  })

  return reports
}

/* ========================================================================== *
 * INTERNALS                                                                  *
 * ========================================================================== */

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

/** Create report location mapping it back to the original Vue file */
function reportLocationForTranspiledPosition(
    file: SourceFile,
    transpiled: Transpiled,
    start: number,
    length?: number,
): Report['location'] | undefined {
  const position = getLineAndCharacterOfPosition(file, start)
  return undefined

  /*
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
  */
}
