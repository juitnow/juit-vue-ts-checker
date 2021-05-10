import { Checker } from './checker'

function check(fileName: string): void {
  const compilerHost = new Checker('tsconfig.json')

  const now = Date.now()
  const reports = compilerHost.check([ fileName ])
  console.log('TIME', Date.now() - now)

  const now2 = Date.now()
  compilerHost.check([ fileName ])
  console.log('TIME', Date.now() - now2)

  console.log('TOTAL TIME', Date.now() - now)
  // console.log(reports)

  for (const report of reports.sort()) {
    console.log()
    const code = `TS${report.code.toString().padStart(4, '0')}`
    const message = [ `${report.severity.toUpperCase()} ${code}: ${report.message}` ]
    if (report.fileName) {
      if (report.location) {
        const location = report.location
        message.push(`| in ${report.fileName} (line=${location.line}, col=${location.column})`)
        message.push(`| ${location.context}`)
        message.push(`| ${' '.repeat(location.column)}${'^'.repeat(location.contextLength || 1)}`)
      } else {
        message.push(`| in ${report.fileName}`)
      }
    }

    console.log(message.join('\n'))
  }
}

const now = Date.now()
check('src/main.ts')
console.log('TIME', Date.now() - now)
