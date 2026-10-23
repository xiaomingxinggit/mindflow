import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { CaptureUpdateAction, convertToExcalidrawElements, newElementWith, sceneCoordsToViewportCoords, viewportCoordsToSceneCoords } from '@excalidraw/excalidraw'
import type { ExcalidrawElement, ExcalidrawFlowchartNodeElement, ExcalidrawLinearElement } from '@excalidraw/excalidraw/element/types'
import type { AppState, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { applyVisualStyle } from './visualStyles'
import type { CanvasStyle } from './visualStyles'
import './QuickConnections.css'

type Point = { x: number; y: number }
type Side = 'top' | 'right' | 'bottom' | 'left'
type Port = Point & { side: Side }

export type QuickConnectionDraft = {
  elements: readonly ExcalidrawElement[]
  textId: string
  nodeId: string
  sourceId: string
  arrowId: string
}

type Options = {
  api: ExcalidrawImperativeAPI | null
  elements: readonly ExcalidrawElement[]
  appState: AppState | null
  style: CanvasStyle
  disabled?: boolean
  onCreateDraft: (draft: QuickConnectionDraft) => void
}

type Drag = {
  source: ExcalidrawFlowchartNodeElement
  start: Port
  origin: Point
  pointer: Point
  target: ExcalidrawFlowchartNodeElement | null
  end: Point
}

const sides: Side[] = ['top', 'right', 'bottom', 'left']
const sideNames = { top: '上', right: '右', bottom: '下', left: '左' }
const snapDistance = 24
const minimumDrag = 8

function isNode(element: ExcalidrawElement): element is ExcalidrawFlowchartNodeElement {
  return !element.isDeleted && !element.locked && (element.type === 'rectangle' || element.type === 'diamond' || element.type === 'ellipse')
}

function rotate(point: Point, center: Point, angle: number): Point {
  const x = point.x - center.x
  const y = point.y - center.y
  return { x: center.x + x * Math.cos(angle) - y * Math.sin(angle), y: center.y + x * Math.sin(angle) + y * Math.cos(angle) }
}

function center(node: ExcalidrawElement): Point {
  return { x: node.x + node.width / 2, y: node.y + node.height / 2 }
}

function ports(node: ExcalidrawFlowchartNodeElement): Port[] {
  const middle = center(node)
  return [
    { x: middle.x, y: node.y },
    { x: node.x + node.width, y: middle.y },
    { x: middle.x, y: node.y + node.height },
    { x: node.x, y: middle.y },
  ].map((point, index) => ({ ...rotate(point, middle, node.angle), side: sides[index] }))
}

function nearestPort(node: ExcalidrawFlowchartNodeElement, point: Point): Port {
  return ports(node).reduce((nearest, port) => Math.hypot(port.x - point.x, port.y - point.y) < Math.hypot(nearest.x - point.x, nearest.y - point.y) ? port : nearest)
}

function contains(element: ExcalidrawElement, point: Point): boolean {
  const local = rotate(point, center(element), -element.angle)
  const halfWidth = Math.max(element.width / 2, 1)
  const halfHeight = Math.max(element.height / 2, 1)
  const x = Math.abs(local.x - element.x - halfWidth) / halfWidth
  const y = Math.abs(local.y - element.y - halfHeight) / halfHeight
  if (element.type === 'diamond') return x + y <= 1
  if (element.type === 'ellipse') return x * x + y * y <= 1
  return x <= 1 && y <= 1
}

function segmentDistance(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const ratio = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1)))
  return Math.hypot(point.x - a.x - ratio * dx, point.y - a.y - ratio * dy)
}

