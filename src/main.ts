import { promises as fs } from 'fs'
import { Checker } from './checker'
import { K, R, X, Y, G, C, M, k, r, y, w, c, m } from './lib/colors'
import { OS_EOL, resolve } from './lib/files'
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
      write(k(' | at '))
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
let reports = checker.check('src/main.ts')

async function check(path: string, type?: 'file' | 'dir'): Promise<void> {
  const resolved = resolve(path)

  if (! type) {
    const stat = await fs.stat(resolved)
    if (stat.isDirectory()) type = 'dir'
    else if (stat.isFile()) type = 'file'
    else return
  }

  if (type === 'dir') {
    const entries = await fs.readdir(resolved, { withFileTypes: true })
    for (const entry of entries) {
      const name = resolve(resolved, entry.name)
      if (entry.isDirectory()) await check(name, 'dir')
      else if (entry.isFile()) await check(name, 'file')
    }
  } else if ((type === 'file') && (resolved.match(/\.(ts|vue)$/))) {
    const fileReports = checker.check(resolved)
    if (reports) reports.push(...fileReports)
    else reports = fileReports
  }
}

const now = Date.now()
check('src')
    .then(() => {
      if (reports) report(reports)
      console.log('Full run:', Date.now() - now, 'ms')
    })
    .catch((error) => console.log(error))

// report(checker.check('src/components/faq.vue'))
