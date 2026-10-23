import { useEffect, useRef, useState } from 'react'
import { CaptureUpdateAction, newElementWith } from '@excalidraw/excalidraw'
import type { AppState, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import type { ExcalidrawElement, ExcalidrawLinearElement, ExcalidrawTextElement } from '@excalidraw/excalidraw/element/types'
import { isInsideFlowLabel, measureFlowPath, pointOnFlowPath } from './flowAnimationGeometry'
import type { FlowPath } from './flowAnimationGeometry'
import './FlowAnimation.css'

type FlowSettings = { enabled: boolean; speed: number }
type Props = {
  api: ExcalidrawImperativeAPI | null
  elements: readonly ExcalidrawElement[]
  appState: AppState | null
}
type CachedPath = { key: string; path: FlowPath | null }
const minSpeed = 20
const maxSpeed = 180
const defaultSpeed = 70

function isLine(element: ExcalidrawElement): element is ExcalidrawLinearElement {
  return !element.isDeleted && (element.type === 'arrow' || element.type === 'line')
}

function readFlow(element: ExcalidrawLinearElement): FlowSettings {
  const value = element.customData?.mindflowFlow
  return {
    enabled: value?.enabled === true,
    speed: typeof value?.speed === 'number' && Number.isFinite(value.speed) ? Math.min(maxSpeed, Math.max(minSpeed, value.speed)) : defaultSpeed,
  }
}

export default function FlowAnimation({ api, elements, appState }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const cache = useRef(new Map<string, CachedPath>())
  const [draft, setDraft] = useState<{ id: string; speed: number } | null>(null)
  const current = useRef({ elements, appState, draft })
  const active = elements.filter(isLine).filter(element => readFlow(element).enabled)
  const hasViewport = !!appState
  const selectedIds = Object.keys(appState?.selectedElementIds || {})
  const selected = selectedIds.length === 1 ? elements.find(element => element.id === selectedIds[0] && isLine(element)) as ExcalidrawLinearElement | undefined : undefined
  const settings = selected ? readFlow(selected) : null
  const speed = draft?.id === selected?.id ? draft?.speed : settings?.speed

  useEffect(() => { current.current = { elements, appState, draft } }, [elements, appState, draft])

  useEffect(() => {
    const alive = new Set<string>()
    for (const element of elements) {
      if (!isLine(element) || !readFlow(element).enabled) continue
      alive.add(element.id)
      const key = JSON.stringify([element.x, element.y, element.width, element.height, element.angle, element.points, element.roundness, element.roughness, element.strokeWidth, element.strokeStyle, element.seed, element.startArrowhead, element.endArrowhead, 'elbowed' in element && element.elbowed])
      if (cache.current.get(element.id)?.key === key) continue
      const entry = { key, path: null } as CachedPath
      cache.current.set(element.id, entry)
      void measureFlowPath(element).then(path => { entry.path = path }).catch(() => { entry.path = null })
    }
    for (const id of cache.current.keys()) if (!alive.has(id)) cache.current.delete(id)
  }, [elements])

  useEffect(() => {
    const node = canvas.current
    if (!node) return
    const context = node.getContext('2d')
    if (!context) return
    let frame = 0
    let epoch = 0
    const draw = (time: number) => {
      frame = 0
      const { elements: scene, appState: state, draft: preview } = current.current
      if (!state || document.visibilityState === 'hidden') return
      if (!epoch) epoch = time
      const ratio = window.devicePixelRatio || 1
      const width = Math.round(state.width * ratio)
      const height = Math.round(state.height * ratio)
      if (node.width !== width || node.height !== height) {
        node.width = width
        node.height = height
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      context.clearRect(0, 0, state.width, state.height)
      const zoom = state.zoom.value
      const labels = scene.filter((element): element is ExcalidrawTextElement => !element.isDeleted && element.type === 'text')
      for (const line of scene) {
        if (!isLine(line)) continue
        const flow = readFlow(line)
        if (!flow.enabled) continue
        const path = cache.current.get(line.id)?.path
        if (!path) continue
        const velocity = preview?.id === line.id ? preview.speed : flow.speed
        const spacing = 64 / zoom
        const phase = ((time - epoch) / 1000 * velocity) % spacing
        const directions = line.startArrowhead ? line.endArrowhead ? [1, -1] : [-1] : [1]
        context.fillStyle = line.strokeColor
        context.globalAlpha = line.opacity / 100
        for (const direction of directions) {
          for (let distance = phase; distance < path.length; distance += spacing) {
            const [x, y] = pointOnFlowPath(path, direction === 1 ? distance : path.length - distance)
            if (labels.some(label => isInsideFlowLabel(x, y, label, 5 / zoom))) continue
            const screenX = (x + state.scrollX) * zoom
            const screenY = (y + state.scrollY) * zoom
            if (screenX < -6 || screenY < -6 || screenX > state.width + 6 || screenY > state.height + 6) continue
            context.beginPath()
            context.arc(screenX, screenY, 3, 0, Math.PI * 2)
            context.fill()
          }
        }
      }
      context.globalAlpha = 1
      frame = requestAnimationFrame(draw)
    }
    const resume = () => {
      if (frame) cancelAnimationFrame(frame)
      frame = 0
      if (document.visibilityState !== 'hidden') frame = requestAnimationFrame(draw)
    }
    if (active.length && hasViewport) {
      resume()
      document.addEventListener('visibilitychange', resume)
    } else context.clearRect(0, 0, node.width, node.height)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      document.removeEventListener('visibilitychange', resume)
      context.clearRect(0, 0, node.width, node.height)
    }
  }, [active.length, hasViewport])

  function commit(next: Partial<FlowSettings>) {
    if (!api || !selected) return
    const scene = api.getSceneElementsIncludingDeleted()
    const line = scene.find(element => element.id === selected.id)
    if (!line || !isLine(line)) return
    const previous = readFlow(line)
    const value = { ...previous, ...next }
    if (value.enabled === previous.enabled && value.speed === previous.speed) return
    api.updateScene({
      elements: scene.map(element => element.id === line.id ? newElementWith(line, { customData: { ...line.customData, mindflowFlow: { ...line.customData?.mindflowFlow, ...value } } }) : element),
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    })
  }

  function finishSpeed(value: number) {
    commit({ speed: value })
    setDraft(null)
  }

  return <>
    <canvas ref={canvas} className="mindflow-flow-animation" aria-hidden="true" />
    {selected && settings && !appState?.openDialog && !appState?.editingTextElement && <section className="mindflow-flow-controls" aria-label="连线流动设置" onPointerDown={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
      <label className="mindflow-flow-toggle"><span>流动效果</span><input type="checkbox" role="switch" aria-label="流动效果" checked={settings.enabled} onChange={event => commit({ enabled: event.target.checked })} /></label>
      <label className="mindflow-flow-speed"><span>速度</span><input type="range" aria-label="流动速度" min={minSpeed} max={maxSpeed} step="1" value={speed ?? defaultSpeed}
        onPointerDown={event => event.currentTarget.setPointerCapture(event.pointerId)}
        onChange={event => setDraft({ id: selected.id, speed: event.target.valueAsNumber })}
        onPointerUp={event => finishSpeed(event.currentTarget.valueAsNumber)}
        onPointerCancel={() => setDraft(null)}
        onKeyUp={event => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) finishSpeed(event.currentTarget.valueAsNumber) }}
        onBlur={event => { if (draft?.id === selected.id) finishSpeed(event.currentTarget.valueAsNumber) }}
      /></label>
      <div className="mindflow-flow-range"><span>慢</span><span>快</span></div>
    </section>}
  </>
}
