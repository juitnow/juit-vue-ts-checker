import { reporter } from './reporter'
import { createChecker } from './checker'

import {
  formatDiagnosticsWithColorAndContext,
  readConfigFile,
  sys,
} from 'typescript'

/** Read a `tsconfig` file to extract the `include` and `exclude` */
function readTsConfig(): { exclude: string[], include: string[] } {
  if (sys.fileExists('tsconfig.json')) {
    const config = readConfigFile('tsconfig.json', sys.readFile)
    if (config.error) {
      formatDiagnosticsWithColorAndContext([ config.error ], {
        getCurrentDirectory: sys.getCurrentDirectory,
        getCanonicalFileName: (file: string) => file,
        getNewLine: () => sys.newLine,
      })
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

// Read our `tsconfig` to get includes and excludes
const { exclude, include } = readTsConfig()

// Read the current directory to figure out what to check
const files = sys.readDirectory(
    sys.getCurrentDirectory(),
    [ '.ts', '.vue' ], // extensions, don't forget the "." (dot)
    exclude,
    include,
)

// Check and report!
reporter(createChecker().check(...files))

// eslint-disable-next-line no-console
console.log('\nChecked', files.length, 'files in', (Date.now() - now) / 1000, 'sec')
