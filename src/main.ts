/* eslint-disable no-console */

import { promises as fs } from 'fs'
import { resolve } from './lib/files'
import { reporter } from './reporter'
import { Reports } from './reports'
import { createAsyncChecker } from './async'

async function main(): Promise<void> {
  const promises: Promise<Reports>[] = []
  const checker = await createAsyncChecker()
  const reports = await checker.init('tsconfig.json')

  promises.push(checker.check('src/main.ts'))
  const paths: string[] = []

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
      // promises.push(checker.check(resolved))
      paths.push(resolved)
    }
  }

  await check('src')
  await checker.check(...paths)
  console.log('Done scan:', Date.now() - now, 'ms')

  // await check('src')
  reports.push(...await checker.check(...paths))
  console.log('Done scan 2:', Date.now() - now, 'ms')

  // const results = await Promise.all(promises)

  // results.forEach((result) => {
  //   reports.push(...result)
  // })

  reporter(reports)
  await checker.destroy()
}

const now = Date.now()

main()
    .then(() => {
      console.log('Full run:', Date.now() - now, 'ms')
    })
    .catch((error) => console.error(error))
