import { report } from 'process'
import ts, { createLanguageService, Diagnostic, sys } from 'typescript'
import { formatWithOptions } from 'util'
import { Checker } from './checker'
import { VueLanguageServiceHost } from './language-service-host'
// import { VueDocumentRegistry, VueLanguageServiceHost } from './language'
import { diagnosticsReport } from './reports'

function check(fileName: string): void {
  const checker = new Checker('tsconfig.json')

  const now = Date.now()
  const reports = checker.check(fileName)
  // console.log('TIME 1', Date.now() - now, 'reports', reports.length)

  // const now2 = Date.now()
  // checker.check(fileName)
  // console.log('TIME2 ', Date.now() - now2, 'reports', reports.length)

  console.log('TOTAL TIME', Date.now() - now)

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


function xreport(diags: Diagnostic[]) {
  console.log('FOUND', diags.length, 'DIAGS')
  console.log(ts.formatDiagnosticsWithColorAndContext(diags, {
    getCurrentDirectory: () => sys.getCurrentDirectory(),
    getCanonicalFileName: (f) => f,
    getNewLine: () => '\n',
  }))
}


function check2(fileName: string) {
  const host = new VueLanguageServiceHost()
  const foo = createLanguageService(host)

  foo.getProgram()?.getOptionsDiagnostics
  console.log('HERE')

  const x = host.addScriptFileName(fileName)
  console.log('X IS', x)

  for (const i of x) {
    console.log('CHJECKING', i)
    xreport(foo.getSemanticDiagnostics(i))
    xreport(foo.getSyntacticDiagnostics(i))
    xreport(foo.getSuggestionDiagnostics(i))
  }
}

console.log('======================')
try {
  // check2('src/main.ts')
  check2('src/components/faq.vue')
} catch (error) {
  console.log(error.stack || error)
  console.dir(error)
}
// check('src/App.vue')
// check('src/App.vue/index.ts')
// check('src/components/faq.vue')

// check('src/components/faq.vue/index.ts')

// /* eslint-disable */
// import { parse as babelParse } from '@babel/parser'
// import * as t from '@babel/types'
// import generate from '@babel/generator'
// // import

// const id = t.identifier('foo')
// const bl = t.tsModuleBlock([])
// const md = t.tsModuleDeclaration(id, bl)

// console.log('--------------')
// console.log(generate(md, {
//   // compact: true,
//   // minified: true,
// }).code)
// console.log('--------------')

// // module foo { export function bar() {} }

// // const nodes =
// // `module foo {
// // export function bar() {}
// // }`
// // console.log(babelParse(nodes).program.body, {
// //   plugins: [ 'typescript' ],
// //   sourceType: 'module',
// // })
