import { useEffect, useId, useLayoutEffect, useState, useSyncExternalStore } from 'react'
import { CaptureUpdateAction } from '@excalidraw/excalidraw'
import type { Action, PanelComponentProps } from '@excalidraw/excalidraw/actions/types'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { AppState, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { applyCenteredColumn } from './applySelectionLayout'
import { resolveLayoutSelection } from './selectionLayout'
import './SelectionLayoutControls.css'

type LayoutControlsState = { draft: string; lastGap: number; error: string | null; blockedReason: string | null }

function readGap(draft: string) {
  const gap = Number(draft)
  return draft.trim() && Number.isFinite(gap) && gap >= 0 ? gap : null
}

function interactionReason(state: Readonly<AppState>, blockedReason: string | null) {
  if (state.viewModeEnabled) return '只读模式下不能排列'
  if (blockedReason) return blockedReason
  if (state.editingTextElement || state.editingLinearElement || state.newElement || state.multiElement) return '请先完成当前编辑'
  if (state.selectedElementsAreBeingDragged || state.isResizing || state.isRotating || state.resizingElement || state.selectionElement) return '请先完成拖动或缩放'
  return null
}

// Keep the native 0.18.1 center icon so the existing alignment row remains familiar.
const centerIcon = <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><g stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round">
  <path d="M10 18.333v-2.916M10 4.583V1.667" strokeLinecap="round" />
  <path d="M10 11.667V8.333" />
  <path d="M4.792 13.125v.417c0 .92.746 1.666 1.666 1.666h7.084c.92 0 1.666-.746 1.666-1.666v-.417c0-.92-.746-1.667-1.666-1.667H6.458c-.92 0-1.666.746-1.666 1.667ZM6.458 6.458v.417c0 .92.747 1.667 1.667 1.667h3.75c.92 0 1.667-.747 1.667-1.667v-.417c0-.92-.746-1.666-1.667-1.666h-3.75c-.92 0-1.667.746-1.667 1.666Z" />
</g></svg>

/** One controller and component type per editor; selection changes never discard a draft. */
function createLayoutController() {
  let state: LayoutControlsState = { draft: '24', lastGap: 24, error: null, blockedReason: null }
  const listeners = new Set<() => void>()
  const snapshot = () => state
  const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
  const update = (patch: Partial<LayoutControlsState>) => {
    if (Object.entries(patch).every(([key, value]) => state[key as keyof LayoutControlsState] === value)) return
    state = { ...state, ...patch }
    listeners.forEach(listener => listener())
  }
  const invalidReason = (elements: readonly ExcalidrawElement[], appState: Readonly<AppState>) => {
    const reason = interactionReason(appState, state.blockedReason)
    if (reason) return reason
    const selection = resolveLayoutSelection(elements, appState)
    return selection.ok ? null : selection.reason
  }

  function PanelComponent({ elements, appState, updateData }: PanelComponentProps) {
    const current = useSyncExternalStore(subscribe, snapshot, snapshot)
    const id = useId()
    const reason = invalidReason(elements, appState)
    const gapError = readGap(current.draft) === null ? '请输入有限的非负间距' : null
    const message = gapError || reason || current.error
    const disabled = !!(reason || gapError)
    return <>
      <button className="ToolIcon ToolIcon_type_button ToolIcon_size_medium mindflow-centered-column" type="button" title={reason || '居中成列'} aria-label="居中成列" disabled={disabled} onClick={() => updateData(null)}>
        <span className="ToolIcon__icon">{centerIcon}</span>
      </button>
      <div className="mindflow-selection-layout" onPointerDown={event => event.stopPropagation()} onKeyDown={event => {
        event.stopPropagation()
        if (event.nativeEvent.isComposing || event.keyCode === 229) return
        if (event.key === 'Escape') { event.preventDefault(); update({ draft: String(current.lastGap), error: null }) }
        if (event.key === 'Enter') { event.preventDefault(); updateData(null) }
      }} onKeyUp={event => event.stopPropagation()}>
        <label className="mindflow-selection-layout-label" htmlFor={id}>排列间距</label>
        <div className="mindflow-selection-layout-row">
          <div className="mindflow-selection-layout-value"><input id={id} type="number" min="0" step="1" inputMode="decimal" value={current.draft} aria-label="排列间距" aria-invalid={!!gapError} aria-describedby={`${id}-help ${id}-status`} onChange={event => update({ draft: event.target.value, error: null })} /><span aria-hidden="true">px</span></div>
          <button type="button" className="mindflow-selection-layout-apply" disabled={disabled} onClick={() => updateData(null)}>应用</button>
        </div>
        <p id={`${id}-help`} className="mindflow-selection-layout-help">相邻对象边缘之间的距离</p>
        <p id={`${id}-status`} className="mindflow-selection-layout-status" role="status">{message}</p>
      </div>
    </>
  }

  const action: Action = {
    name: 'alignHorizontallyCentered',
    label: 'labels.centerHorizontally',
    keywords: ['居中成列', '排列间距'],
    icon: centerIcon,
    trackEvent: false,
    predicate: (elements, appState) => !invalidReason(elements, appState) && readGap(state.draft) !== null,
    PanelComponent,
    perform: (elements, appState) => {
      const gap = readGap(state.draft)
      const reason = gap === null ? '请输入有限的非负间距' : invalidReason(elements, appState)
      if (reason || gap === null) { update({ error: reason }); return false }
      try {
        const result = applyCenteredColumn(elements, appState, gap)
        if (!result.ok) { update({ error: result.reason }); return false }
        update({ draft: String(gap), lastGap: gap, error: null })
        return result.changed ? { elements: result.elements, captureUpdate: CaptureUpdateAction.IMMEDIATELY } : false
      } catch {
        update({ error: '排列失败，请重试' })
        return false
      }
    },
  }
  return { action, setBlocked: (blockedReason: string | null) => update({ blockedReason }) }
}

/** Register after Excalidraw's constructor has installed its built-in actions. */
export function useSelectionLayoutAction(api: ExcalidrawImperativeAPI | null, blockedReason: string | null) {
  const [controller] = useState(createLayoutController)
  useLayoutEffect(() => { controller.setBlocked(blockedReason) }, [blockedReason, controller])
  useEffect(() => {
    if (!api) return
    api.registerAction(controller.action)
    // LayerUI compares values after refresh(); a same-value tool object refreshes
    // the already-visible panel without changing tools, selection or history.
    api.updateScene({ appState: { activeTool: { ...api.getAppState().activeTool } }, captureUpdate: CaptureUpdateAction.NEVER })
  }, [api, controller])
}
