import { Path } from 'typescript'
import path from 'path'
import os from 'os'
import fs from 'fs'

/* ========================================================================== *
 * CONSTANTS                                                                  *
 * ========================================================================== */

export const CASE_SENSITIVE_FS: boolean = ((): boolean => {
  try {
    fs.statSync(__filename.toUpperCase()).isFile()
    fs.statSync(__filename.toLowerCase()).isFile()
    return false
  } catch (error) {
    return true
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
