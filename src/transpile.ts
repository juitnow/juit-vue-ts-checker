/* ========================================================================== *
 * OUR VUE => TYPESCRIPT CUSTOM TRANSPILER                                    *
 * ========================================================================== */
import crypto from 'crypto'

import { compileTemplate, parse as parseVueSFC } from '@vue/compiler-sfc'

import generate from '@babel/generator'
import { traverse } from '@babel/core'
import { parse as babelParse } from '@babel/parser'

import {
  File,
  Identifier,
  assertExpression,
  assertIdentifier,
  file,
  identifier,
  isFunctionDeclaration,
  program,
  tsTypeAnnotation,
  tsTypeParameterInstantiation,
  tsTypeQuery,
  tsTypeReference,
  variableDeclaration,
  variableDeclarator,
} from '@babel/types'

import { SourceMapConsumer, RawSourceMap } from 'source-map'

/** Internal interface between transpiler and compiler */
export interface Transpiled {
  /** The content (typescript code) to be compiled */
  content: string,
  /** The original template, as read from the .vue file */
  template: string,
  /** The source map we generated during transpilation */
  sourceMap: RawSourceMap,

  /** For reporting: we split the template in lines, if we have to */
  templateLines?: string[],
  /** For reporting: a `SourceMapConsumer` we can query for locations */
  sourceMapConsumer?: SourceMapConsumer,
}

// Transpile a .vue file into a properly annotated .ts file
export function transpile(fileName: string, source: string): Transpiled | null {
  // Ask @vue/compiler-sfc to parse the .vue file, splitting it nicely...
  const { descriptor: vue } = parseVueSFC(source, {
    filename: fileName,
    sourceMap: true,
  })

  if (! vue.script) throw new Error(`No script produced for ${fileName}`)
  if (! vue.script.map) throw new Error(`No source map produced for ${fileName}`)

  if (vue.script.lang !== 'ts') return null

  if (! vue.template) throw new Error(`No template produced for ${fileName}`)
  if (! vue.template.map) throw new Error(`No template source map produced for ${fileName}`)

  // Our script here is the AST representation of our <script>...</script>
  const script = parseAst(vue.script.content, fileName, vue.script.map)
  const templateId = crypto.createHash('sha256').update(fileName, 'utf8').digest('hex')

  // Genereate the "render(...)" function from the <template>...</template>
  const template = compileTemplate({
    filename: fileName,
    source: vue.template.content,
    inMap: vue.template.map,
    id: templateId,
    scoped: false,
    slotted: false,
    ssrCssVars: vue.cssVars,
    compilerOptions: {
      isTS: true,
    },
  })

  // We need source maps, our reports are useless otherwise
  if (! template.map) throw new Error(`No render function source map produced for ${fileName}`)

  // This is tha AST of the Vue "render(...)" function
  const render = parseAst(template.code, fileName, template.map)

  // Let's start making some "magic" happen: combine the two ASTs
  const combined = file(program(
      [ ...script.program.body, ...render.program.body ],
      [ ...script.program.directives, ...render.program.directives ],
  ))

  // The id here is a variable name we use to assign our component to. This
  // is used to infer its type, so we can correctly annotate the render
  // function. So basically normally we get something like:
  //
  //     export default defineComponent() { ... }
  //     export function render(_ctx: any) { ... }
  //
  // We want to get those two rewritten as follows:
  //
  //     const _default_ = defineComponent() { ... }
  //     export default _default_
  //     export function render(_ctx: InstanceType<typeof _default_>)
  //
  // So, ultimately, when we pass off this new source to TypeScript, we get
  // proper type checking between component and template :-) BINGO!

  // The id here is the name of our _default_ variable
  let id: Identifier | undefined = undefined
  let annotated = false

  traverse(combined, {
    // export default defineComponent(...)
    ExportDefaultDeclaration(path) {
      assertExpression(path.node.declaration)

      // Here we replace
      //   export default defineComponent(...);
      // with a simple
      //   const _default_ = defineComponent(...);
      //   export default _default_;
      id ||= path.scope.generateUidIdentifier('_default_')
      const assignment = variableDeclarator(id, path.node.declaration)
      const declaration = variableDeclaration('const', [ assignment ])

      // Insert variable assignment _before_ export default
      path.insertBefore(declaration)

      // Replace export default declaration with our id
      path.node.declaration = id
    },

    // export function render(_ctx: any, ...)
    ExportNamedDeclaration(path) {
      const declaration = path.node.declaration

      // Make sure this is _really_ "export function render()"
      if (isFunctionDeclaration(declaration) && (declaration.id?.name === 'render')) {
        // Make sure the first parameter is an identifier
        const context = declaration.params[0]
        assertIdentifier(context)

        // This is to make sure we use the same name as above
        id ||= path.scope.generateUidIdentifier('_default_')

        // The type of the parameter should be "InstanceType<typeof _default_>", build it!
        const query = tsTypeQuery(id) // typeof _default_
        const instantiation = tsTypeParameterInstantiation([ query ]) // <typeof _default_>
        const instanceType = identifier('InstanceType') // InstanceType
        const reference = tsTypeReference(instanceType, instantiation) // InstanceType<typeof _default_>
        const annotation = tsTypeAnnotation(reference) // :InstanceType<typeof _default_>

        // Replace "any" with our proper "InstanceType<typeof _default_>"
        context.typeAnnotation = annotation

        // Mark ourselves as "annotated"
        annotated = true
      }
    },
  })

  // If we can't annotate, fail... It'd be pointless anyway
  if (! annotated) throw new Error(`Unable to annontate render function for ${fileName}`)

  // Now we generate the full combined TypeScript source from our annotated
  // AST, and remember our source map, too!
  const generated = generate(combined, {
    sourceMaps: true,
    filename: fileName,
    sourceFileName: fileName,
  }, source)

  // We need the source map, our reports would be pointless without
  if (! generated.map) throw new Error(`No source map generated transpiling ${fileName}`)

  const generatedMap: RawSourceMap = {
    version: generated.map.version === undefined ? '3' : generated.map.version.toString(),
    sources: generated.map.sources,
    names: generated.map.names,
    sourceRoot: generated.map.sourceRoot,
    sourcesContent: generated.map.sourcesContent,
    mappings: generated.map.mappings,
    file: generated.map.file,
  }

  // Done.. Return our content and sourceMap
  return { content: generated.code, template: source, sourceMap: generatedMap }
}

// Parse some typescript code into an AST, update all of the AST locations
// according to the given input source map
function parseAst(code: string, fileName: string, sourceMap: RawSourceMap): File {
  const ast = babelParse(code, {
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
  // But we need to keep state, as we don't want to translate the original
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

  traverse(ast, {
    enter(path) {
      if (path.node.loc) {
        const start = translate(path.node.loc.start)
        const end = translate(path.node.loc.end)
        if (!(start && end)) path.node.loc = null
      }
    },
  })

  return ast
}
