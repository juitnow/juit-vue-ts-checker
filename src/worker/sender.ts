import { Worker } from 'worker_threads'
import { logger } from '../lib/logger'
import { colors } from '../lib/colors'
import { Deferred } from './deferred'

import {
  Request,
  RequestType,
  Response,
} from './types'

const { k } = colors()

const log = logger('worker sender')

/** Create a worker waiting until it's on-line */
function createWorker(): Promise<Worker> {
  const deferred = new Deferred<Worker>()
  const worker: Worker = new Worker(require.resolve('./receiver'), {
    stdout: false,
    stderr: false,
  })

  const errorHandler = (error: Error): void => {
    worker.off('online', onlineHandler)
    deferred.reject(error)
  }

  const onlineHandler = (): void => {
    worker.off('error', errorHandler)
    deferred.resolve(worker)
  }

  worker.once('online', onlineHandler)
  worker.once('error', errorHandler)

  return deferred.promise
}

/** A sender is our interface to send messages to our Worker */
class Sender {
  private readonly _messages: Record<number, Deferred<any>> = {}
  private _worker?: Worker
  private _id: number = 0

  constructor(worker: Worker) {
    this._worker = worker

    this._worker.on('error', (error) => {
      log.error('Worker error', error)
      this._worker = undefined
    })

    this._worker.on('exit', (code: number) => {
      log.info('Worker exited', k(`(code=${code})`))
      this._worker = undefined
    })

    this._worker.on('messageerror', (error: Error) => {
      log.warn('Worker message error', error)
    })

    this._worker.on('message', (response: Response) => {
      if (response.id in this._messages) {
        const message = this._messages[response.id]
        if (response.error) message.reject(new Error('Worker Error'))
        else message.resolve(response.result)
      } else {
        log.warn('Uncorrelated response', response)
      }
    })
  }

  send(message: RequestType): Promise<any> {
    if (this._worker) {
      const request: Request = Object.assign(message, { id: ++this._id })
      const deferred = new Deferred<any>()
      this._messages[request.id] = deferred
      this._worker?.postMessage(request)
      return deferred.promise
    } else {
      return Promise.reject(new Error('Worker Unavailable'))
    }
  }

  destroy(): Promise<void> {
    return this._worker?.terminate().then(() => void 0) || Promise.resolve()
  }
}

export async function createSender(): Promise<Sender> {
  return new Sender(await createWorker())
}
