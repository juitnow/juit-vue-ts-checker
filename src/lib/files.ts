import path from 'path'
import os from 'os'
import fs from 'fs'
import assert from 'assert'

/** A type simply marking a `string` as a fully resolved path */
export type ResolvedPath = string & { __resolvedPath: any }

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
