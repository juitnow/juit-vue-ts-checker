import '@vue/runtime-core'

declare module '@vue/runtime-core' {
  function createElementBlock(
    type: string,
    props?: Record<string, any> | null,
    children?: any,
    patchFlag?: number,
    dynamicProps?: string[],
    shapeFlag?: number
  ): VNode<RendererNode, RendererElement, {
    [key: string]: any;
  }>;

  function createElementBlock(
    type: VNodeTypes,
    props?: Record<string, any> | null,
    children?: any,
    patchFlag?: number,
    dynamicProps?: string[],
    shapeFlag?: number
  ): VNode<RendererNode, RendererElement, {
    [key: string]: any;
  }>;
}
