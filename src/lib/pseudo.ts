import { directoryExists, fileExists, resolve, ResolvedPath } from './files'
import { sep } from 'path'

/* ========================================================================== *
 * PSEUDO FILES OPS FOR VUE SFC                                               *
 * ========================================================================== */

/**
 * A type describing a _pseudo-path_.
 *
 * When `type` is present, `file` will contain the `/dir/file.vue` file name,
 * then `index`, `render` and `script` will contain the indivuidual pseudo
 * paths. Here `type` indicates which path was requested to be resolved.
 *
 * When only `file` is present, this represents an _existing_ file on disk.
 *
 * When `file` is not present, the file did not exist.
 */
export type PseudoPath = {
  type?: undefined,
  file?: undefined,
} | {
  type?: undefined,
  file: ResolvedPath,
} | {
  type: 'vue' | 'index' | 'render' | 'script',
  file: ResolvedPath,
  index: ResolvedPath,
  render: ResolvedPath,
  script: ResolvedPath,
}


/** The extension for the vue files to consider */
const VUE_EXT = '.vue'

/** The pseudo-file suffix for the index file, `/index.ts` */
const VUE_PSEUDO_INDEX_SFX = `${sep}index.ts`
/** The pseudo-file extension for the index file, `.vue/index.ts` */
const VUE_PSEUDO_INDEX_EXT = `${VUE_EXT}${VUE_PSEUDO_INDEX_SFX}`
/** The number of characters to cut to convert a pseudo index into a file */
const VUE_PSEUDO_INDEX_LEN = VUE_PSEUDO_INDEX_SFX.length

/** The pseudo-file suffix for the render file, `/render.ts` */
const VUE_PSEUDO_RENDER_SFX = `${sep}render.ts`
/** The pseudo-file extension for the render file, `.vue/render.ts` */
const VUE_PSEUDO_RENDER_EXT = `${VUE_EXT}${VUE_PSEUDO_RENDER_SFX}`
/** The number of characters to cut to convert a pseudo render into a file */
const VUE_PSEUDO_RENDER_LEN = VUE_PSEUDO_RENDER_SFX.length

/** The pseudo-file suffix for the script file, `/script.ts` */
const VUE_PSEUDO_SCRIPT_SFX = `${sep}script.ts`
/** The pseudo-file extension for the script file, `.vue/render.ts` */
const VUE_PSEUDO_SCRIPT_EXT = `${VUE_EXT}${VUE_PSEUDO_SCRIPT_SFX}`
/** The number of characters to cut to convert a pseudo script into a file */
const VUE_PSEUDO_SCRIPT_CUT = VUE_PSEUDO_SCRIPT_SFX.length

/** Resolve a potentially non absolute file name into a `PseudoPath` */
export function pseudoPath(path: string): PseudoPath {
  const file = resolve(path)

  let vue: ResolvedPath
  let type: 'vue' | 'index' | 'render' | 'script'
  if (file.endsWith(VUE_EXT)) {
    vue = file
    type = 'vue'
  } else if (file.endsWith(VUE_PSEUDO_INDEX_EXT)) {
    vue = file.substr(0, file.length - VUE_PSEUDO_INDEX_LEN) as ResolvedPath
    type = 'index'
  } else if (file.endsWith(VUE_PSEUDO_RENDER_EXT)) {
    vue = file.substr(0, file.length - VUE_PSEUDO_RENDER_LEN) as ResolvedPath
    type = 'render'
  } else if (file.endsWith(VUE_PSEUDO_SCRIPT_EXT)) {
    vue = file.substr(0, file.length - VUE_PSEUDO_SCRIPT_CUT) as ResolvedPath
    type = 'script'
  } else {
    return fileExists(file) ? { file } : { }
  }

  // This _could_ be a pseudo-file, or we can have a directory called "dir.vue"
  if (directoryExists(vue)) {
    return fileExists(file) ? { file } : { }
  } else {
    return fileExists(vue) ? {
      file: vue,
      index: vue + VUE_PSEUDO_INDEX_SFX as ResolvedPath,
      render: vue + VUE_PSEUDO_RENDER_SFX as ResolvedPath,
      script: vue + VUE_PSEUDO_SCRIPT_SFX as ResolvedPath,
      type,
    } : { }
  }
}
