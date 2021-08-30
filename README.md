# Vue.js TypeScript template checker

This package provides a TypeScript-based template checker for Vue.js 3.x.

* [Requirements](#requirements)
* [Vue CLI Usage](#vue-cli-usage)
* [Command line usage](#command-line-usage)
* [How does it work](#how-does-it-work)
* [Copyright Notice](NOTICE.md)
* [License](LICENSE.md)


## Requirements

This package does not aim for the _widest_ compatibility but looks at the
future of Vue and takes _now_ as the starting point for further development.

Therefore, the **minimal** requirements to work with this are:

* Vue **3.x**
* Vue CLI Service **5.x**
* TypeScript **4.x**
* WebPack **5.x**

Older version are not (and will not be) supported. Time to move on!


## Vue CLI Usage

First of all install as a dev dependency:

```bash
$ npm install --save-dev '@juit/vue-ts-checker'
```

Using this plugin should be as easy as a few configuration changes in your
`vue.config.js` file. As a starting point:

```javascript
const VueTsCheckerPlugin = require('@juit/vue-ts-checker').VueTsCheckerPlugin

module.exports = {
  chainWebpack: (config) => {
    // We don't need the "fork-ts-checker" plugin anymore, as "vue-ts-checker"
    // also checks all of the TypeScript included in each compilation!
    config.plugins.delete('fork-ts-checker')

    // Let the "vue-ts-checker" plugin take care of checking Vue and TypeScript
    config.plugin('vue-ts-checker').use(new VueTsCheckerPlugin())
  }
}
```

There's nothing to configure, all the compilation and checking preferences
will be read from your `tsconfig.json` file.

Just make sure that your Vue file have extension `.vue`, and your TypeScript
files have extension `.ts`, as hesoteric configurations are not supported
for now...

P.S. as in `fork-ts-checker` we use a _child process_ to asynchronously check
the sources, without blocking the main Webpack thread.


## Command line usage

There's _minimal_ support for command line usage, but I guess it's a good
option to test this out without modifying your entire build:

```bash
$ npm install -g '@juit/vue-ts-checker'
$ vue-ts-checker

Generated 2 reports (has errors)

TS2365 [ERROR] Operator '+' cannot be applied to types 'K' and 'number'.
 | at src/foo.vue line 13 col 164
 |
 |  …… 4 ? 3 : 4} scroll-fadein-bottom delay-${$index + 1}00 scroll-reverse]
 |                                             ^^^^^^^^^^

TS1005 [ERROR] ',' expected.
 | at src/bar.ts line 2 col 29
 |
 | export const foo: NO = 'bar' NO
 |                              ^^

Checked 41 files in 4.334 sec
$
```

Install and when run `vue-ts-checker` will analyse all the files in your
current directory, according to the _include_ and _exclude_ you specified
in your `tsconfig.json`.


## How does it work

Basically, `@vue/compiler-sfc` does most of the work for us.

Given a `.vue` file like

```html
<template>
  <div :class="clazz"/>
</template>

<script lang="ts">
  import { defineComponent } from 'vue'

  export default defineComponent({
    data() {
      return { clazz: 'myclass' }
    }
  })
</script>
```

The Vue SFC compiler prepares two scripts:

The first is basically the contents of `<script>`:

```typescript
import { defineComponent } from 'vue'

export default defineComponent({
  data() {
    return { clazz: 'myclass' }
  }
})
```

And the second is the `render(...)` function:

```typescript
export function render(_ctx: any) {
  const _component_foo = _resolveComponent("foo")

  return (_openBlock(), _createBlock(_Fragment, null, [
    _createVNode("div", { class: _ctx.clazz }, null, 2 /* CLASS */),
  ]))
}
```

The annotated _type_ of the component instance passed to the render function
here is `any`, which in most cases would work as this is generated code...

But when we want to check component and render function _together_ all our
wonderful typing system is stripped out by that `any`.

So, using some AST trickery, we rewrite the two script above to look
somehow similar to this:

```typescript
import { defineComponent } from 'vue'

const __component__ = defineComponent({
  data() {
    return { clazz: 'myclass' }
  }
})

export function render(_ctx: InstanceType<typeof __component__>) {
  const _component_foo = _resolveComponent("foo")

  return (_openBlock(), _createBlock(_Fragment, null, [
    _createVNode("div", { class: _ctx.clazz }, null, 2 /* CLASS */),
  ]))
}

export default __component__
```

And now we can feed this to TypeScript which will do the proper type checking!

For TypeScript we rely on `LanguageServices` (exactly as _Vetur_ does), so we
can more easily interact with a pseudo file system, and for every `.vue` file
(e.g. `/dir/file.vue`) we feed three sources:

A shim `/dir/file.vue/index.ts` containing something like:

```typescript
import './render'                 // import the render function from <template>
export * from './script'          // export whatever <script> is exporting
import _default_ from './script'  // import the "export default" from <script>
export default _default_          // re-export our default
```

The original contents of `<script>` are exposed as `/dir/file.vue/script.ts`:

```typescript
import { defineComponent } from 'vue'

export defineComponent({
  data() {
    return { clazz: 'myclass' }
  }
})
```

And finally our `<template>` render function is in `/dir/file.vue/render.ts`:

```typescript
import __component__ from './script'

export function render(_ctx: InstanceType<typeof __component__>) {
  const _component_foo = _resolveComponent("foo")

  return (_openBlock(), _createBlock(_Fragment, null, [
    _createVNode("div", { class: _ctx.clazz }, null, 2 /* CLASS */),
  ]))
}

export default __component__
```

Using three _pseudo files_ simplifies quite a lot the job of preserving the
scopes between _script_ and _render function_, and TypeScript automatically
tries to import `/dir/file.vue/index.ts` when told to import `/dir/file.vue`
(as it doesn't recognize the `.vue` extension).
