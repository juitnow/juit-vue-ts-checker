import { logger } from '../lib/logger'
import { colors } from '../lib/colors'
import { Deferred } from './deferred'

import {
  ChildProcess,
  fork,
} from 'child_process'

import {
  Request,
  RequestType,
  Response,
} from './types'

const { k } = colors()

const log = logger('sender')

/** A sender is our interface to send messages to our child process */
export class Sender {
  private readonly _messages: Record<number, Deferred<any>> = {}
  private _child: ChildProcess
  private _alive: boolean
  private _id: number = 0

  constructor() {
    this._child = fork(require.resolve('./receiver'), { env: {
      COLORIZE: colors.colorize ? 'true' : 'false',
      LOG_LEVEL: logger.level,
    } })

    this._alive = true

    this._child.on('error', (error) => {
      log.error('Child process error', error)
      this._child.kill('SIGKILL')
      this._alive = false
    })

    this._child.on('exit', (code: number) => {
      log.info('Child process exited', k(`(code=${code})`))
      this._alive = false
    })

    this._child.on('message', (response: Response) => {
      if (response.id in this._messages) {
        const message = this._messages[response.id]
        if (response.error) message.reject(new Error('Receiver Error'))
        else message.resolve(response.result)
      } else {
        log.warn('Uncorrelated response', response)
      }
    })
  }

  send(message: RequestType): Promise<any> {
    if (this._alive) {
      const request: Request = Object.assign(message, { id: ++this._id })
      const deferred = new Deferred<any>()
      this._messages[request.id] = deferred
      this._child.send(request)
      return deferred.promise
    } else {
      return Promise.reject(new Error('Child process unavailable'))
    }
  }

  destroy(): Promise<void> {
    if (! this._alive) return Promise.resolve()

    return new Promise((resolve, reject) => {
      // If we don't hear back in 2 seconds, SIGTERM, in 4 SIGKILL, in 6 error
      const term = setTimeout(() => this._child.kill('SIGTERM'), 2000)
      const kill = setTimeout(() => this._child.kill('SIGKILL'), 4000)
      const done = setTimeout(() => {
        // Make sure we don't get called again...
        this._alive = false
        // All we can do is raise a big error
        reject(new Error('Receiver process did not exit...'))
      }, 6000)

      // On exit
      this._child.once('exit', () => {
        this._alive = false
        clearTimeout(term)
        clearTimeout(kill)
        clearTimeout(done)
        resolve()
      })
    })
  }
}
