import { Checker } from './checker'

function check(fileName: string): void {
  const compilerHost = new Checker('tsconfig.json')

  const now = Date.now()
  const reports = compilerHost.check(fileName)
  console.log('TIME 1', Date.now() - now, 'reports', reports.length)

  const now2 = Date.now()
  compilerHost.check(fileName)
  console.log('TIME2 ', Date.now() - now2, 'reports', reports.length)

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

check('src/main.ts')