/** Shape edges are measured in scene space, with the snap tolerance converted from pixels. */
function borderDistance(node: ExcalidrawFlowchartNodeElement, point: Point): number {
  if (contains(node, point)) return 0
  const local = rotate(point, center(node), -node.angle)
  const { x, y, width, height } = node
  let outline: Point[]
  if (node.type === 'ellipse') {
    outline = Array.from({ length: 48 }, (_, index) => ({ x: x + width / 2 + width / 2 * Math.cos(index * Math.PI / 24), y: y + height / 2 + height / 2 * Math.sin(index * Math.PI / 24) }))
  } else if (node.type === 'diamond') {
    outline = [{ x: x + width / 2, y }, { x: x + width, y: y + height / 2 }, { x: x + width / 2, y: y + height }, { x, y: y + height / 2 }]
  } else {
    outline = [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }]
  }
  return Math.min(...outline.map((a, index) => segmentDistance(local, a, outline[(index + 1) % outline.length])))
}

function nodeAt(elements: readonly ExcalidrawElement[], point: Point): ExcalidrawFlowchartNodeElement | null | undefined {
  const byId = new Map(elements.map(element => [element.id, element]))
  for (let index = elements.length - 1; index >= 0; index--) {
    const element = elements[index]
    if (element.isDeleted || element.type === 'line' || element.type === 'arrow' || element.type === 'freedraw' || element.type === 'frame' || element.type === 'magicframe' || !contains(element, point)) continue
    if (isNode(element)) return element
    if (element.type === 'text' && element.containerId) {
      const container = byId.get(element.containerId)
      if (container && isNode(container)) return container
    }
    return null
  }
  return undefined
}

function targetAt(elements: readonly ExcalidrawElement[], point: Point, sourceId: string, zoom: number): ExcalidrawFlowchartNodeElement | null {
  const hit = nodeAt(elements, point)
  if (hit === null || hit?.id === sourceId) return null
  if (hit && hit.id !== sourceId) return hit
  let best: ExcalidrawFlowchartNodeElement | null = null
  let distance = snapDistance / zoom
  for (let index = elements.length - 1; index >= 0; index--) {
    const element = elements[index]
    if (!isNode(element) || element.id === sourceId) continue
    const next = borderDistance(element, point)
    if (next < distance) {
      best = element
      distance = next
    }
  }
  return best
}

function bindNodes(elements: readonly ExcalidrawElement[], sourceId: string, targetId: string, arrowId: string): ExcalidrawElement[] {
  return elements.map(element => element.id === sourceId || element.id === targetId ? newElementWith(element, {
    boundElements: [...(element.boundElements ?? []).filter(bound => bound.id !== arrowId), { type: 'arrow' as const, id: arrowId }],
  }) : element)
}

