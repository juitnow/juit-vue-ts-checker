import { Sender } from './sender'

import {
  Report,
  Reports,
  makeReports,
} from '../reports'

export interface WorkerChecker {
  init: (tsconfig?: string) => Promise<Reports>
  check: (...files: string[]) => Promise<Reports>
  destroy: () => Promise<void>
}

export async function createRemoteChecker(): Promise<WorkerChecker> {
  const sender = new Sender()

  function init(tsconfig?: string): Promise<Reports> {
    return sender.send({ type: 'init', tsconfig })
        .then((reports: Report[]) => makeReports(reports))
  }

  function check(...files: string[]): Promise<Reports> {
    return sender.send({ type: 'check', files })
        .then((reports: Report[]) => makeReports(reports))
  }

  function destroy(): Promise<void> {
    return sender.destroy()
  }

  return { init, check, destroy }
}
