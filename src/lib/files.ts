import { Path } from 'typescript'
import path from 'path'
import os from 'os'
import fs from 'fs'
import assert from 'assert'

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

export function cwd(): Path {
  return process.cwd() as Path
}

export function resolve(...segments: string[]): Path {
  return path.resolve(cwd(), ...segments) as Path
}

export function directoryExists(path: Path): boolean {
  try {
    return fs.statSync(path).isDirectory()
  } catch (error) {
    return false
  }
}

export function fileExists(path: Path): boolean | undefined {
  try {
    return fs.statSync(path).isFile()
  } catch (error) {
    return undefined
  }
}

export function fileLastModified(path: Path): number | undefined {
  try {
    const stat = fs.statSync(path)
    if (stat.isFile()) return stat.mtimeMs
  } catch (error) {
    return undefined
  }
}

export function fileRead(path: Path, encoding: BufferEncoding = 'utf8'): string | undefined {
  try {
    return fs.readFileSync(path, encoding)
  } catch (error) {
    return undefined
  }
}
