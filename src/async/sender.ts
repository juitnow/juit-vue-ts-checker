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
    this._child = fork(require.resolve('./receiver'))
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

    return new Promise((resolve) => {
      this._child.once('exit', resolve)
      this._child.kill('SIGTERM')
    })
  }
}
