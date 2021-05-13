import { Checker } from './checker'
import { K, R, X, Y, G, C, M, k, r, y, w, c, m } from './lib/colors'
import { OS_EOL } from './lib/files'
import { Reports } from './reports'

function report(reports: Reports): void {
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
      write(k(' |\n | at '))
      write(c(report.fileName))
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
            write(context.substr(0, column))
            write(w(context.substr(column, contextLength)))
            write(context.substr(column + contextLength))

            write(k('\n | '))
            write(' '.repeat(column))
            write(m('~'.repeat(contextLength)))
          } else {
            write(context)
          }
        }
      }
      write('\n')
    }
  }
}

const checker = new Checker('tsconfig.json')
report(checker.check('src/main.ts', 'src/components/faq.vue'))
