import { Path } from 'typescript'
import {
  fileRead,
  resolve,
} from './files'
import { PseudoPath, pseudoPath } from './pseudo'

/** Our (internal) cache callback type */
type Callback<T> = (path: PseudoPath & { file: Path }, contents: string) => T

/**
 * A function executing a callback if and only if the file it was invoked
 * with was changed since the last time it was called.
 */
export type Cache<T> = ((
  /** The file name (maybe unresolved) of the file we are working on */
  file: string,
  /** The callback to operate in if we had a cache miss */
  callback: Callback<T>,
) => CacheResult<T> | undefined) & {
  /** Return the content of a cached item */
  get(path: string): T | undefined
}

export type CacheResult<T> = {
  pseudo: PseudoPath,
  result: T,
  cached: boolean,
}

/**
 * Create a caching function.
 *
 * When `keyByPseudoPath` is `true` the cache key will be _pseudo path_ of
 * the file (e.g. `/dir/file.vue/render.ts`).
 *
 * When `keyByPseudoPath` is `false` keys will be normalized to the resolved
 * vue template file name (e.g. a request for `/dir/file.vue/script.ts` and
 * one for `/dir/file.vue/render.ts` will both use the same caching key
 * `/dir/file.vue`)
 */
export function createCache<T>(keyByPseudoPath: boolean): Cache<T> {
  const _cache: Record<string, [ number, T ]> = {}

  function cache(path: string, callback: Callback<T>): CacheResult<T> | undefined {
    const pseudo = pseudoPath(path)

    // If we have no timestamp (no file) we just wipe the cache and return
    if (pseudo.timestamp === undefined) {
      delete _cache[resolve(path)]
      return
    }

    // We have a file... We can destructure file and timestamp now...
    const { resolved: xresolved, file: xfile, timestamp } = pseudo
    const key = keyByPseudoPath ? xresolved : xfile

    // If we have this file already cached, and we _don't_ have to create a
    // new one, then we can simply check and return what we havd before...
    if (key in _cache) {
      const [ cachedTimestamp, result ] = _cache[key]
      if (timestamp === cachedTimestamp) {
        return { pseudo, result, cached: true }
      }
    }

    // We can try to read our file, if we can't we wipe the cache and return
    const contents = fileRead(xfile)

    // Was the file deleted _right now_??? ;-)
    if (contents === undefined) {
      delete _cache[key]
      return
    }

    // Call our callback, cache the result, and return it
    const result = callback(pseudo, contents)
    _cache[key] = [ timestamp, result ]
    return { pseudo, result, cached: false }
  }

  // Inject our "get" method on the cache
  return Object.defineProperty(cache, 'get', {
    value: (path: string): T | undefined => {
      const file = resolve(path)
      if (file in _cache) return _cache[file][1]
    },
  })
}
