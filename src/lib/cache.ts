import { Path } from 'typescript'
import { colors } from './colors'
import { fileRead } from './files'
import { logger } from './logger'

import {
  PseudoPath,
  PseudoPathFound,
  isPseudoPathNotFound,
  isVuePath,
  pseudoPath,
} from './pseudo'

const log = logger('cache')
const { f, k } = colors()

/** Our (internal) cache callback type */
type Callback<T> = (path: PseudoPathFound, contents: string) => T

/**
 * A function executing a callback if and only if the file it was invoked
 * with was changed since the last time it was called.
 */
export type Cache<T> = ((
  /** The file name (maybe unresolved) of the file we are working on */
  file: string | PseudoPath,
  /** The callback to operate in if we had a cache miss */
  callback: Callback<T>,
  /** The encoding used to read the file (defaults to `utf8`) */
  enciding?: BufferEncoding,
) => [ PseudoPath, T? ]) & {
  /** Return the content of a cached item */
  get(path: Path): T | undefined
  /** Forcedly cache a path entry */
  set(path: Path, content: T, timestamp: number): void
  /** Forcedly delete a cache entry */
  del(path: Path): void
}

/**
 * Create a caching function.
 */
export function createCache<T>(): Cache<T> {
  const _cache: Record<string, [ number, T ]> = {}

  function get(path: Path): T | undefined {
    if (path in _cache) return _cache[path][1]
  }

  function set(path: Path, content: T, timestamp: number): void {
    _cache[path] = [ timestamp, content ]
  }

  function del(path: Path): void {
    delete _cache[path]
  }

  function cache(
      _file: string | PseudoPath,
      callback: Callback<T>,
      encoding: BufferEncoding = 'utf8',
  ): [ PseudoPath, T? ] {
    const _pseudo = typeof _file === 'string' ? pseudoPath(_file) : _file

    if (isPseudoPathNotFound(_pseudo)) {
      log.debug('Deleting', f(_pseudo.path), k('(not found)'))
      delete _cache[_pseudo.path]
      return [ _pseudo ]
    }

    // If we have this file already cached, and we _don't_ have to create a
    // new one, then we can simply check and return what we havd before...
    if (_pseudo.path in _cache) {
      const [ cachedTimestamp, result ] = _cache[_pseudo.path]
      if (_pseudo.timestamp === cachedTimestamp) {
        return [ _pseudo, result ]
      } else {
        log.debug('Timestamp difference', f(_pseudo.path), k(`(${_pseudo.timestamp} != ${cachedTimestamp})`))
      }
    } else {
      log.debug('Not in cache', f(_pseudo.path))
    }

    // We can try to read our file, if we can't we wipe the cache and return
    const contents = isVuePath(_pseudo) ?
      fileRead(_pseudo.vue, encoding) :
      fileRead(_pseudo.path, encoding)

    // Was the file deleted _right now_??? ;-)
    if (contents === undefined) {
      log.debug('Deleting', f(_pseudo.path), k('(disappeared)'))
      delete _cache[_pseudo.path]
      return [ _pseudo ]
    }


    // Call our callback, and see what it returns
    const result = callback(_pseudo, contents)

    // Encache our result and return our cache entry...
    _cache[_pseudo.path] = [ _pseudo.timestamp, result ]
    return [ _pseudo, result ]
  }

  // Inject our "get" method on the cache
  return Object.defineProperties(cache, {
    get: { value: get },
    set: { value: set },
    del: { value: del },
  })
}
