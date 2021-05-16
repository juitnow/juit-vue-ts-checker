import { OS_EOL } from '../lib/files'
import { Reports } from './reports'
import { colors } from '../lib/colors'

const { K, R, X, Y, G, C, M, k, r, y, w, m, f } = colors()

export function reporter(reports: Reports): void {
  const write = process.stdout.write.bind(process.stdout)

  write(`Generated ${y(reports.length)} reports`)
  if (reports.hasErrors || reports.hasWarnings) write(k(' ('))
  if (reports.hasErrors) write(r('has errors'))
  if (reports.hasErrors && reports.hasWarnings) write(k(', '))
  if (reports.hasWarnings) write(y('has warnings'))
  if (reports.hasErrors || reports.hasWarnings) write(k(')'))
  write('\n')

  for (const report of reports) {
    write('\n')
    write(w(`TS${report.code.toString().padStart(4, '0')} `))

    switch (report.severity) {
      case 'error': write(`${K}[${R}ERROR${K}]${X} `); break
      case 'warning': write(`${K}[${Y}WARNING${K}]${X} `); break
      case 'message': write(`${K}[${G}MESSAGE${K}]${X} `); break
      case 'suggestion': write(`${K}[${C}SUGGESTION${K}]${X} `); break
      default: write(`${K}[${M}UNKNOWN${K}]${X} `); break
    }

    const lines = report.message.split(OS_EOL)
    const stack = lines.splice(1)

    write(lines[0])
    for (const line of stack) {
      write(k('\n | '))
      write(line)
    }
    write('\n')

    if (report.fileName) {
      write(k(' | at '))
      write(f(report.fileName))
      if (report.location) {
        const { line, column, context, contextLength } = report.location
        write(k(' line '))
        write(y(line))
        if (column > 0) {
          write(k(' col '))
          write(y(column))
        }
        if (context) {
          write(k('\n |\n | '))
          if ((column > 0) && (contextLength > 0)) {
            const skip = column > 40 ? column - 40 : 0 // shift context if too right

            if (skip > 0) write(k(' \u2026\u2026 ')) // hellipsis on shifted col
            write(context.substr(skip, column))
            write(w(context.substr(column + skip, contextLength)))
            write(context.substr(column + skip, contextLength))

            write(k('\n | '))
            if (skip > 0) write('    ')
            write(' '.repeat(column - skip))
            write(m('^'.repeat(contextLength)))
          } else {
            write(context)
          }
        }
      }
      write('\n')
    }
  }
}
