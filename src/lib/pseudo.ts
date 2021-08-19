import { Path } from 'typescript'
import { sep } from 'path'

import {
  directoryExists,
  fileLastModified,
  resolve,
} from './files'

/* ========================================================================== *
 * PSEUDO FILES OPS FOR VUE SFC                                               *
 * ========================================================================== */

type PseudoPathType = 'vue' | 'index' | 'render' | 'script'

interface BasePath {
  path: Path,
  type?: PseudoPathType | undefined,
  timestamp?: number | undefined,
}

interface FileBasePath extends BasePath {
  type?: undefined
}

export interface FilePathNotFound extends FileBasePath {
  path: Path,
  timestamp?: undefined,
}

export interface FilePathFound extends FileBasePath {
  path: Path,
  timestamp: number,
}

interface VueBasePath extends BasePath {
  type: PseudoPathType,
  vue: Path,
  index: Path,
  render: Path,
  script: Path,
}

export interface VuePathNotFound extends VueBasePath {
  timestamp?: undefined,
}

export interface VuePathFound extends VueBasePath {
  timestamp: number,
}

export type PseudoPath = FilePathNotFound | FilePathFound | VuePathNotFound | VuePathFound
export type PseudoPathFound = FilePathFound | VuePathFound
export type PseudoPathNotFound = FilePathNotFound | VuePathNotFound
export type FilePath = FilePathFound | FilePathNotFound
export type VuePath = VuePathFound | VuePathNotFound

export function isFilePath(path: PseudoPath): path is FilePath {
  return path.type === undefined
}

export function isFilePathFound(path: PseudoPath): path is FilePathFound {
  return (path.type === undefined) && (path.timestamp !== undefined)
}

export function isFilePathNotFound(path: PseudoPath): path is FilePathNotFound {
  return (path.type === undefined) && (path.timestamp === undefined)
}

export function isVuePath(path: PseudoPath): path is VuePath {
  return path.type !== undefined
}

export function isVuePathFound(path: PseudoPath): path is VuePathFound {
  return (path.type !== undefined) && (path.timestamp !== undefined)
}

export function isVuePathNotFound(path: PseudoPath): path is VuePathNotFound {
  return (path.type !== undefined) && (path.timestamp === undefined)
}

export function isPseudoPathFound(path: PseudoPath): path is PseudoPathFound {
  return path.timestamp !== undefined
}

export function isPseudoPathNotFound(path: PseudoPath): path is PseudoPathNotFound {
  return path.timestamp === undefined
}

/** The extension for the vue files to consider */
const VUE_EXT = '.vue'

/** The pseudo-file suffix for the index file, `/index.ts` */
const VUE_PSEUDO_INDEX_SFX = `${sep}index.ts`
/** The pseudo-file extension for the index file, `.vue/index.ts` */
const VUE_PSEUDO_INDEX_EXT = `${VUE_EXT}${VUE_PSEUDO_INDEX_SFX}`
/** The number of characters to cut to convert a pseudo index into a file */
const VUE_PSEUDO_INDEX_LEN = VUE_PSEUDO_INDEX_SFX.length

/** The pseudo-file suffix for the render file, `?render.ts` */
const VUE_PSEUDO_RENDER_SFX = '?render.ts'
/** The pseudo-file extension for the render file, `.vue/render.ts` */
const VUE_PSEUDO_RENDER_EXT = `${VUE_EXT}${VUE_PSEUDO_RENDER_SFX}`
/** The number of characters to cut to convert a pseudo render into a file */
const VUE_PSEUDO_RENDER_LEN = VUE_PSEUDO_RENDER_SFX.length

/** The pseudo-file suffix for the script file, `?script.ts` */
const VUE_PSEUDO_SCRIPT_SFX = '?script.ts'
/** The pseudo-file extension for the script file, `.vue/render.ts` */
const VUE_PSEUDO_SCRIPT_EXT = `${VUE_EXT}${VUE_PSEUDO_SCRIPT_SFX}`
/** The number of characters to cut to convert a pseudo script into a file */
const VUE_PSEUDO_SCRIPT_CUT = VUE_PSEUDO_SCRIPT_SFX.length

/** Resolve a potentially non absolute file name into a `PseudoPath` */
export function pseudoPath(file: string): PseudoPath {
  const path = resolve(file)

  const pseudo = pseudoType(path)
  if (pseudo === undefined) {
    const timestamp = fileLastModified(path)
    return timestamp === undefined ? { path } : { path, timestamp }
  }

  const [ vue, type ] = pseudo

  // This _could_ be a pseudo-file, or we can have a directory called "dir.vue"
  if (directoryExists(vue)) {
    const timestamp = fileLastModified(path)
    return timestamp === undefined ? { path } : { path, timestamp }
  } else {
    const timestamp = fileLastModified(vue)
    const index = vue + VUE_PSEUDO_INDEX_SFX as Path
    const render = vue + VUE_PSEUDO_RENDER_SFX as Path
    const script = vue + VUE_PSEUDO_SCRIPT_SFX as Path

    return { path, type, vue, index, render, script, timestamp }
  }
}

/**
 * Resolve the _type_ of a potential `PseudoPath` (no checks performed)
 *
 * Returns a tuple with the resolved `Path` of the original `.vue` followed
 * by the _type_ identifying the kind of pseudo path.
 */
export function pseudoType(path: Path): [ Path, PseudoPathType ] | undefined {
  if (path.endsWith(VUE_EXT)) {
    return [ path, 'vue' ]
  } else if (path.endsWith(VUE_PSEUDO_INDEX_EXT)) {
    return [ path.substr(0, path.length - VUE_PSEUDO_INDEX_LEN) as Path, 'index' ]
  } else if (path.endsWith(VUE_PSEUDO_RENDER_EXT)) {
    return [ path.substr(0, path.length - VUE_PSEUDO_RENDER_LEN) as Path, 'render' ]
  } else if (path.endsWith(VUE_PSEUDO_SCRIPT_EXT)) {
    return [ path.substr(0, path.length - VUE_PSEUDO_SCRIPT_CUT) as Path, 'script' ]
  }
}
