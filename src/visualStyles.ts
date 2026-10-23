import { convertToExcalidrawElements, newElementWith, restoreElements } from '@excalidraw/excalidraw'
import type { ExcalidrawElementSkeleton } from '@excalidraw/excalidraw/data/transform'
import type { ExcalidrawElement, ExcalidrawTextElement, ExcalidrawTextContainer } from '@excalidraw/excalidraw/element/types'
import type { AppState } from '@excalidraw/excalidraw/types'

export type CanvasStyle = 'modern' | 'system'

type StyleDefaults = Pick<AppState,
  | 'currentItemStrokeColor' | 'currentItemBackgroundColor' | 'currentItemFillStyle'
  | 'currentItemStrokeWidth' | 'currentItemStrokeStyle' | 'currentItemRoughness'
  | 'currentItemOpacity' | 'currentItemFontFamily' | 'currentItemFontSize'
  | 'currentItemRoundness'
>

const noteColors = { background: '#fff3bf', stroke: '#e6b84c', text: '#5c4813' }

export function getStyleDefaults(style: CanvasStyle): StyleDefaults {
  return {
    currentItemStrokeColor: style === 'modern' ? '#475569' : '#1e1e1e',
    currentItemBackgroundColor: style === 'modern' ? '#edf4ff' : '#d0ebff',
    currentItemFillStyle: style === 'modern' ? 'solid' : 'hachure',
    currentItemStrokeWidth: 1,
    currentItemStrokeStyle: 'solid',
    currentItemRoughness: style === 'modern' ? 0 : 1,
    currentItemOpacity: 100,
    currentItemFontFamily: 2,
    currentItemFontSize: 18,
    currentItemRoundness: style === 'modern' ? 'round' : 'sharp',
  }
}

function isNote(element: ExcalidrawElement): boolean {
  return element.type === 'rectangle' && (
    element.customData?.mindflowNote === true
    || element.backgroundColor.toLowerCase() === noteColors.background
    || element.strokeColor.toLowerCase() === noteColors.stroke
  )
}

function isTextContainer(element: ExcalidrawElement): element is ExcalidrawTextContainer {
  return element.type === 'rectangle' || element.type === 'diamond'
    || element.type === 'ellipse' || element.type === 'arrow'
}

/** Read a consistent scene marker after native undo/redo; unmarked new elements are allowed. */
export function readSceneStyle(elements: readonly ExcalidrawElement[]): CanvasStyle | undefined {
  let style: CanvasStyle | undefined
  for (const element of elements) {
    if (element.isDeleted) continue
    const marker = element.customData?.mindflowStyle
    if (marker !== 'modern' && marker !== 'system') continue
    if (style && style !== marker) return undefined
    style = marker
  }
  return style
}

/**
 * Use native text layout on disposable copies, then merge only text metrics and
 * necessary container growth. Never recreate live arrows, bindings or strokes.
 */
function measureTextLayout(elements: readonly ExcalidrawElement[]): Map<string, Partial<ExcalidrawElement>> {
  const updates = new Map<string, Partial<ExcalidrawElement>>()
  const elementMap = new Map(elements.map(element => [element.id, element]))
  const standalone = elements.filter((element): element is ExcalidrawTextElement =>
    element.type === 'text' && !element.isDeleted && !element.containerId,
  )
  const measuredStandalone = restoreElements(
    standalone.map(text => ({ ...text, text: text.originalText })),
    null,
    { repairBindings: true, refreshDimensions: true },
  )
  for (const measured of measuredStandalone) {
    if (measured.type === 'text') {
      updates.set(measured.id, { text: measured.text, width: measured.width, height: measured.height })
    }
  }

  for (const text of elements) {
    if (text.type !== 'text' || text.isDeleted || !text.containerId) continue
    const container = elementMap.get(text.containerId)
    if (!container || !isTextContainer(container)) continue
    const label = {
      text: text.originalText,
      fontFamily: 2,
      fontSize: text.fontSize,
      lineHeight: text.lineHeight,
      textAlign: text.textAlign,
      verticalAlign: text.verticalAlign,
      // Bound labels must be measured against the container, including imports
      // with a fixed text box. The live element keeps its original autoResize.
      autoResize: true,
    }
    const skeleton: ExcalidrawElementSkeleton = {
      ...container,
      // The temporary container has exactly one measured label, without links
      // to unrelated scene elements. The original bindings are never replaced.
      boundElements: null,
      label,
    }
    const measured = convertToExcalidrawElements([skeleton], { regenerateIds: false })
    const measuredContainer = measured.find(element => element.id === container.id)
    const measuredText = measured.find(element => element.type === 'text')
    if (!measuredText || measuredText.type !== 'text' || !measuredContainer) continue
    updates.set(text.id, {
      x: measuredText.x,
      y: measuredText.y,
      width: measuredText.width,
      height: measuredText.height,
      text: measuredText.text,
    })
    if (container.type !== 'arrow') {
      updates.set(container.id, { width: measuredContainer.width, height: measuredContainer.height })
    }
  }
  return updates
}

/** Apply one preset without changing element identity, content or graph geometry. */
export function applyVisualStyle(elements: readonly ExcalidrawElement[], style: CanvasStyle): ExcalidrawElement[] {
  const defaults = getStyleDefaults(style)
  const noteIds = new Set(elements.filter(isNote).map(element => element.id))
  const styled = elements.map(element => {
    const note = noteIds.has(element.id)
    const customData = { ...element.customData, mindflowStyle: style, ...(note ? { mindflowNote: true } : {}) }
    if (element.type === 'image') return newElementWith(element, { customData })

    const base = {
      customData,
      roughness: defaults.currentItemRoughness,
      fillStyle: defaults.currentItemFillStyle,
      strokeWidth: defaults.currentItemStrokeWidth,
      strokeStyle: defaults.currentItemStrokeStyle,
      opacity: defaults.currentItemOpacity,
    }
    if (element.type === 'text') {
      return newElementWith(element, {
        ...base,
        fontFamily: 2,
        strokeColor: element.containerId && noteIds.has(element.containerId)
          ? noteColors.text : style === 'modern' ? '#1f2937' : '#1e1e1e',
      })
    }
    if (element.type === 'rectangle' || element.type === 'diamond' || element.type === 'ellipse') {
      return newElementWith(element, {
        ...base,
        strokeColor: note ? noteColors.stroke : defaults.currentItemStrokeColor,
        backgroundColor: note ? noteColors.background : defaults.currentItemBackgroundColor,
        roundness: style === 'modern'
          ? element.type === 'rectangle' ? { type: 3 } : element.type === 'diamond' ? { type: 2 } : null
          : null,
      })
    }
    return newElementWith(element, { ...base, strokeColor: style === 'modern' ? '#64748b' : '#1e1e1e' })
  })
  const layouts = measureTextLayout(styled)
  return styled.map(element => {
    const layout = layouts.get(element.id)
    return layout ? newElementWith(element, layout) : element
  })
}
