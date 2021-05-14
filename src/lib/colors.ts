/** ANSI Red */
export const R = '\x1B[31m'
/** ANSI Green */
export const G = '\x1B[32m'
/** ANSI Yellow */
export const Y = '\x1B[33m'
/** ANSI Blue */
export const B = '\x1B[34m'
/** ANSI Magenta */
export const M = '\x1B[35m'
/** ANSI Cyan */
export const C = '\x1B[36m'
/** ANSI Gray (Bright Black) */
export const K = '\x1B[90m'
/** ANSI White (Bright White) */
export const W = '\x1B[97m'
/** ANSI Underline */
export const U = '\x1B[4m'
/** ANSI Reset */
export const X = '\x1B[0m'

/** Style for files, bright white, underlined */
export const F = '\x1B[97;4m' // file, white underlined

/* ========================================================================== */

/** Wrap a string in red */
export const r = (string: any): string => `${R}${string}${X}`
/** Wrap a string in green */
export const g = (string: any): string => `${G}${string}${X}`
/** Wrap a string in yellow */
export const y = (string: any): string => `${Y}${string}${X}`
/** Wrap a string in blue */
export const b = (string: any): string => `${B}${string}${X}`
/** Wrap a string in magenta */
export const m = (string: any): string => `${M}${string}${X}`
/** Wrap a string in cyan */
export const c = (string: any): string => `${C}${string}${X}`
/** Wrap a string in gray (bright black) */
export const k = (string: any): string => `${K}${string}${X}`
/** Wrap a string in white (bright white) */
export const w = (string: any): string => `${W}${string}${X}`
/** Wrap a string in white (bright white) */
export const u = (string: any): string => `${U}${string}${X}`

/** Wrap string with our file style, bright white, underlined */
export const f = (string: any): string => `${F}${string}${X}`
