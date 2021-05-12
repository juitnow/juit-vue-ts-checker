import { ResolvedPath, fileLastModified, fileRead } from './files'

/** Our (internal) cache callback type */
type Callback<T> = (contents: string) => T

/**
 * A function executing a callback if and only if the file it was invoked
 * with was changed since the last time it was called.
 */
export type Cache<T> = (
  /** The file name (maybe unresolved) of the file we are working on */
  file: ResolvedPath,
  /** The callback to operate in if we had a cache miss */
  callback: Callback<T>,
) => T | undefined

/** Create a caching function */
export function cache<T>(): Cache<T> {
  const _cache: Record<string, [ number, T ]> = {}

  return function cache(file: ResolvedPath, callback: Callback<T>): T | undefined {
    // If we have no timestamp (no file) we just wipe the cache and return
    const timestamp = fileLastModified(file)
    if (timestamp === undefined) {
      delete _cache[file]
      return
    }

    // If we have this file already cached, and we _don't_ have to create a
    // new one, then we can simply check and return what we havd before...
    if (file in _cache) {
      const [ cachedTimestamp, cached ] = _cache[file]
      if (timestamp === cachedTimestamp) return cached
    }

    // We can try to read our file, if we can't we wipe the cache and return
    const contents = fileRead(file)
    if (contents === undefined) {
      delete _cache[file]
      return
    }

    // Call our callback, cache the result, and return it
    const result = callback(contents)
    _cache[file] = [ timestamp, result ]
    return result
  }
}
