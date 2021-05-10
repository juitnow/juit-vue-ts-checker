// // Our Report Plugin as a class
// export class JuitWebpackCheckerPlugin {
//   constructor() {
//     // No options for now...
//   }

//   apply(compiler: Compiler): void {
//     compiler.hooks.run.tap(name, (compiler) => {
//       console.log('RUN KICKED')
//     })

//     compiler.hooks.done.tap(name, (compiler) => {
//       console.log('DONE')
//     })

//     compiler.hooks.watchRun.tap(name, (compiler) => {
//       console.log('WATCH RUN KICKED')
//     })

//     compiler.hooks.watchRun.tap(name, (compiler) => {
//       console.log('WATCH RUN CLOSED')
//     })

//     compiler.hooks.compilation.tap(name, (compilation, compilationParams) => {
//       if (compilation.compiler != compiler) return

//       console.log(new Date(), 'FILES AT START', compilation.fileDependencies.size)
//       compilation.fileDependencies.forEach((f) => console.log('-', f))
//     })

//     compiler.hooks.afterCompile.tap(name, (compilation) => {
//       if (compilation.compiler != compiler) return

//       console.log(new Date(), 'FILES AT END', compilation.fileDependencies.size)
//       compilation.fileDependencies.forEach((f) => {
//         if (f.endsWith('.vue')) console.log('-', f)
//         if (f.endsWith('.ts')) console.log('-', f)
//       })
//     })
//   }
// }


// function check(fileName: string) {
//   const compilerHost = new VueCompilerHost('tsconfig.json')

//   const now = Date.now()
//   const reports = compilerHost.check([ fileName ])
//   console.log('TIME', Date.now() - now)

//   const now2 = Date.now()
//   compilerHost.check([ fileName ])
//   console.log('TIME', Date.now() - now2)

//   console.log('TOTAL TIME', Date.now() - now)
//   // console.log(reports)

//   for (const report of reports) {
//     console.log()
//     const code = `TS${report.code.toString().padStart(4, '0')}`
//     const message = [ `${report.severity.toUpperCase()} ${code}: ${report.message}` ]
//     if (report.fileName) {
//       if (report.location) {
//         const location = report.location
//         message.push(`| in ${report.fileName} (line=${location.line}, col=${location.column})`)
//         message.push(`| ${location.context}`)
//         message.push(`| ${' '.repeat(location.column)}${'^'.repeat(location.contextLength || 1)}`)
//       } else {
//         message.push(`| in ${report.fileName}`)
//       }
//     }

//     console.log(message.join('\n'))
//   }
// }
