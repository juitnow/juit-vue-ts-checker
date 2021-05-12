import path from 'path'
import os from 'os'
import fs from 'fs'
import assert from 'assert'

/** A type simply marking a `string` as a fully resolved path */
export type ResolvedPath = string & { __resolvedPath: any }

/**
 * A tuple describing a fully resolved pseudo-path.
 *
 * - empty tuple when the file was not found
 * - a single `ResolvedPath` when the path was not a pseudo-path
 * - a `ResolvedPath` and the details of the pseudo path
 *
 * When a pseudo-path is found, the first component of the tuple will be the
 * fully resolved file name that was requested.
 *
 * The second component exposes all the resolved paths of our pseudo-path and
 * indicates what `type` was requested.
 */
export type ResolvedPseudoPath = [] | [ ResolvedPath ] | [ ResolvedPath, {
  vue: ResolvedPath,
  index: ResolvedPath,
  render: ResolvedPath,
  script: ResolvedPath,
  type: 'vue' | 'index' | 'render' | 'script',
} ]

/* ========================================================================== *
 * CONSTANTS                                                                  *
 * ========================================================================== */

export const CASE_SENSITIVE_FS: boolean = ((): boolean => {
  const tempPrefix = path.resolve(os.tmpdir(), 'AmICaseSensitive')
  const tempDir = fs.mkdtempSync(tempPrefix)
  try {
    assert(fs.statSync(tempDir).isDirectory(), 'Unable to stat normal directory')
    assert(fs.statSync(tempDir.toUpperCase()).isDirectory(), 'Unable to stat upper cased directory')
    assert(fs.statSync(tempDir.toLowerCase()).isDirectory(), 'Unable to stat lower cased directory')
    return false
  } catch (error) {
    return true
  } finally {
    fs.rmdirSync(tempDir, { recursive: true })
  }
})()

export const PATH_SEP = path.sep

export const OS_EOL = os.EOL

/* ========================================================================== *
 * BASIC FILES OPS                                                            *
 * ========================================================================== */

export function cwd(): ResolvedPath {
  return process.cwd() as ResolvedPath
}

export function resolve(file: string): ResolvedPath {
  return path.resolve(cwd(), file) as ResolvedPath
}

export function directoryExists(path: ResolvedPath): boolean {
  try {
    return fs.statSync(path).isDirectory()
  } catch (error) {
    return false
  }
}

export function fileExists(path: ResolvedPath): boolean {
  try {
    return fs.statSync(path).isFile()
  } catch (error) {
    return false
  }
}

export function fileLastModified(path: ResolvedPath): number | undefined {
  try {
    return fs.statSync(path).mtimeMs
  } catch (error) {
    return undefined
  }
}

export function fileRead(path: ResolvedPath, encoding: BufferEncoding = 'utf8'): string | undefined {
  try {
    return fs.readFileSync(path, encoding)
  } catch (error) {
    return undefined
  }
}

/* ========================================================================== *
 * PSEUDO FILES OPS FOR VUE SFC                                               *
 * ========================================================================== */

/** The extension for the vue files to consider */
const VUE_EXT = '.vue'

/** The pseudo-file suffix for the index file, `/index.ts` */
const VUE_PSEUDO_INDEX_SFX = `${path.sep}index.ts`
/** The pseudo-file extension for the index file, `.vue/index.ts` */
const VUE_PSEUDO_INDEX_EXT = `${VUE_EXT}${VUE_PSEUDO_INDEX_SFX}`
/** The number of characters to cut to convert a pseudo index into a file */
const VUE_PSEUDO_INDEX_LEN = VUE_PSEUDO_INDEX_SFX.length

/** The pseudo-file suffix for the render file, `/render.ts` */
const VUE_PSEUDO_RENDER_SFX = `${path.sep}render.ts`
/** The pseudo-file extension for the render file, `.vue/render.ts` */
const VUE_PSEUDO_RENDER_EXT = `${VUE_EXT}${VUE_PSEUDO_RENDER_SFX}`
/** The number of characters to cut to convert a pseudo render into a file */
const VUE_PSEUDO_RENDER_LEN = VUE_PSEUDO_RENDER_SFX.length

/** The pseudo-file suffix for the script file, `/script.ts` */
const VUE_PSEUDO_SCRIPT_SFX = `${path.sep}script.ts`
/** The pseudo-file extension for the script file, `.vue/render.ts` */
const VUE_PSEUDO_SCRIPT_EXT = `${VUE_EXT}${VUE_PSEUDO_SCRIPT_SFX}`
/** The number of characters to cut to convert a pseudo script into a file */
const VUE_PSEUDO_SCRIPT_CUT = VUE_PSEUDO_SCRIPT_SFX.length

/**
 * Resolve a potentially non absolute file name into a tuple comprising of
 * `[ fileName, templateFileName ]`.
 *
 * This can return:
 *
 * `[ ]` : the _empty_ tuple indicates that the file doesn't exist on disk
 *
 * `[ fileName ]` : the (now resolved) `fileName` exists on disk, but is not
 *                  a pseudo-file (not part of a Vue template)
 *
 * `[ fileName, templateFileName ]` : the (now resolved) `fileName` refers to a
 *                                    pseudo file, and its contents are derived
 *                                    from the (now resolved) `templateFileName`
 *
 * Examples:
 *
 * - Calling `resolvePseudoFileName('dir/file.vue/render.ts')` will return
 *   `[ '/cwd/dir/file.vue/render.ts', '/cwd/dir/file.vue' ]`
 *
 * - Calling `resolvePseudoFileName('dir/file.vue')` will return
 *   `[ '/cwd/dir/file.vue', '/cwd/dir/file.vue' ]`
 *   _(here `fileName` is the same as the `templateFileName`)_
 *
 * - Calling `resolvePseudoFileName('dir/file.ts')` will return
 *   `[ '/cwd/dir/file.ts' ]`
 *   _(here there is no `templateFileName`)_
 */
export function resolvePseudoPath(path: string): ResolvedPseudoPath {
  const file = resolve(path)

  let pseudoPath: string
  let type: 'vue' | 'index' | 'render' | 'script'
  if (file.endsWith(VUE_EXT)) {
    pseudoPath = file
    type = 'vue'
  } else if (file.endsWith(VUE_PSEUDO_INDEX_EXT)) {
    pseudoPath = file.substr(0, file.length - VUE_PSEUDO_INDEX_LEN)
    type = 'index'
  } else if (file.endsWith(VUE_PSEUDO_RENDER_EXT)) {
    pseudoPath = file.substr(0, file.length - VUE_PSEUDO_RENDER_LEN)
    type = 'render'
  } else if (file.endsWith(VUE_PSEUDO_SCRIPT_EXT)) {
    pseudoPath = file.substr(0, file.length - VUE_PSEUDO_SCRIPT_CUT)
    type = 'script'
  } else {
    return fileExists(file) ? [ file ] : []
  }

  const pseudoFile = pseudoPath as ResolvedPath

  // This _could_ be a pseudo-file, or we can have a directory called "dir.vue"
  if (directoryExists(pseudoFile)) {
    return fileExists(file) ? [ file ] : []
  } else {
    return fileExists(pseudoFile) ? [ file, {
      vue: pseudoFile,
      index: pseudoFile + VUE_PSEUDO_INDEX_SFX as ResolvedPath,
      render: pseudoFile + VUE_PSEUDO_RENDER_SFX as ResolvedPath,
      script: pseudoFile + VUE_PSEUDO_SCRIPT_SFX as ResolvedPath,
      type,
    } ] : []
  }
}
