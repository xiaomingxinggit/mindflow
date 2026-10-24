import { useCallback, useEffect, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import { CaptureUpdateAction, sceneCoordsToViewportCoords, viewportCoordsToSceneCoords } from '@excalidraw/excalidraw'
import type { ExcalidrawElement, ExcalidrawTextElement } from '@excalidraw/excalidraw/element/types'
import type { AppState, BinaryFileData, BinaryFiles, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import RichTextEditor, { RichTextWidthControl } from './RichTextEditor'
import { contentWidth, createTextDraft, hitTextTarget, markdownData, richGeometry, updateMarkdownText } from './richTextModel'
import { measureMarkdownResize, prepareMarkdownRender } from './markdownRendering'
import { setEditingRichText, setRichTextEditRenderer, setRichTextPrepareRenderer, setRichTextRedrawRenderer, setRichTextResizeRenderer } from './richTextBridge'
import type { QuickConnectionDraft } from './QuickConnections'

type Session = { text: ExcalidrawTextElement; elements: readonly ExcalidrawElement[]; draft: boolean; connection?: QuickConnectionDraft; caret?: { left: number; top: number } }
type Options = { api: ExcalidrawImperativeAPI | null; elements: readonly ExcalidrawElement[]; appState: AppState | null; files: BinaryFiles; revision: number }

export function useRichText({ api, elements, appState, files, revision }: Options) {
  const [session, setSession] = useState<Session | null>(null)
  const [height, setHeight] = useState(30)
  const [width, setWidth] = useState(280)
  const [busy, setBusy] = useState(false)
  const pendingUploads = useRef(0)
  const source = useRef('')
  const readSource = useRef<(() => string) | null>(null)
  const finishing = useRef(false)
  const composing = useRef(false)
  const finishAfterComposition = useRef(false)
  const sessionRef = useRef(session)
  useEffect(() => { sessionRef.current = session }, [session])
  useEffect(() => {
    setEditingRichText(session?.text.id ?? null)
    return () => setEditingRichText(null)
  }, [session?.text.id])

  useEffect(() => {
    if (!api || !session) return
    const original = { ...api.getAppState().selectedElementIds }
    const targetId = session.text.containerId ?? session.text.id
    if (!original[targetId] && !original[session.text.id]) return
    const remaining = { ...original }
    delete remaining[targetId]
    delete remaining[session.text.id]
    api.updateScene({ appState: { selectedElementIds: remaining }, captureUpdate: CaptureUpdateAction.NEVER })
    return () => {
      const current = api.getAppState().selectedElementIds
      // Restore only our temporary deselection. A completed edit or a new user
      // selection already owns the native selection and must keep it.
      const unchanged = Object.keys(current).length === Object.keys(remaining).length
        && Object.keys(current).every(id => current[id] === remaining[id])
      if (unchanged) api.updateScene({ appState: { selectedElementIds: original }, captureUpdate: CaptureUpdateAction.NEVER })
    }
  }, [api, session])

  useEffect(() => {
    if (!api || session) return
    const plain = elements.filter(element => element.type === 'text' && !element.isDeleted && !markdownData(element))
    if (!plain.length) return
    let cancelled = false
    void (async () => {
      let updated = [...elements]
      for (const element of plain) {
        if (element.type === 'text') updated = await updateMarkdownText(updated, element.id, element.originalText, contentWidth(element, updated), files)
      }
      return updated
    })().then(updated => {
      if (cancelled) return
      const changed = new Map(updated.filter((element, index) => element !== elements[index]).map(element => [element.id, element]))
      const current = api.getSceneElementsIncludingDeleted()
      const merged = current.map(element => changed.get(element.id) ?? element)
      api.updateScene({ elements: merged, captureUpdate: CaptureUpdateAction.NEVER })
    }).catch(() => api.setToast({ message: 'Markdown 内容排版失败，可继续编辑原文', closable: true }))
    return () => { cancelled = true }
  }, [api, elements, files, session])

  useEffect(() => {
    if (!api) return
    const cleanRedraw = setRichTextRedrawRenderer(() => api.refresh())
    const cleanResize = setRichTextResizeRenderer(measureMarkdownResize)
    const cleanPrepare = setRichTextPrepareRenderer(async scene => {
      await Promise.all(scene.filter((element): element is ExcalidrawTextElement => element.type === 'text' && !element.isDeleted && !!markdownData(element)).map(text => prepareMarkdownRender(text, api.getFiles(), text.width)))
    })
    return () => { cleanRedraw(); cleanPrepare(); cleanResize() }
  }, [api])

  useEffect(() => {
    for (const element of elements) {
      if (element.type === 'text' && !element.isDeleted && markdownData(element)) void prepareMarkdownRender(element, files, element.width)
    }
  }, [elements, files, revision])

  const begin = useCallback((next: Session) => {
    if (sessionRef.current) return
    composing.current = false
    finishAfterComposition.current = false
    source.current = next.text.originalText
    const nextWidth = contentWidth(next.text, next.elements)
    setWidth(nextWidth)
    setHeight(Math.max(next.text.height, next.text.fontSize * 1.5))
    sessionRef.current = next
    setSession(next)
    api?.setActiveTool({ type: 'selection' })
  }, [api])

  useEffect(() => {
    if (!api) return
    return setRichTextEditRenderer(request => {
      begin(createTextDraft(api.getSceneElementsIncludingDeleted(), request.element ?? request.container ?? undefined, { x: request.sceneX, y: request.sceneY }, api.getAppState()))
      return true
    })
  }, [api, begin])

  const beginConnection = useCallback((draft: QuickConnectionDraft) => {
    const text = draft.elements.find(element => element.id === draft.textId)
    if (text?.type === 'text') begin({ text, elements: draft.elements, draft: true, connection: draft })
  }, [begin])

  const finish = useCallback(async () => {
    const current = sessionRef.current
    if (!api || !current || finishing.current) return
    if (composing.current) {
      finishAfterComposition.current = true
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
      return
    }
    if (pendingUploads.current) { api.setToast({ message: '图片正在插入，完成后可结束编辑' }); return }
    source.current = readSource.current?.() ?? source.current
    finishing.current = true
    setBusy(true)
    try {
      if (!current.draft && source.current === current.text.originalText) { setSession(null); return }
      if (!source.current.trim() && current.draft) { setSession(null); return }
      const scene = current.draft ? current.elements : api.getSceneElementsIncludingDeleted()
      const updated = await updateMarkdownText(scene, current.text.id, source.current, width, api.getFiles())
      api.updateScene({ elements: updated, appState: { selectedElementIds: { [current.text.containerId ?? current.text.id]: true } }, captureUpdate: CaptureUpdateAction.IMMEDIATELY })
      setSession(null)
    } catch {
      api.setToast({ message: '内容保存失败，请保留原文后重试', closable: true })
    } finally { finishing.current = false; setBusy(false) }
  }, [api, width])

  useEffect(() => {
    if (!session) return
    const outside = (event: PointerEvent) => {
      const target = event.target as HTMLElement
      if (target.closest('[data-rich-editor], .mindflow-rich-width, .milkdown')) return
      event.preventDefault()
      event.stopImmediatePropagation()
      void finish()
    }
    document.addEventListener('pointerdown', outside, true)
    return () => document.removeEventListener('pointerdown', outside, true)
  }, [session, finish])

  const pointFor = (event: { clientX: number; clientY: number }) => appState ? viewportCoordsToSceneCoords(event, appState) : null
  const canvasEvent = (target: EventTarget) => target instanceof Element && !!target.closest('canvas')
  function onDoubleClickCapture(event: ReactMouseEvent<HTMLDivElement>) {
    if (!api || !appState || session || !canvasEvent(event.target)) return
    if (!['selection', 'text'].includes(appState.activeTool.type)) return
    const point = pointFor(event)
    if (!point) return
    event.preventDefault()
    event.stopPropagation()
    begin({ ...createTextDraft(api.getSceneElementsIncludingDeleted(), hitTextTarget(elements, point), point, api.getAppState()), caret: { left: event.clientX, top: event.clientY } })
  }
  function onPointerDownCapture(event: ReactPointerEvent<HTMLDivElement>) {
    if (!api || !appState || session || !canvasEvent(event.target) || appState.activeTool.type !== 'text' || event.button !== 0) return
    const point = pointFor(event)
    if (!point) return
    event.preventDefault()
    event.stopPropagation()
    begin({ ...createTextDraft(api.getSceneElementsIncludingDeleted(), hitTextTarget(elements, point), point, api.getAppState()), caret: { left: event.clientX, top: event.clientY } })
  }

  const selected = elements.filter(element => !element.isDeleted && appState?.selectedElementIds[element.id])
  const selectedText = selected.length === 1 ? selected[0].type === 'text' ? selected[0] : elements.find(element => element.type === 'text' && !element.isDeleted && element.containerId === selected[0].id) : undefined
  async function resizeSelected(value: number) {
    if (!api || selectedText?.type !== 'text') return
    const adjusted = Math.max(100, Math.min(1200, value || 280))
    if (Math.abs(adjusted - contentWidth(selectedText, elements)) < 1) return
    const before = api.getSceneElementsIncludingDeleted()
    const updated = await updateMarkdownText(before, selectedText.id, selectedText.originalText, adjusted, api.getFiles())
    const changes = new Map(updated.filter((element, index) => element !== before[index]).map(element => [element.id, element]))
    const original = new Map(before.map(element => [element.id, element]))
    const current = api.getSceneElementsIncludingDeleted()
    // An unrelated native gesture can finish while image layout is pending.
    // Merge only our objects, and never overwrite a concurrently edited object.
    if (current.some(element => changes.has(element.id) && element.versionNonce !== original.get(element.id)?.versionNonce)) return
    api.updateScene({ elements: current.map(element => changes.get(element.id) ?? element), captureUpdate: CaptureUpdateAction.IMMEDIATELY })
  }
  async function upload(file: File) {
    if (!api) return ''
    pendingUploads.current += 1
    try {
    const dataURL = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    })
    const id = crypto.randomUUID().replaceAll('-', '') as BinaryFileData['id']
    const binary = { id, dataURL: dataURL as BinaryFileData['dataURL'], mimeType: file.type as BinaryFileData['mimeType'], created: Date.now(), lastRetrieved: Date.now() }
    api.addFiles([binary])
    return `mindflow-file:${id}`
    } finally { window.setTimeout(() => { pendingUploads.current -= 1 }, 0) }
  }

  let editingOverlay = null
  if (session && appState) {
    const geometry = richGeometry(session.text, session.elements, width, height)
    const position = sceneCoordsToViewportCoords({ sceneX: geometry.x + width / 2, sceneY: geometry.y + height / 2 }, appState)
    const container = geometry.container
    const previewSize = geometry.containerSize
    let preview = null
    if (container && previewSize && ['rectangle', 'diamond', 'ellipse'].includes(container.type)
      && (session.connection || previewSize.width !== container.width || previewSize.height !== container.height)) {
      const origin = sceneCoordsToViewportCoords({ sceneX: container.x, sceneY: container.y }, appState)
      const zoom = appState.zoom.value
      const w = previewSize.width * zoom
      const h = previewSize.height * zoom
      const common = { fill: container.backgroundColor, stroke: container.strokeColor, strokeWidth: container.strokeWidth, transform: `rotate(${container.angle * 180 / Math.PI} ${origin.x + w / 2} ${origin.y + h / 2})` }
      preview = container.type === 'ellipse' ? <ellipse cx={origin.x + w / 2} cy={origin.y + h / 2} rx={w / 2} ry={h / 2} {...common} /> : container.type === 'diamond' ? <polygon points={`${origin.x + w / 2},${origin.y} ${origin.x + w},${origin.y + h / 2} ${origin.x + w / 2},${origin.y + h} ${origin.x},${origin.y + h / 2}`} {...common} /> : <rect x={origin.x} y={origin.y} width={w} height={h} rx={container.roundness ? 18 : 0} {...common} />
    }
    let linePreview = null
    if (session.connection) {
      const arrow = session.elements.find(element => element.id === session.connection?.arrowId)
      if (arrow?.type === 'arrow') {
        const points = arrow.points.map(([x, y]) => sceneCoordsToViewportCoords({ sceneX: arrow.x + x, sceneY: arrow.y + y }, appState)).map(point => `${point.x},${point.y}`).join(' ')
        linePreview = <polyline points={points} fill="none" stroke={arrow.strokeColor} strokeWidth={1.5} />
      }
    }
    editingOverlay = <><svg className="mindflow-rich-preview">{linePreview}{preview}</svg><div className="mindflow-rich-position" style={{ left: position.x, top: position.y, transform: `rotate(${session.text.angle}rad) scale(${appState.zoom.value}) translate(-50%, -50%)` }}><RichTextEditor key={session.text.id} source={session.text.originalText} width={width} fontSize={session.text.fontSize} textAlign={session.text.textAlign} color={session.text.strokeColor} busy={busy} caret={session.caret} onComposition={value => { composing.current = value; if (!value && finishAfterComposition.current) { finishAfterComposition.current = false; void finish() } }} resolveImage={url => url.startsWith('mindflow-file:') ? api?.getFiles()[url.slice(14)]?.dataURL ?? '' : url} onSource={value => { source.current = value }} onHeight={setHeight} onUpload={upload} onFinish={() => void finish()} onCancel={() => setSession(null)} onReady={reader => { readSource.current = reader }} /></div></>
  }
  const controls = !session && selectedText?.type === 'text' ? <RichTextWidthControl key={`${selectedText.id}:${selectedText.width}`} width={contentWidth(selectedText, elements)} onResize={value => void resizeSelected(value)} onEdit={() => begin({ text: selectedText, elements: api?.getSceneElementsIncludingDeleted() ?? elements, draft: false })} /> : null
  return { editing: !!session, beginConnection, begin, onDoubleClickCapture, onPointerDownCapture, overlay: <>{controls}{editingOverlay}</> }
}
