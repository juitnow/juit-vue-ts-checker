#!/usr/bin/env node
import { reporter } from './core/reporter'
import { createChecker } from './core/checker'
import { diagnosticsReports } from './core/reports'

import {
  readConfigFile,
  sys,
} from 'typescript'

/** Read a `tsconfig` file to extract the `include` and `exclude` */
function readTsConfig(): { exclude: string[], include: string[] } {
  if (sys.fileExists('tsconfig.json')) {
    const config = readConfigFile('tsconfig.json', sys.readFile)
    if (config.error) {
      reporter(diagnosticsReports([ config.error ]))
      process.exit(1)
    }

    const exclude: string[] = config.config?.exclude || [ 'node_modules' ]
    const include: string[] = config.config?.include || []
    return { exclude, include }
  }

  return { exclude: [ 'node_modules' ], include: [] }
}

// Mark our time
const now = Date.now()

// Create our checker, and get our initial reports
const checker = createChecker()
const reports = checker.init()

if (reports.hasErrors) {
  reporter(reports)
  process.exit(1)
}

// Read our `tsconfig` to get includes and excludes
const { exclude, include } = readTsConfig()

// Read the current directory to figure out what to check
const files = sys.readDirectory(
    sys.getCurrentDirectory(),
    [ '.ts', '.vue' ], // extensions, don't forget the "." (dot)
    exclude,
    include,
)

// Run only if we don't have errors in "tsconfig"
reports.push(...checker.check(...files))
reporter(reports)

// eslint-disable-next-line no-console
console.log('\nChecked', files.length, 'files in', (Date.now() - now) / 1000, 'sec')
if (reports.hasErrors) process.exit(1)
