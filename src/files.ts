import { sys } from 'typescript'
import { resolve, sep } from 'path'

/**
 * Resolve a file name from TypeScript into a file accessible on disk.
 * Internally, we always and only use fully resolved path names (absolutes).
 *
 * On top of it, the normalized name of a "/dir/file.vue" file name becomes
 * "/dir/file.vue/index.ts".
 *
 * TypeScript will infer this as "file.vue" does not end with ".ts", and
 * automatically consider this as a directory (with its default index).
 *
 * Also, using this structure (rather than, for example "/dir/file.vue.ts")
 * won't get into trouble when another file is accidentally called
 * "file.vue.ts" as no same file and directory can have the same name.
 */
export function resolveFileName(fileName: string): string {
  const resolvedFileName = resolve(sys.getCurrentDirectory(), fileName)

  // If the file _exists_ on the disk, we don't have to check further
  if (sys.fileExists(resolvedFileName)) return resolvedFileName

  // If the file is our magic 'file.vue/index.ts' then strip the prefix
  if (resolvedFileName.endsWith('.vue/index.ts')) {
    const normalizedVueFileName = resolvedFileName.substr(0, resolvedFileName.length - 9)
    if (sys.fileExists(normalizedVueFileName)) return normalizedVueFileName
  }

  // Not much else we can do but to return our resolved file name
  return resolvedFileName
}

/** Relativize file name against the current directory (but never use "..") */
export function relativeFileName(fileName: string): string {
  const currentDirectory = sys.getCurrentDirectory()

  const resolvedFileName = resolve(currentDirectory, fileName)

  const pathPrefix = currentDirectory + sep

  return resolvedFileName.startsWith(pathPrefix) ?
    resolvedFileName.substr(pathPrefix.length) :
    resolvedFileName
}

/**
 * Get the actual last modification time of a _file_, only if it exists.
 *
 * This is a bit hairy, as TypeScript might not have `sys.getModifiedTime(...)`
 * available for us, and when it does, it returns the last modified timestamp
 * also for directories.
 */
export function getFileTimestamp(resolvedFileName: string): number | undefined {
  if (! sys.fileExists(resolvedFileName)) return // weed out directories!

  // We _assume_ that if the file exists (above) we'll get a timestamp from
  // TypeScript, otherwise we default to "now" basically nutering the cache
  return sys.getModifiedTime?.(resolvedFileName)?.getTime() || Date.now()
}

/**
 * A function executing a callback if and only if the file it was invoked
 * with was changed since the last time it was called.
 */
export type FilesCache<T> = (
  /** The file name (maybe unresolved) of the file we are working on */
  fileName: string,
  /** The callback to operate in if we had a cache miss */
  callback: (resolvedFileName: string, fileContents: string) => T,
  /** An optinal callback to report errors (from TypeScript) */
  onError?: ((message: string) => void),
  /** A flag indicating whether to bypass caching results */
  noCache?: boolean,
) => T | undefined

/** Create a caching function */
export function filesCache<T>(): FilesCache<T> {
  const _cache: Record<string, [ number, T ]> = {}

  return function cache(
      fileName: string,
      callback: (resolvedFileName: string, fileContents: string) => T,
      onError?: ((message: string) => void),
      noCache?: boolean,
  ): T | undefined {
    // We always work internally on fully resolved file names
    const resolvedFileName = resolveFileName(fileName)

    // We rely on "sys.getLastModified(...)" from TS, which might be undefined
    if (typeof sys.getModifiedTime !== 'function') {
      const sourceContents = sys.readFile(resolvedFileName)
      return sourceContents === undefined ? undefined :
        callback(resolvedFileName, sourceContents)
    }

    // If we have no timestamp (no file) we just wipe the cache and return
    const fileTimestamp = getFileTimestamp(resolvedFileName)
    if (fileTimestamp === undefined) {
      delete _cache[resolvedFileName]
      return
    }

    // If we have this file already cached, and we _don't_ have to create a
    // new one, then we can simply check and return what we havd before...
    if ((! noCache) && (resolvedFileName in _cache)) {
      const [ cacheTimestamp, sourceFile ] = _cache[resolvedFileName]

      if (fileTimestamp === cacheTimestamp) {
        return sourceFile
      }
    }

    // We can try to read our file, if we can't we wipe the cache and return
    const sourceContents = sys.readFile(resolvedFileName)
    if (sourceContents === undefined) {
      delete _cache[resolvedFileName]
      return
    }

    // All sorts of wron can happen here
    try {
      const sourceFile = callback(resolvedFileName, sourceContents)

      // We can now cache and return the source file
      _cache[resolvedFileName] = [ fileTimestamp, sourceFile ]
      return sourceFile
    } catch (error) {
      if (onError) onError(error.stack || error)
      else throw error
    }
  }
}
