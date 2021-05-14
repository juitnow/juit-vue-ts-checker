/** ANSI Red */
export const _R = '\x1B[31m'
/** ANSI Green */
export const _G = '\x1B[32m'
/** ANSI Yellow */
export const _Y = '\x1B[33m'
/** ANSI Blue */
export const _B = '\x1B[34m'
/** ANSI Magenta */
export const _M = '\x1B[35m'
/** ANSI Cyan */
export const _C = '\x1B[36m'
/** ANSI Gray (Bright Black) */
export const _K = '\x1B[90m'
/** ANSI White (Bright White) */
export const _W = '\x1B[97m'
/** ANSI Underline */
export const _U = '\x1B[4m'
/** ANSI Reset */
export const _X = '\x1B[0m'

/** Style for files, bright white, underlined */
export const _F = '\x1B[97;4m' // file, white underlined

/* ========================================================================== */

/** Wrap a string in red */
export const _r = (string: any): string => `${_R}${string}${_X}`
/** Wrap a string in green */
export const _g = (string: any): string => `${_G}${string}${_X}`
/** Wrap a string in yellow */
export const _y = (string: any): string => `${_Y}${string}${_X}`
/** Wrap a string in blue */
export const _b = (string: any): string => `${_B}${string}${_X}`
/** Wrap a string in magenta */
export const _m = (string: any): string => `${_M}${string}${_X}`
/** Wrap a string in cyan */
export const _c = (string: any): string => `${_C}${string}${_X}`
/** Wrap a string in gray (bright black) */
export const _k = (string: any): string => `${_K}${string}${_X}`
/** Wrap a string in white (bright white) */
export const _w = (string: any): string => `${_W}${string}${_X}`
/** Wrap a string in white (bright white) */
export const _u = (string: any): string => `${_U}${string}${_X}`

/** Wrap string with our file style, bright white, underlined */
export const _f = (string: any): string => `${_F}${string}${_X}`

/* ========================================================================== */

export type Colors = {
  /** ANSI Red */
  R: string
  /** ANSI Green */
  G: string
  /** ANSI Yellow */
  Y: string
  /** ANSI Blue */
  B: string
  /** ANSI Magenta */
  M: string
  /** ANSI Cyan */
  C: string
  /** ANSI Gray (Bright Black) */
  K: string
  /** ANSI White (Bright White) */
  W: string
  /** ANSI Underline */
  U: string
  /** ANSI Reset */
  X: string
  /** Style for files, bright white, underlined */
  F: string

  /** Wrap a string in red */
  r: (string: any) => string
  /** Wrap a string in green */
  g: (string: any) => string
  /** Wrap a string in yellow */
  y: (string: any) => string
  /** Wrap a string in blue */
  b: (string: any) => string
  /** Wrap a string in magenta */
  m: (string: any) => string
  /** Wrap a string in cyan */
  c: (string: any) => string
  /** Wrap a string in gray (bright black) */
  k: (string: any) => string
  /** Wrap a string in white (bright white) */
  w: (string: any) => string
  /** Wrap a string in white (bright white) */
  u: (string: any) => string
  /** Wrap string with our file style, bright white, underlined */
  f: (string: any) => string
}

const ts = (string: any): string => `${string}`

export function colors(colorize: boolean = process.stdout.isTTY): Colors {
  return colorize ? {
    R: _R, G: _G, Y: _Y, B: _B, M: _M, C: _C, K: _K, W: _W, U: _U, F: _F, X: _X,
    r: _r, g: _g, y: _y, b: _b, m: _m, c: _c, k: _k, w: _w, u: _u, f: _f,
  }: {
    R: '', G: '', Y: '', B: '', M: '', C: '', K: '', W: '', U: '', F: '', X: '',
    r: ts, g: ts, y: ts, b: ts, m: ts, c: ts, k: ts, w: ts, u: ts, f: ts,
  }
}