/** A capture-phase bridge intercepts node arrows before the native canvas starts its gesture. */
export function useQuickConnections(options: Options) {
  const latest = useRef(options)
  useEffect(() => { latest.current = options }, [options])
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const cleanup = useRef<(() => void) | null>(null)

  useEffect(() => () => cleanup.current?.(), [])

  function stopDrag() {
    cleanup.current?.()
    cleanup.current = null
    setDrag(null)
  }

  function finish(current: Drag) {
    const { api, style, onCreateDraft } = latest.current
    if (!api || Math.hypot(current.pointer.x - current.origin.x, current.pointer.y - current.origin.y) < minimumDrag) return
    const elements = api.getSceneElementsIncludingDeleted()
    const source = elements.find(element => element.id === current.source.id)
    if (!source || !isNode(source)) return
    let target: ExcalidrawElement | null | undefined = current.target && elements.find(element => element.id === current.target?.id)
    let additions: ExcalidrawElement[] = []
    let textId = ''
    if (!target || !isNode(target)) {
      const point = viewportCoordsToSceneCoords({ clientX: current.pointer.x, clientY: current.pointer.y }, api.getAppState())
      if (nodeAt(elements, point) !== undefined) return
      additions = applyVisualStyle(convertToExcalidrawElements([{
        type: 'rectangle', x: point.x - 120, y: point.y - 60, width: 240, height: 120,
        label: { text: ' ', fontFamily: 2, fontSize: api.getAppState().currentItemFontSize, textAlign: 'center', verticalAlign: 'middle' },
      }]), style)
      target = additions.find(isNode)
      const text = additions.find(element => element.type === 'text')
      if (!target || !text) return
      textId = text.id
      additions = additions.map(element => element.type === 'text' ? newElementWith(element, { text: '', originalText: '' }) : element)
    }
    const start = ports(source).find(port => port.side === current.start.side)!
    const end = nearestPort(target as ExcalidrawFlowchartNodeElement, start)
    // Ask the native converter to calculate focus/gap on disposable node copies.
    // Only the new arrow is retained; existing node geometry and metadata stay intact.
    const converted = convertToExcalidrawElements([
      { ...source, boundElements: null },
      { ...target as ExcalidrawFlowchartNodeElement, boundElements: null },
      {
        type: 'arrow', x: start.x, y: start.y,
        points: [[0, 0], [end.x - start.x, end.y - start.y]] as ExcalidrawLinearElement['points'],
        start: { id: source.id }, end: { id: target.id },
        startArrowhead: null, endArrowhead: 'arrow',
      },
    ], { regenerateIds: false })
    const convertedArrow = applyVisualStyle(converted.filter(element => element.type === 'arrow'), style).find(element => element.type === 'arrow')
    if (!convertedArrow || convertedArrow.type !== 'arrow') return
    // The native converter offsets bound endpoints by half a pixel but does not
    // normalize their origin. Match LinearElementEditor.getNormalizedPoints.
    const [offsetX, offsetY] = convertedArrow.points[0]
    const arrow = newElementWith(convertedArrow, {
      x: convertedArrow.x + offsetX,
      y: convertedArrow.y + offsetY,
      points: convertedArrow.points.map(([x, y]) => [x - offsetX, y - offsetY]) as ExcalidrawLinearElement['points'],
    })
    const updated = bindNodes([...elements, ...additions, arrow], source.id, target.id, arrow.id)
    if (textId) {
      onCreateDraft({ elements: updated, textId, nodeId: target.id, sourceId: source.id, arrowId: arrow.id })
    } else {
      api.updateScene({ elements: updated, appState: { selectedElementIds: { [arrow.id]: true } }, captureUpdate: CaptureUpdateAction.IMMEDIATELY })
      api.setActiveTool({ type: 'selection' })
    }
  }

  function onPointerDownCapture(event: ReactPointerEvent<HTMLElement>) {
    const { api, disabled } = latest.current
    if (!api || disabled || event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    const appState = api.getAppState()
    if (appState.viewModeEnabled || appState.editingTextElement) return
    const element = event.target instanceof Element ? event.target : null
    const portElement = element?.closest<HTMLElement>('[data-connection-node]')
    if (!portElement && (!element?.matches('canvas') || appState.activeTool.type !== 'arrow')) return
    const point = viewportCoordsToSceneCoords(event, appState)
    const elements = api.getSceneElements()
    const source = portElement ? elements.find(item => item.id === portElement.dataset.connectionNode) : nodeAt(elements, point)
    if (!source || !isNode(source)) return
    event.preventDefault()
    event.stopPropagation()
    const start = ports(source).find(port => port.side === portElement?.dataset.connectionSide) ?? nearestPort(source, point)
    const origin = { x: event.clientX, y: event.clientY }
    let current: Drag = { source, start, origin, pointer: origin, target: null, end: point }
    setDrag(current)
    const move = (next: PointerEvent) => {
      if (next.pointerId !== event.pointerId) return
      next.preventDefault()
      next.stopPropagation()
      const state = api.getAppState()
      const position = viewportCoordsToSceneCoords(next, state)
      const target = targetAt(api.getSceneElements(), position, source.id, state.zoom.value)
      current = { ...current, pointer: { x: next.clientX, y: next.clientY }, target, end: target ? nearestPort(target, start) : position }
      setDrag(current)
    }
    const up = (next: PointerEvent) => {
      if (next.pointerId !== event.pointerId) return
      move(next)
      stopDrag()
      finish(current)
    }
    const cancel = (next: KeyboardEvent) => {
      if (next.key !== 'Escape') return
      next.preventDefault()
      next.stopImmediatePropagation()
      stopDrag()
    }
    window.addEventListener('pointermove', move, true)
    window.addEventListener('pointerup', up, true)
    window.addEventListener('pointercancel', stopDrag, true)
    window.addEventListener('keydown', cancel, true)
    cleanup.current = () => {
      window.removeEventListener('pointermove', move, true)
      window.removeEventListener('pointerup', up, true)
      window.removeEventListener('pointercancel', stopDrag, true)
      window.removeEventListener('keydown', cancel, true)
    }
  }

  function onPointerMoveCapture(event: ReactPointerEvent<HTMLElement>) {
    const { api, disabled } = latest.current
    if (!api || disabled || event.buttons || drag) return
    const state = api.getAppState()
    if (state.activeTool.type !== 'selection' && state.activeTool.type !== 'arrow') {
      if (hoveredId) setHoveredId(null)
      return
    }
    if (!(event.target instanceof Element) || !event.target.matches('canvas')) {
      if (!(event.target instanceof Element) || !event.target.closest('[data-connection-node]')) setHoveredId(null)
      return
    }
    const node = nodeAt(api.getSceneElements(), viewportCoordsToSceneCoords(event, state))
    setHoveredId(node?.id ?? null)
  }

  const { appState, elements, disabled } = options
  const selected = appState ? elements.filter(element => appState.selectedElementIds[element.id] && !element.isDeleted) : []
  const selectedIds = new Set(selected.map(element => element.type === 'text' && element.containerId ? element.containerId : element.id))
  const selectedElement = selectedIds.size === 1 ? elements.find(element => selectedIds.has(element.id)) : null
  const selectedNode = selectedElement && isNode(selectedElement) ? selectedElement : null
  const node = elements.find(element => element.id === (drag?.source.id ?? hoveredId))
  const visibleNode = node && isNode(node) ? node : selectedNode
  const show = !disabled && appState && !appState.viewModeEnabled && !appState.editingTextElement && (appState.activeTool.type === 'selection' || appState.activeTool.type === 'arrow')
  const viewport = (point: Point) => {
    const value = sceneCoordsToViewportCoords({ sceneX: point.x, sceneY: point.y }, appState!)
    return { x: value.x - appState!.offsetLeft, y: value.y - appState!.offsetTop }
  }
  const start = drag && appState ? viewport(drag.start) : null
  const end = drag && appState ? viewport(drag.end) : null
  const target = drag?.target
  const highlight = target && appState ? viewport({ x: target.x, y: target.y }) : null
  const overlay = show && <div className="mindflow-connections" aria-label="节点连接">
    {drag && start && end && <svg className="mindflow-connection-preview"><defs><marker id="mindflow-connection-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M 0 0 L 8 4 L 0 8" /></marker></defs><path d={`M ${start.x} ${start.y} L ${end.x} ${end.y}`} markerEnd="url(#mindflow-connection-arrow)" /></svg>}
    {target && highlight && <div className={`mindflow-connection-target is-${target.type}`} style={{ left: highlight.x, top: highlight.y, width: target.width * appState.zoom.value, height: target.height * appState.zoom.value, transform: `rotate(${target.angle}rad)` }} />}
    {visibleNode && ports(visibleNode).map(port => {
      const position = viewport(port)
      return <button key={port.side} type="button" className="mindflow-connection-port" data-connection-node={visibleNode.id} data-connection-side={port.side} style={{ left: position.x, top: position.y }} aria-label={`从${sideNames[port.side]}方连接节点`} title="拖动连接；拖到空白创建节点" />
    })}
  </div>

  return { overlay, onPointerDownCapture, onPointerMoveCapture, onPointerLeave: () => { if (!drag) setHoveredId(null) } }
}
