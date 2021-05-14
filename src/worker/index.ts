import { createSender } from './sender'

import {
  Report,
  Reports,
  makeReports,
} from '../reports'

export interface WorkerChecker {
  init: (tsconfig?: string) => Promise<Reports>
  check: (...files: string[]) => Promise<Reports>
  flush: () => Promise<void>
  destroy: () => Promise<void>
}

export async function createRemoteChecker(): Promise<WorkerChecker> {
  const sender = await createSender()

  function init(tsconfig?: string): Promise<Reports> {
    return sender.send({ type: 'init', tsconfig })
        .then((reports: Report[]) => makeReports(reports))
  }

  function check(...files: string[]): Promise<Reports> {
    return sender.send({ type: 'check', files })
        .then((reports: Report[]) => makeReports(reports))
  }

  function flush(): Promise<void> {
    return sender.send({ type: 'flush' })
  }

  function destroy(): Promise<void> {
    return sender.destroy()
  }

  return { init, check, flush, destroy }
}
