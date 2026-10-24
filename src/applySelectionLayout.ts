import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { AppState } from '@excalidraw/excalidraw/types'
import { planCenteredColumn } from './selectionLayout'
import type { LayoutMove } from './selectionLayout'

declare global {
  var __mindflowApplyLayoutTranslations: ((elements: readonly ExcalidrawElement[], moves: readonly LayoutMove[]) => ExcalidrawElement[]) | undefined
}

/** Compute first, then translate copies and route all affected bindings in one action. */
export function applyCenteredColumn(elements: readonly ExcalidrawElement[], state: Readonly<AppState>, gap: number) {
  const plan = planCenteredColumn(elements, state, gap)
  if (!plan.ok) return plan
  if (!plan.changed) return { ok: true as const, elements, changed: false }
  if (!globalThis.__mindflowApplyLayoutTranslations) return { ok: false as const, reason: '排列功能尚未就绪，请稍后重试' }
  try {
    const updated = globalThis.__mindflowApplyLayoutTranslations(elements, plan.moves)
    return { ok: true as const, elements: updated, changed: true }
  } catch {
    return { ok: false as const, reason: '无法完成连线布局，原画布未改动' }
  }
}
