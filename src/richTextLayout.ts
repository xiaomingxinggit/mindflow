import type { ExcalidrawElement, ExcalidrawTextContainer, ExcalidrawTextElement } from '@excalidraw/excalidraw/element/types'

export const richTextPadding = 24
export const richTextInset = richTextPadding * 2

export function richTextContainerFactor(container: ExcalidrawElement) {
  return container.type === 'diamond' ? 2 : container.type === 'ellipse' ? Math.SQRT2 : 1
}

export function richTextContainerSize(container: ExcalidrawTextContainer, text: Pick<ExcalidrawTextElement, 'width' | 'height'>) {
  if (container.type === 'arrow') return null
  const factor = richTextContainerFactor(container)
  return {
    width: (text.width + richTextInset) * factor,
    height: (text.height + richTextInset) * factor,
  }
}

/** Use the shape's inscribed text area for all nine alignment combinations. */
export function richTextContainerPosition(container: ExcalidrawTextContainer, text: ExcalidrawTextElement) {
  if (container.type === 'arrow' || !text.customData?.mindflowMarkdown) return null
  const factor = richTextContainerFactor(container)
  const width = container.width / factor
  const height = container.height / factor
  const left = container.x + (container.width - width) / 2 + richTextPadding
  const top = container.y + (container.height - height) / 2 + richTextPadding
  const freeWidth = width - richTextInset - text.width
  const freeHeight = height - richTextInset - text.height
  if (container.customData?.mindflowNote) return { x: left, y: top }
  return {
    x: left + (text.textAlign === 'right' ? freeWidth : text.textAlign === 'center' ? freeWidth / 2 : 0),
    y: top + (text.verticalAlign === 'bottom' ? freeHeight : text.verticalAlign === 'middle' ? freeHeight / 2 : 0),
  }
}
