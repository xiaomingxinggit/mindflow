import { convertToExcalidrawElements, newElementWith } from '@excalidraw/excalidraw'
import type { ExcalidrawElement, ExcalidrawTextElement } from '@excalidraw/excalidraw/element/types'
import type { AppState, BinaryFiles } from '@excalidraw/excalidraw/types'
import { collectMarkdownImageFiles, prepareMarkdownRender } from './markdownRendering'
import { rebindRichContainers } from './richTextBridge'
import { getStylePalette, noteColors } from './visualStyles'

export type MarkdownData = { width: number; imageFiles: string[] }
export function markdownData(text: ExcalidrawTextElement): MarkdownData | undefined {
  return text.customData?.mindflowMarkdown as MarkdownData | undefined
}

export function contentWidth(text: ExcalidrawTextElement, elements: readonly ExcalidrawElement[]) {
  const stored = markdownData(text)?.width
  if (stored) return stored
  const container = elements.find(element => element.id === text.containerId)
  if (container && container.type !== 'arrow') {
    const factor = container.type === 'diamond' ? 2 : container.type === 'ellipse' ? Math.SQRT2 : 1
    return Math.max(120, Math.min(480, container.width / factor - 32))
  }
  return Math.max(160, Math.min(480, text.width || 280))
}

/** Native geometry remains authoritative; only content layout grows containers. */
export function richGeometry(text: ExcalidrawTextElement, elements: readonly ExcalidrawElement[], width: number, height: number) {
  const container = elements.find(element => element.id === text.containerId)
  let x = text.x
  let y = text.y
  let containerSize: { width: number; height: number } | undefined
  if (container && (container.type === 'rectangle' || container.type === 'diamond' || container.type === 'ellipse')) {
    const factor = container.type === 'diamond' ? 2 : container.type === 'ellipse' ? Math.SQRT2 : 1
    containerSize = {
      width: Math.max(80, (width + 32) * factor),
      height: Math.max(container.height, (height + 32) * factor),
    }
    x = container.customData?.mindflowNote ? container.x + 16 : container.x + (containerSize.width - width) / 2
    y = container.customData?.mindflowNote ? container.y + 16 : container.y + (containerSize.height - height) / 2
  } else if (container?.type === 'arrow') {
    x += (text.width - width) / 2
    y += (text.height - height) / 2
  }
  return { x, y, width, height, container, containerSize }
}

export async function updateMarkdownText(elements: readonly ExcalidrawElement[], textId: string, source: string, width: number, files: BinaryFiles) {
  const original = elements.find(element => element.id === textId)
  if (!original || original.type !== 'text') return [...elements]
  let text = newElementWith(original, {
    originalText: source,
    text: source || ' ',
    autoResize: false,
    fontFamily: 2,
    ...(elements.some(element => element.id === original.containerId && element.customData?.mindflowNote) ? { textAlign: 'left' as const, verticalAlign: 'top' as const } : {}),
    customData: { ...original.customData, mindflowMarkdown: { ...original.customData?.mindflowMarkdown, width, imageFiles: collectMarkdownImageFiles(source) } },
  })
  const measured = await prepareMarkdownRender(text, files, width)
  const geometry = richGeometry(text, elements, width, measured.height)
  text = newElementWith(text, { x: geometry.x, y: geometry.y, width, height: measured.height })
  const updated = elements.map(element => {
    if (element.id === textId) return text
    if (element.id === text.containerId && geometry.containerSize) return newElementWith(element, geometry.containerSize)
    return element
  })
  return geometry.containerSize && text.containerId ? rebindRichContainers(updated, [text.containerId]) : updated
}

export async function prepareMarkdownScene(elements: readonly ExcalidrawElement[], files: BinaryFiles) {
  let result = [...elements]
  for (const element of elements) {
    if (element.type !== 'text' || element.isDeleted) continue
    result = await updateMarkdownText(result, element.id, element.originalText, contentWidth(element, result), files)
  }
  return result
}

/** A draft is never inserted until the first edit is accepted. */
export function createTextDraft(elements: readonly ExcalidrawElement[], target: ExcalidrawElement | undefined, point: { x: number; y: number }, state: AppState) {
  const existing = target?.type === 'text' ? target : elements.find(element => element.type === 'text' && element.containerId === target?.id && !element.isDeleted)
  if (existing?.type === 'text') return { elements, text: existing, draft: false }
  const bind = target && ['rectangle', 'ellipse', 'diamond', 'arrow'].includes(target.type) ? target : undefined
  const note = !!bind?.customData?.mindflowNote
  const palette = getStylePalette(bind?.customData?.mindflowStyle === 'system' || state.currentItemRoughness > 0 ? 'system' : 'modern')
  const [created] = convertToExcalidrawElements([{
    type: 'text', x: bind ? bind.x + bind.width / 2 : point.x, y: bind ? bind.y + bind.height / 2 : point.y,
    text: ' ', fontFamily: 2, fontSize: note ? 16 : state.currentItemFontSize,
    strokeColor: note ? noteColors.text : state.activeTool.type === 'text' ? state.currentItemStrokeColor : palette.text, textAlign: bind && !note ? 'center' : 'left',
  }])
  const text = newElementWith(created as ExcalidrawTextElement, {
    text: '', originalText: '', containerId: bind?.id ?? null, angle: bind?.angle ?? 0,
    verticalAlign: bind && !note ? 'middle' : 'top',
  })
  const scene = elements.map(element => element.id === bind?.id ? newElementWith(element, {
    boundElements: [...(element.boundElements ?? []), { id: text.id, type: 'text' }],
  }) : element)
  return { elements: [...scene, text], text, draft: true }
}

export function hitTextTarget(elements: readonly ExcalidrawElement[], point: { x: number; y: number }) {
  for (let index = elements.length - 1; index >= 0; index--) {
    const element = elements[index]
    if (element.isDeleted || element.locked || !['text', 'rectangle', 'ellipse', 'diamond', 'arrow'].includes(element.type)) continue
    const center = { x: element.x + element.width / 2, y: element.y + element.height / 2 }
    const dx = point.x - center.x
    const dy = point.y - center.y
    if (element.type === 'arrow') {
      const local = { x: center.x + dx * Math.cos(element.angle) + dy * Math.sin(element.angle), y: center.y - dx * Math.sin(element.angle) + dy * Math.cos(element.angle) }
      const close = element.points.slice(1).some(([x, y], part) => {
        const [px, py] = element.points[part]
        const vx = x - px
        const vy = y - py
        const t = Math.max(0, Math.min(1, ((local.x - element.x - px) * vx + (local.y - element.y - py) * vy) / (vx * vx + vy * vy || 1)))
        return Math.hypot(local.x - element.x - px - t * vx, local.y - element.y - py - t * vy) < 8
      })
      if (close) return element
      continue
    }
    const x = (dx * Math.cos(element.angle) + dy * Math.sin(element.angle)) / Math.max(element.width / 2, 1)
    const y = (-dx * Math.sin(element.angle) + dy * Math.cos(element.angle)) / Math.max(element.height / 2, 1)
    const hit = element.type === 'diamond' ? Math.abs(x) + Math.abs(y) <= 1 : element.type === 'ellipse' ? x * x + y * y <= 1 : Math.abs(x) <= 1 && Math.abs(y) <= 1
    if (hit) return element
  }
  return undefined
}
