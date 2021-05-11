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

const rrr = 'foo'
{
  const rrr = 'bar'
  void rrr
}

void rrr
// TODO: this creates an error
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
