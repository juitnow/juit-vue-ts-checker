import assert from 'assert'
import { logger } from '../lib/logger'

import {
  Request,
  Response,
} from './types'

import {
  Checker,
  createChecker,
} from '../checker'

const log = logger('receiver')

/* Basic sanity check */
assert(process.send, 'Receiver should be spawned as a child process')
const send = process.send.bind(process)

/* Our checker */
let checker: Checker | undefined = undefined

/* Main receiver code */
process.on('message', (message: Request) => {
  const response: Response = { id: message.id, result: undefined, error: false }
  try {
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

      default:
        throw new Error(`Unsupported request type "${(<any>message).type}"`)
    }

    send(response)
  } catch (error) {
    log.error('Error handling request', error)
    response.result = undefined
    response.error = true
    send(response)
  }
})
