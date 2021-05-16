import { Checker } from '../core/checker'
import { Sender } from './sender'
import { Path } from 'typescript'

import {
  Report,
  Reports,
  makeReports,
} from '../core/reports'

/** Our `AsyncChecker` is simply a `Checker` returning `Promise`s */
export type AsyncChecker = {
  [ Key in keyof Checker ]: (...args: Parameters<Checker[Key]>) => Promise<ReturnType<Checker[Key]>>
}

/** Create a new `AsyncChecker` */
export function createAsyncChecker(tsconfig?: string): AsyncChecker {
  const sender = new Sender()

  function init(): Promise<Reports> {
    return sender.send({ type: 'init', tsconfig })
        .then((reports: Report[]) => makeReports(reports))
  }

  function check(...files: string[]): Promise<Reports> {
    return sender.send({ type: 'check', files })
        .then((reports: Report[]) => makeReports(reports))
  }

  function destroy(): Promise<void> {
    return sender.send({ type: 'destroy' }).then(() => sender.destroy())
  }

  function dependencies(...files: string[]): Promise<Path[]> {
    return sender.send({ type: 'dependencies', files })
  }

  return { init, check, dependencies, destroy }
}
