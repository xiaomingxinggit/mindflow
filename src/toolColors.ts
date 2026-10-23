import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { AppState } from '@excalidraw/excalidraw/types'
import { getStylePalette, noteColors } from './visualStyles'
import type { CanvasStyle } from './visualStyles'

type DrawingTool = 'rectangle' | 'diamond' | 'ellipse' | 'line' | 'note' | 'text' | 'freedraw'
type DrawingColors = { stroke: string; background: string }
export type ToolColors = Partial<Record<DrawingTool, DrawingColors>>

function drawingTool(type: string): DrawingTool | undefined {
  if (type === 'arrow') return 'line'
  if (['rectangle', 'diamond', 'ellipse', 'line', 'note', 'text', 'freedraw'].includes(type)) return type as DrawingTool
}

/** Native color actions update a global recent color; retain only the affected tool's preference. */
export function createToolColors(initial: ToolColors = {}) {
  let preferences = initial
  let previous: { tool: string; selected: string; stroke: string; background: string } | undefined
  let selectedColors = new Map<string, DrawingColors>()

  function get(tool: DrawingTool, style: CanvasStyle): DrawingColors {
    const palette = getStylePalette(style)
    return preferences[tool] ?? {
      stroke: tool === 'note' ? noteColors.stroke : tool === 'text' ? palette.text : tool === 'line' || tool === 'freedraw' ? palette.line : palette.stroke,
      background: tool === 'note' ? noteColors.background : palette.background,
    }
  }

  return {
    get,
    snapshot: () => preferences,
    reset() { preferences = {}; previous = undefined; selectedColors.clear() },
    observe(elements: readonly ExcalidrawElement[], state: AppState, style: CanvasStyle) {
      const tool = state.activeTool.type
      const selectedIds = Object.keys(state.selectedElementIds).filter(id => state.selectedElementIds[id])
      const selected = selectedIds.sort().join(',')
      const stroke = state.currentItemStrokeColor
      const background = state.currentItemBackgroundColor
      const current = { tool, selected, stroke, background }
      const active = drawingTool(tool)
      const selectedElements = selectedIds.length ? elements.filter(element => !element.isDeleted && state.selectedElementIds[element.id]) : []
      const oldSelectedColors = selectedColors
      selectedColors = new Map(selectedElements.map(element => [element.id, { stroke: element.strokeColor, background: element.backgroundColor }]))
      if (!previous || previous.tool !== tool) {
        const colors = active ? get(active, style) : undefined
        previous = colors ? { ...current, ...colors } : current
        if (colors && (colors.stroke !== stroke || colors.background !== background)) {
          return { currentItemStrokeColor: colors.stroke, currentItemBackgroundColor: colors.background }
        }
        return
      }
      const strokeChanged = previous.stroke !== stroke
      const backgroundChanged = previous.background !== background
      if (previous.selected === selected) {
        for (const element of selectedElements) {
          const target = element.customData?.mindflowNote ? 'note' : drawingTool(element.type)
          const before = oldSelectedColors.get(element.id)
          if (!target || !before) continue
          const changedStroke = before.stroke !== element.strokeColor
          const changedBackground = before.background !== element.backgroundColor
          if (!changedStroke && !changedBackground) continue
          preferences = { ...preferences, [target]: {
            ...get(target, style), ...(changedStroke ? { stroke: element.strokeColor } : {}), ...(changedBackground ? { background: element.backgroundColor } : {}),
          } }
        }
        if (!selectedElements.length && active && (strokeChanged || backgroundChanged)) {
          preferences = { ...preferences, [active]: { ...get(active, style), ...(strokeChanged ? { stroke } : {}), ...(backgroundChanged ? { background } : {}) } }
        }
      }
      previous = current
    },
  }
}
