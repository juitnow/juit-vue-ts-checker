import assert from 'assert'
import crypto from 'crypto'
import generate from '@babel/generator'
import { parse as parseBabel } from '@babel/parser'

import {
  RawSourceMap,
  SourceMapConsumer,
} from 'source-map'

import {
  compileTemplate,
  parse as parseVueSFC,
} from '@vue/compiler-sfc'

import {
  File,
  assertIdentifier,
  identifier,
  importDeclaration,
  importDefaultSpecifier,
  isExportNamedDeclaration,
  isFunctionDeclaration,
  stringLiteral,
  traverseFast,
  tsTypeAnnotation,
  tsTypeParameterInstantiation,
  tsTypeQuery,
  tsTypeReference,
} from '@babel/types'

import { VuePathFound } from '../lib/pseudo'

/* ========================================================================== *
 * EXPORTED TYPES                                                             *
 * ========================================================================== */

/** Internal interface between transpiler and compiler */
export interface Transpiled {
  /** Whether this instance was really transpiled or just a shim */
  transpiled: boolean

  /** The extracted <script> part of the code */
  script: string
  /** The source map for the extracted <script> part of the code */
  scriptSourceMap: RawSourceMap

  /** The render function generated from <template> */
  render: string
  /** The source map for the render function generated from <template> */
  renderSourceMap: RawSourceMap
}

/* ========================================================================== *
 * INTERNAL CONSTANTS                                                         *
 * ========================================================================== */

/** An empty source map */
const EMPTY_SOURCE_MAP: RawSourceMap = { version: '3', sources: [], names: [], mappings: '' }

/** A shim for a JavaScript <script> */
const EMPTY_SCRIPT = [
  'import { defineComponent } from "vue";',
  'export default defineComponent({});',
].join('\n')

/** A shim for a JavaScript <template> */
const EMPTY_RENDER = [
  'export function render() {}',
].join('\n')

/* ========================================================================== *
 * OUR ANNOTATING TRANSPILER                                                  *
 * ========================================================================== */

/** Transpile a `.vue` file into a `Transpiled` instance */
export function transpile(pseudoPath: VuePathFound, source: string): Transpiled {
  const fileName = pseudoPath.vue

  // Ask @vue/compiler-sfc to parse the .vue file, splitting it nicely...
  const { descriptor: vue } = parseVueSFC(source, {
    filename: fileName,
    sourceMap: true,
  })

  // Basic checks for what we need
  assert(vue.script, `No script produced for ${fileName}`)
  assert(vue.script.map, `No source map produced for ${fileName}`)
  assert(vue.template, `No template produced for ${fileName}`)
  assert(vue.template.map, `No template source map produced for ${fileName}`)

  // We really want typescript here, otherwise there's nothing we can do...
  // ... or to be honest, we could send the whole thing back and let TypeScript
  // try to generate types from JavaScript (its magic), buuut...
  if (vue.script.lang !== 'ts') {
    return {
      transpiled: false,
      script: EMPTY_SCRIPT,
      scriptSourceMap: EMPTY_SOURCE_MAP,
      render: EMPTY_RENDER,
      renderSourceMap: EMPTY_SOURCE_MAP,
    }
  }

  // Our script here is the AST representation of our <script>...</script>
  const id = crypto.createHash('sha256').update(source, 'utf8').digest('hex').substr(0, 8)

  // Genereate the "render(...)" function from the <template>...</template>
  const template = compileTemplate({
    filename: fileName,
    source: vue.template.content,
    inMap: vue.template.map,
    id: id,
    scoped: false,
    slotted: false,
    ssrCssVars: vue.cssVars,
    compilerOptions: {
      isTS: true,
    },
  })

  // We need source maps, our reports are useless otherwise
  assert(template.map, `No render function source map produced for ${fileName}`)

  // This is the AST of the Vue "render(...)" function's script
  const render = parseAst(template.code, fileName, template.map)

  // Let's do some AST trickeries...
  const _id = identifier(`__${id}__`)

  // Walk the body of the program looking for => export function render(...)
  let annotated = false
  for (const node of render.program.body) {
    // Looking for a _named_ export declaration
    if (! isExportNamedDeclaration(node)) continue

    // Make sure this is _really_ "export function render()"
    const declaration = node.declaration
    if (! isFunctionDeclaration(declaration)) continue
    if (declaration.id?.name !== 'render') continue

    // Make sure the first parameter is an identifier
    const context = declaration.params[0]
    assertIdentifier(context) // yup, ASSERT

    // The type of the parameter should be "InstanceType<typeof __id__>", build it!
    const query = tsTypeQuery(_id) // typeof __id__
    const instantiation = tsTypeParameterInstantiation([ query ]) // <typeof __id__>
    const instanceType = identifier('InstanceType') // InstanceType
    const reference = tsTypeReference(instanceType, instantiation) // InstanceType<typeof __id__>
    const annotation = tsTypeAnnotation(reference) // :InstanceType<typeof __id__>

    // Replace "any" with our proper => InstanceType<typeof __id__>
    context.typeAnnotation = annotation

    // Mark ourselves as "annotated"
    annotated = true
    break
  }

  // Check we annotated the render function
  assert(annotated, `Unable to annotate render function in ${fileName}`)

  // Create => import __id__ from './script'
  const _importDefault = importDefaultSpecifier(_id)
  const _importSource = stringLiteral(pseudoPath.script.slice(0, -3))
  const _import = importDeclaration([ _importDefault ], _importSource)
  render.program.body.unshift(_import)

  // Now we re-generate the full source back from our AST again...
  const generated = generate(render, {
    sourceMaps: true,
    filename: fileName,
    sourceFileName: fileName,
    comments: true, // preserve "@ts-ignore" comments!
  }, source)

  // We need the source map, our reports would be pointless without
  assert(generated.map, `No source map generated transpiling ${fileName}`)

  // Well, we're actually done here!
  return {
    transpiled: true,
    script: vue.script.content,
    scriptSourceMap: vue.script.map,
    render: generated.code,
    // Silly... Babel source maps and SourceMap source maps are incompatible
    renderSourceMap: Object.assign(generated.map, { version: generated.map.version.toString() }),
  }
}

// Parse some typescript code into an AST, update all of the AST locations
// according to the given input source map
function parseAst(code: string, fileName: string, sourceMap: RawSourceMap): File {
  const ast = parseBabel(code, {
    plugins: [ 'typescript' ],
    sourceType: 'module',
    sourceFilename: fileName,
  })

  // It seems that in the AST each _position_ (line, column) is shared
  // across all nodes (at least, that's from Babel's parser) while each
  // _location_ (start, end) is generated per node.
  //
  // I found no other way to get all _position_ other than traversing the
  // entire AST and go through each _location_, and map each _position_.
  //
  // We also need to keep state, as we don't want to translate the original
  // position twice (and therefore screw up the entire tree)
  const sourceMapConsumer = new SourceMapConsumer(sourceMap)

  function translate(position: { line: number, column: number, __marked?: boolean }): boolean {
    if (position.__marked != undefined) return position.__marked

    const original = sourceMapConsumer.originalPositionFor(position)
    if (original && original.line && original.column) {
      position.__marked = true
      position.line = original.line
      position.column = original.column
      return true
    } else {
      position.__marked = false
      return false
    }
  }

  traverseFast(ast, (node) => {
    if (node.loc) {
      const start = translate(node.loc.start)
      const end = translate(node.loc.end)
      if (!(start && end)) node.loc = null
    }
  })

  return ast
}
