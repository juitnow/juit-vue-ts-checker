import fs from 'fs'
import assert from 'assert'
import { isMainThread, parentPort } from 'worker_threads'
import { Checker, createChecker } from '../checker'
import { logger } from '../lib/logger'
import { Request, Response } from './types'

const log = logger('worker receiver')

/* Basic sanity check */
assert(! isMainThread, 'Receiver should not run on main thread')
assert(parentPort, 'Receiver does not have access to the parent port')
const parent = parentPort

/* Log message errors */
parent.on('messageerror', (error) => {
  log.warn('Message error', error)
})

/* Log disconnections */
parent.on('close', () => {
  log.info('Sender closed')
})

/* Our checker */
let checker: Checker | undefined = undefined

/* Main receiver code */
parent.on('message', (message: Request) => {
  try {
    const response: Response = { id: message.id, result: undefined, error: false }
    switch (message.type) {
      case 'init':
        if (checker) throw new Error('Checker already initialized')
        checker = createChecker(message.tsconfig)
        response.result = [ ...checker.init() ]
        break

      case 'check':
        if (! checker) throw new Error('Checker not initialized')
        response.result = [ ...checker.check(...message.files) ]
        break

      case 'flush':
        fs.fdatasyncSync(process.stdout.fd)
        fs.fdatasyncSync(process.stderr.fd)
        break

      default:
        throw new Error(`Unsupported request type "${(<any>message).type}"`)
    }

    parent.postMessage(response)
  } catch (error) {
    log.error('Error handling request', error)
    const response: Response = { id: message.id, result: undefined, error: true }
    parent.postMessage(response)
  }
})
