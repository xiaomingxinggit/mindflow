import type { ExcalidrawElement, ExcalidrawTextContainer, ExcalidrawTextElement } from '@excalidraw/excalidraw/element/types'

export type RichTextRender = {
  image: HTMLImageElement
  dataUrl: string
  width: number
  height: number
  key: string
}

export type RichTextEditRequest = {
  element: ExcalidrawTextElement | null
  container?: ExcalidrawElement | null
  sceneX: number
  sceneY: number
}

export type RichTextResize = {
  width: number
  height: number
  customData: ExcalidrawElement['customData']
}

type ResizeRenderer = (
  text: ExcalidrawTextElement,
  container: ExcalidrawTextContainer | null,
) => RichTextResize | null

type PrepareRenderer = (elements: readonly ExcalidrawElement[]) => Promise<void>
type RichTextEntry = RichTextRender & { revision: number }

const renders = new Map<string, RichTextEntry>()
let prepareRenderer: PrepareRenderer | undefined
let redrawRenderer: (() => void) | undefined
let editRenderer: ((request: RichTextEditRequest) => boolean) | undefined
let resizeRenderer: ResizeRenderer | undefined
let redrawFrame = 0
let nextRevision = 0
let editingTextId: string | null = null
let displayRevision = 0

function scheduleRedraw() {
  displayRevision += 1
  if (!redrawRenderer || redrawFrame) return
  redrawFrame = requestAnimationFrame(() => {
    redrawFrame = 0
    redrawRenderer?.()
  })
}

/** Hide only the screen copy while the live editor owns this text's display. */
export function setEditingRichText(id: string | null) {
  if (editingTextId === id) return
  editingTextId = id
  scheduleRedraw()
}

/** Cache only: the Markdown source and dimensions remain in the native scene. */
export function registerRichTextRender(id: string, render: RichTextRender) {
  const previous = renders.get(id)
  const revision = previous?.key === render.key ? previous.revision : ++nextRevision
  renders.set(id, { ...render, revision })
  if (revision !== previous?.revision) scheduleRedraw()
}

export function invalidateRichTextRender(id?: string) {
  if (id) renders.delete(id)
  else renders.clear()
  scheduleRedraw()
}

/** The native public API's refresh() redraws without changing scene history. */
export function setRichTextRedrawRenderer(renderer: () => void) {
  redrawRenderer = renderer
  return () => {
    if (redrawRenderer === renderer) redrawRenderer = undefined
  }
}

/** Runs before the native textarea creates an element or changes bindings. */
export function setRichTextEditRenderer(renderer: (request: RichTextEditRequest) => boolean) {
  editRenderer = renderer
  return () => {
    if (editRenderer === renderer) editRenderer = undefined
  }
}

/** Synchronous measurement keeps native resize and content growth in one gesture. */
export function setRichTextResizeRenderer(renderer: ResizeRenderer) {
  resizeRenderer = renderer
  return () => {
    if (resizeRenderer === renderer) resizeRenderer = undefined
  }
}

export function setRichTextPrepareRenderer(renderer: PrepareRenderer) {
  prepareRenderer = renderer
  return () => {
    if (prepareRenderer === renderer) prepareRenderer = undefined
  }
}

export function getRichTextRender(id: string) {
  return renders.get(id)
}

/** Reuses native routing on copied neighbours before one scene/history commit. */
export function rebindRichContainers(
  elements: readonly ExcalidrawElement[],
  changedContainerIds: readonly string[],
): ExcalidrawElement[] {
  if (!changedContainerIds.length) return [...elements]
  if (!globalThis.__mindflowRebindRichContainers) {
    throw new Error('The Excalidraw rich-text binding adapter is unavailable')
  }
  return globalThis.__mindflowRebindRichContainers(elements, changedContainerIds)
}

function getElementRender(element: ExcalidrawElement) {
  return element.type === 'text' && element.customData?.mindflowMarkdown
    ? renders.get(element.id)
    : undefined
}

export const richTextBridge = {
  displayRevision: () => displayRevision,
  resizeBoundText(text: ExcalidrawTextElement, container: ExcalidrawTextContainer | null) {
    return resizeRenderer?.(text, container) ?? null
  },
  edit(request: RichTextEditRequest) {
    return editRenderer?.(request) ?? false
  },
  revision(element: ExcalidrawElement) {
    return (getElementRender(element)?.revision ?? 0) * 2 + (element.id === editingTextId ? 1 : 0)
  },
  drawCanvas(element: ExcalidrawElement, context: CanvasRenderingContext2D, isExporting = false) {
    if (!isExporting && element.type === 'text' && element.id === editingTextId) return true
    const render = getElementRender(element)
    if (!render?.image.complete || !render.image.naturalWidth) return false
    context.drawImage(render.image, 0, 0, element.width, element.height)
    return true
  },
  createSvg(element: ExcalidrawTextElement, document: Document) {
    const render = getElementRender(element)
    if (!render) return null
    const image = document.createElementNS('http://www.w3.org/2000/svg', 'image')
    image.setAttribute('href', render.dataUrl)
    image.setAttribute('width', String(element.width))
    image.setAttribute('height', String(element.height))
    image.setAttribute('preserveAspectRatio', 'none')
    image.setAttribute('data-mindflow-markdown', 'true')
    return image
  },
  async prepare(elements: readonly ExcalidrawElement[]) {
    await prepareRenderer?.(elements)
  },
}

declare global {
  var __mindflowRichText: typeof richTextBridge | undefined
  var __mindflowRebindRichContainers: ((
    elements: readonly ExcalidrawElement[],
    changedContainerIds: readonly string[],
  ) => ExcalidrawElement[]) | undefined
}

// The pinned upstream module calls this bridge in its native rendering paths.
globalThis.__mindflowRichText = richTextBridge
