import assert from 'assert'
import { logger } from '../lib/logger'

import {
  Request,
  Response,
} from './types'

import {
  Checker,
  createChecker,
} from '../core/checker'

const log = logger('receiver')

/* Basic sanity check */
assert(process.send, 'Receiver should be spawned as a child process')
const send = process.send.bind(process)

/* Our checker */
let checker: Checker | undefined = undefined

/* An exit flag, whether we should exit cleanly after sending a message */
let exit: boolean = false

/* Main receiver code */
process.on('message', (message: Request) => {
  const response: Response = { id: message.id, result: undefined, error: false }
  try {
    switch (message.type) {
      case 'init':
        if (!checker) checker = createChecker(message.tsconfig)
        response.result = [ ...checker.init() ]
        break

      case 'check':
        if (! checker) throw new Error('Checker not initialized')
        response.result = [ ...checker.check(...message.files) ]
        break

      case 'dependencies':
        if (! checker) throw new Error('Checker not initialized')
        response.result = [ ...checker.dependencies(...message.files) ]
        break

      case 'destroy':
        if (! checker) throw new Error('Checker not initialized')
        checker.destroy()
        exit = true
        break

      default:
        throw new Error(`Unsupported request type "${(<any>message).type}"`)
    }

    send(response, (error: Error) => {
      if (error) {
        log.error('Error sending response', error)
        process.exit(1)
      } else if (exit) {
        process.exit(0)
      }
    })
  } catch (error) {
    log.error('Error handling request', error)
    response.result = undefined
    response.error = true
    send(response)
  }
})
