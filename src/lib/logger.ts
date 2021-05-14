/* eslint-disable block-spacing */
/* eslint-disable brace-style */
/* eslint-disable func-call-spacing */
/* eslint-disable key-spacing */
/* eslint-disable no-console */
/* eslint-disable no-multi-spaces */

import { colors } from './colors'
const { R, G, Y, B, C, K, X } = colors()

/* ========================================================================== *
 * INTERNAL TYPES                                                             *
 * ========================================================================== */

enum Level {
  trace = 1, // never "falsy"
  debug = 2,
  info  = 3,
  warn  = 4,
  error = 5,
  off   = 6,
}

/* ========================================================================== *
 * EXPORTED TYPES                                                             *
 * ========================================================================== */

/** The levels available for our `Logger` */
export type LogLevel = keyof typeof Level

/** A constructed `Log` */
export interface Log {
  readonly level: LogLevel

  readonly isTraceEnabled: boolean
  readonly isDebugEnabled: boolean
  readonly isInfoEnabled: boolean
  readonly isWarnEnabled: boolean
  readonly isErrorEnabled: boolean

  trace(...args: any[]): void
  debug(...args: any[]): void
  info (...args: any[]): void
  warn (...args: any[]): void
  error(...args: any[]): void
}

/** The `Logger` interface defines the entry point to logging */
export interface Logger {
  (prefix?: string): Readonly<Log>
  level: LogLevel
}

/* ========================================================================== *
 * IMPLEMENTATION                                                             *
 * ========================================================================== */

export const logger = ((): Logger => {
  let level: Level = Level.info

  function getLogLevel(): LogLevel {
    if (level <= Level.trace) return 'trace'
    if (level <= Level.debug) return 'debug'
    if (level <= Level.info) return 'info'
    if (level <= Level.warn) return 'warn'
    if (level <= Level.error) return 'error'
    return 'off'
  }

  function setLogLevel(l: LogLevel): void {
    const newLevel = Level[l] || Level.info
    if (newLevel != level) level = newLevel
  }

  function date(): string {
    const date = new Date()
    const h = date.getHours().toString().padStart(2, '0')
    const m = date.getMinutes().toString().padStart(2, '0')
    const s = date.getSeconds().toString().padStart(2, '0')
    const S = date.getMilliseconds().toString().padStart(3, '0')
    return `${K}${h}:${m}:${s}.${S}${X}`
  }

  function logger(prefix?: string): Log {
    const pfx = prefix ? `${K}[${C}${prefix}${K}]${X}` : ''

    const log = prefix ? {
      trace: (...args: any[]) => void ((level <= Level.trace) && console.trace(date(), `${K}TRACE${X}`, pfx, ...args)),
      debug: (...args: any[]) => void ((level <= Level.debug) && console.debug(date(), `${B}DEBUG${X}`, pfx, ...args)),
      info:  (...args: any[]) => void ((level <= Level.info ) && console.info (date(), `${G}INFO${X} `, pfx, ...args)),
      warn:  (...args: any[]) => void ((level <= Level.warn ) && console.warn (date(), `${Y}WARN${X} `, pfx, ...args)),
      error: (...args: any[]) => void ((level <= Level.error) && console.error(date(), `${R}ERROR${X}`, pfx, ...args)),
    } : {
      trace: (...args: any[]) => void ((level <= Level.trace) && console.trace(date(), `${B}TRACE${X}`, ...args)),
      debug: (...args: any[]) => void ((level <= Level.debug) && console.debug(date(), `${B}DEBUG${X}`, ...args)),
      info:  (...args: any[]) => void ((level <= Level.info ) && console.info (date(), `${G}INFO${X} `, ...args)),
      warn:  (...args: any[]) => void ((level <= Level.warn ) && console.warn (date(), `${Y}WARN${X} `, ...args)),
      error: (...args: any[]) => void ((level <= Level.error) && console.error(date(), `${R}ERROR${X}`, ...args)),
    }

    return Object.freeze(Object.assign(log, {
      get level(): LogLevel { return getLogLevel() },

      get isTraceEnabled() { return level <= Level.trace },
      get isDebugEnabled() { return level <= Level.debug },
      get isInfoEnabled()  { return level <= Level.info  },
      get isWarnEnabled()  { return level <= Level.warn  },
      get isErrorEnabled() { return level <= Level.error },
    }))
  }

  return Object.freeze(Object.defineProperties(logger, {
    level: { get: getLogLevel, set: setLogLevel },
  }))
})()
