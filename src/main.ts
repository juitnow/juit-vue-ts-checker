import { Checker } from './checker'
import { Reports } from './reports'

function xreport(diags: Reports): void {
  console.log('FOUND', diags.length, 'DIAGS')
  console.dir(diags)
}

const checker = new Checker('tsconfig.json')
xreport(checker.check('src/main.ts'))
xreport(checker.check('src/components/faq.vue'))
