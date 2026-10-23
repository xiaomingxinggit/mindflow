import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CaptureUpdateAction, convertToExcalidrawElements, Excalidraw, loadFromBlob, MainMenu, newElementWith, serializeAsJSON, viewportCoordsToSceneCoords, WelcomeScreen } from '@excalidraw/excalidraw'
import type { ExcalidrawInitialDataState, ExcalidrawImperativeAPI, ExcalidrawProps, LibraryItems } from '@excalidraw/excalidraw/types'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { AppState, BinaryFiles } from '@excalidraw/excalidraw/types'
import { FilePlus2, Import, StickyNote } from 'lucide-react'
import { migrateLegacyDocument, readLegacyDocument } from './legacyFlowchart'
import { createSceneSaver, loadWorkspace, saveLibraryItems } from './whiteboardStorage'
import type { SaveStatus } from './whiteboardStorage'
import CommandPalette from './CommandPalette'
import { applyVisualStyle, getStyleDefaults, readSceneStyle } from './visualStyles'
import type { CanvasStyle } from './visualStyles'
import { prepareMarkdownScene } from './richTextModel'
import { useRichText } from './useRichText'
import { useQuickConnections } from './QuickConnections'
import FlowAnimation from './FlowAnimation'
import '@excalidraw/excalidraw/index.css'
import './Whiteboard.css'

type Workspace = { data: ExcalidrawInitialDataState; style: CanvasStyle; canSave: boolean; message: string }
const defaultName = '未命名画布'

function DocumentName({ name, onRename }: { name: string; onRename: (name: string) => void }) {
  const [draft, setDraft] = useState(name)
  return <input aria-label="画布名称" title="修改画布名称" value={draft} onChange={event => setDraft(event.target.value)} onBlur={() => onRename(draft.trim() || defaultName)} onKeyDown={event => {
    event.stopPropagation()
    if (!event.nativeEvent.isComposing && (event.key === 'Enter' || event.key === 'Escape')) event.currentTarget.blur()
  }} />
}

function Editor({ data, style: initialStyle, canSave, message }: Workspace) {
  const api = useRef<ExcalidrawImperativeAPI | null>(null)
  const [editorApi, setEditorApi] = useState<ExcalidrawImperativeAPI | null>(null)
  const [scene, setScene] = useState<{ elements: readonly ExcalidrawElement[]; appState: AppState | null; files: BinaryFiles }>({ elements: data.elements ?? [], appState: null, files: data.files ?? {} })
  const sceneSignature = useRef('')
  const registerApi = useCallback((instance: ExcalidrawImperativeAPI) => { api.current = instance; setEditorApi(instance) }, [])
  const importInput = useRef<HTMLInputElement>(null)
  const nativeInput = useRef<HTMLInputElement>(null)
  const [sceneStatus, setSceneStatus] = useState<SaveStatus>('saved')
  const [libraryStatus, setLibraryStatus] = useState<SaveStatus>('saved')
  const [name, setName] = useState(data.appState?.name || defaultName)
  const [theme, setTheme] = useState(data.appState?.theme || 'light')
  const [zen, setZen] = useState(!!data.appState?.zenModeEnabled)
  const [notice, setNotice] = useState(message)
  const [commandsOpen, setCommandsOpen] = useState(false)
  const [style, setStyle] = useState(initialStyle)
  const styleRef = useRef(initialStyle)
  const [saver] = useState(() => createSceneSaver(setSceneStatus))
  const status = sceneStatus === 'error' || libraryStatus === 'error' ? 'error' : sceneStatus === 'saving' || libraryStatus === 'saving' ? 'saving' : 'saved'
  const rich = useRichText({ api: editorApi, ...scene })
  const quick = useQuickConnections({ api: editorApi, elements: scene.elements, appState: scene.appState, style, disabled: rich.editing, onCreateDraft: rich.beginConnection })

  useEffect(() => {
    const flush = () => { void saver.flush() }
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush() }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', flush)
    window.addEventListener('beforeunload', flush)
    return () => {
      flush()
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', flush)
      window.removeEventListener('beforeunload', flush)
    }
  }, [saver])
  useEffect(() => {
    const openCommands = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.code === 'Slash' && !event.isComposing && !(event.target as HTMLElement).closest('[data-rich-editor]')) {
        event.preventDefault()
        event.stopImmediatePropagation()
        setCommandsOpen(current => !current)
      }
    }
    window.addEventListener('keydown', openCommands, true)
    return () => window.removeEventListener('keydown', openCommands, true)
  }, [])

  const onChange = useCallback<NonNullable<ExcalidrawProps['onChange']>>((elements, appState, files) => {
    const signature = JSON.stringify([elements.map(element => [element.id, element.versionNonce]), Object.keys(files), appState.scrollX, appState.scrollY, appState.zoom.value, appState.width, appState.height, appState.offsetLeft, appState.offsetTop, appState.selectedElementIds, appState.activeTool.type, appState.theme])
    if (signature !== sceneSignature.current) {
      sceneSignature.current = signature
      setScene({ elements, appState, files })
    }
    setName(appState.name || defaultName)
    setTheme(appState.theme)
    setZen(appState.zenModeEnabled)
    const sceneStyle = readSceneStyle(elements)
    let nextState = appState
    if (sceneStyle && sceneStyle !== styleRef.current) {
      styleRef.current = sceneStyle
      setStyle(sceneStyle)
      const defaults = getStyleDefaults(sceneStyle)
      nextState = { ...appState, ...defaults }
      api.current?.updateScene({ appState: defaults, captureUpdate: CaptureUpdateAction.NEVER })
    }
    if (canSave) saver.schedule({ elements, appState: nextState, files, style: styleRef.current })
  }, [canSave, saver])
  const onLibraryChange = useCallback(async (libraryItems: LibraryItems) => {
    if (!canSave) return
    setLibraryStatus('saving')
    try {
      await saveLibraryItems(libraryItems)
      setLibraryStatus('saved')
    } catch {
      setLibraryStatus('error')
      api.current?.setToast({ message: '素材库保存失败，请导出素材库备份', closable: true })
    }
  }, [canSave])

  const changeStyle = useCallback((next: CanvasStyle) => {
    const editor = api.current
    if (!editor) return
    const original = editor.getSceneElementsIncludingDeleted()
    // Give newly drawn elements a native history baseline before the one-step switch.
    const baseline = original.map(element => element.customData?.mindflowStyle === styleRef.current ? element : newElementWith(element, {
      customData: { ...element.customData, mindflowStyle: styleRef.current },
    }))
    if (baseline.some((element, index) => element !== original[index])) editor.updateScene({ elements: baseline, captureUpdate: CaptureUpdateAction.NEVER })
    styleRef.current = next
    setStyle(next)
    editor.updateScene({ elements: applyVisualStyle(baseline, next), appState: getStyleDefaults(next), captureUpdate: CaptureUpdateAction.IMMEDIATELY })
  }, [])

  const newCanvas = useCallback(() => {
    api.current?.updateScene({ elements: [], appState: { name: defaultName, selectedElementIds: {}, scrollX: 0, scrollY: 0, fileHandle: null }, captureUpdate: CaptureUpdateAction.IMMEDIATELY })
    api.current?.setActiveTool({ type: 'selection' })
  }, [])

  function downloadScene() {
    const editor = api.current
    if (!editor) return
    const content = serializeAsJSON(editor.getSceneElements(), editor.getAppState(), editor.getFiles(), 'local')
    const url = URL.createObjectURL(new Blob([content], { type: 'application/vnd.excalidraw+json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${editor.getName().replace(/[\\/:*?"<>|]/g, '_')}.excalidraw`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  async function openNative(file?: File) {
    const editor = api.current
    if (!file || !editor) return
    try {
      const scene = await loadFromBlob(file, editor.getAppState(), editor.getSceneElements())
      editor.addFiles(Object.values(scene.files))
      const elements = await prepareMarkdownScene(scene.elements, scene.files)
      editor.updateScene({ elements, appState: { ...scene.appState, ...getStyleDefaults(styleRef.current), name: file.name.replace(/\.excalidraw$/i, ''), fileHandle: null }, captureUpdate: CaptureUpdateAction.IMMEDIATELY })
      editor.scrollToContent(elements, { fitToContent: true })
    } catch {
      editor.setToast({ message: '无法打开这个画布文件，当前内容未改动', closable: true })
    }
    if (nativeInput.current) nativeInput.current.value = ''
  }

  function addStickyNote() {
    const editor = api.current
    if (!editor) return
    const state = editor.getAppState()
    const point = viewportCoordsToSceneCoords({ clientX: state.offsetLeft + state.width / 2, clientY: state.offsetTop + state.height / 2 }, state)
    const note = convertToExcalidrawElements([{
      type: 'rectangle', x: point.x - 110, y: point.y - 90, width: 220, height: 180,
      backgroundColor: '#fff3bf', strokeColor: '#e6b84c', fillStyle: 'solid', strokeWidth: 1,
      roughness: 0, roundness: { type: 3 },
      customData: { mindflowNote: true },
      label: { text: '写下一个想法', fontFamily: 2, fontSize: 24, strokeColor: '#5c4813' },
    }])
    const styledNote = applyVisualStyle(note, styleRef.current)
    editor.updateScene({
      elements: [...editor.getSceneElements(), ...styledNote],
      appState: { selectedElementIds: Object.fromEntries(styledNote.map(element => [element.id, true])) },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    })
    editor.setActiveTool({ type: 'selection' })
    editor.setToast({ message: '便签已添加，双击修改文字' })
  }

  async function importLegacy(file?: File) {
    if (!file || !api.current) return
    try {
      const scene = migrateLegacyDocument(JSON.parse(await file.text()))
      const elements = applyVisualStyle(scene.elements ?? [], styleRef.current)
      api.current.updateScene({
        elements,
        appState: { ...getStyleDefaults(styleRef.current), name: scene.appState?.name || defaultName, selectedElementIds: {}, fileHandle: null },
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      })
      api.current.scrollToContent(elements, { fitToContent: true })
      api.current.setToast({ message: '旧版画布已导入，可撤销恢复' })
    } catch (error) {
      api.current.setToast({ message: error instanceof SyntaxError ? '文件不是有效的 JSON，当前画布未改动' : error instanceof Error ? error.message : '文件读取失败', closable: true })
    }
    if (importInput.current) importInput.current.value = ''
  }

  const renderExtraTools = useCallback(() => <div className="mindflow-extra-tools"><label className="mindflow-style-control"><span>画布风格</span><select aria-label="画布风格" value={style} onChange={event => changeStyle(event.target.value as CanvasStyle)}><option value="modern">现代风格</option><option value="system">系统风格</option></select></label><button className="mindflow-sticky" aria-label="添加便签" title="添加便签" onClick={addStickyNote}><StickyNote size={17} /><span>便签</span></button></div>, [style, changeStyle])
  const commands = [
    ...([
      ['selection', '选择工具'], ['hand', '平移工具'], ['rectangle', '矩形'], ['diamond', '菱形'], ['ellipse', '椭圆'],
      ['arrow', '箭头'], ['line', '线条'], ['freedraw', '自由画笔'], ['text', '文字'], ['eraser', '橡皮'],
      ['image', '插入图片'], ['frame', '画框'], ['laser', '激光笔'],
    ] as const).map(([type, label]) => ({ id: type, label, onSelect: () => api.current?.setActiveTool({ type }) })),
    { id: 'sticky', label: '添加便签', onSelect: addStickyNote },
    { id: 'new', label: '新建画布', onSelect: newCanvas },
    { id: 'open', label: '打开原生画布文件', shortcut: '.excalidraw', onSelect: () => nativeInput.current?.click() },
    { id: 'legacy', label: '导入旧版 Mindflow JSON', onSelect: () => importInput.current?.click() },
    { id: 'save', label: '下载画布文件', shortcut: '.excalidraw', onSelect: downloadScene },
    { id: 'export', label: '导出 PNG / SVG / 剪贴板图片', onSelect: () => api.current?.updateScene({ appState: { openDialog: { name: 'imageExport' } } }) },
    { id: 'theme', label: '切换浅色 / 深色主题', onSelect: () => { if (api.current) api.current.updateScene({ appState: { theme: api.current.getAppState().theme === 'dark' ? 'light' : 'dark' } }) } },
    { id: 'fit', label: '适应全部内容', onSelect: () => api.current?.scrollToContent(undefined, { fitToContent: true }) },
    { id: 'style-modern', label: '统一为现代风格', onSelect: () => changeStyle('modern') },
    { id: 'style-system', label: '统一为系统风格', onSelect: () => changeStyle('system') },
  ]

  // Scene positions update the overlays on every move. Keep native menu children
  // stable so those updates do not also invalidate Excalidraw's own React memo.
  const canvas = useMemo(() => <Excalidraw initialData={data} excalidrawAPI={registerApi} onChange={onChange} onLibraryChange={onLibraryChange}
      langCode="zh-CN" aiEnabled={false} handleKeyboardGlobally renderTopRightUI={renderExtraTools} UIOptions={{ canvasActions: { export: { saveFileToDisk: true } } }}>
      <MainMenu>
        <MainMenu.Item icon={<FilePlus2 size={16} />} onSelect={newCanvas}>新建画布</MainMenu.Item>
        <MainMenu.DefaultItems.LoadScene />
        <MainMenu.DefaultItems.SaveToActiveFile />
        <MainMenu.DefaultItems.SaveAsImage />
        <MainMenu.Item icon={<Import size={16} />} onSelect={() => importInput.current?.click()}>导入旧版 Mindflow JSON</MainMenu.Item>
        <MainMenu.Separator />
        <MainMenu.DefaultItems.SearchMenu />
        <MainMenu.Item shortcut="Ctrl+/" onSelect={() => setCommandsOpen(true)}>命令面板</MainMenu.Item>
        <MainMenu.DefaultItems.Help />
        <MainMenu.DefaultItems.ClearCanvas />
        <MainMenu.Separator />
        <MainMenu.DefaultItems.ToggleTheme />
        <MainMenu.DefaultItems.ChangeCanvasBackground />
        <MainMenu.Separator />
        <MainMenu.Group title="画布风格"><MainMenu.Item selected={style === 'modern'} onSelect={() => changeStyle('modern')}>现代风格</MainMenu.Item><MainMenu.Item selected={style === 'system'} onSelect={() => changeStyle('system')}>系统风格</MainMenu.Item></MainMenu.Group>
        <MainMenu.ItemCustom><small className="mindflow-credit">Mindflow · Powered by Excalidraw</small></MainMenu.ItemCustom>
      </MainMenu>
      <WelcomeScreen>
        <WelcomeScreen.Hints.ToolbarHint />
        <WelcomeScreen.Hints.MenuHint />
        <WelcomeScreen.Hints.HelpHint />
        <WelcomeScreen.Center>
          <WelcomeScreen.Center.Logo><span className="mindflow-logo">mindflow<span>.</span></span></WelcomeScreen.Center.Logo>
          <WelcomeScreen.Center.Heading>把想法放到画布上</WelcomeScreen.Center.Heading>
          <WelcomeScreen.Center.Menu><WelcomeScreen.Center.MenuItemLoadScene /><WelcomeScreen.Center.MenuItemHelp /></WelcomeScreen.Center.Menu>
        </WelcomeScreen.Center>
      </WelcomeScreen>
    </Excalidraw>, [data, registerApi, onChange, onLibraryChange, renderExtraTools, newCanvas, style, changeStyle])

  return <div className={`whiteboard-shell${zen ? ' is-zen' : ''}`} data-theme={theme} onDoubleClickCapture={rich.onDoubleClickCapture} onPointerDownCapture={event => { rich.onPointerDownCapture(event); if (!event.isPropagationStopped()) quick.onPointerDownCapture(event) }} onPointerMoveCapture={quick.onPointerMoveCapture} onPointerLeave={quick.onPointerLeave}>
    {canvas}
    <FlowAnimation api={editorApi} elements={scene.elements} appState={scene.appState} />
    {quick.overlay}
    {rich.overlay}
    <div className="mindflow-document" onKeyDown={event => event.stopPropagation()}>
      <DocumentName key={name} name={name} onRename={value => api.current?.updateScene({ appState: { name: value }, captureUpdate: CaptureUpdateAction.NEVER })} />
      <span className={`mindflow-save ${!canSave || status === 'error' ? 'has-error' : ''}`} role="status">{!canSave ? '恢复失败，请导出备份' : status === 'error' ? '保存失败，请导出备份' : status === 'saving' ? '保存中…' : '已保存在此浏览器'}</span>
    </div>
    <input ref={importInput} type="file" accept=".json,application/json" aria-label="旧版画布文件" hidden onChange={event => void importLegacy(event.target.files?.[0])} />
    <input ref={nativeInput} type="file" accept=".excalidraw,.json" aria-label="原生画布文件" hidden onChange={event => void openNative(event.target.files?.[0])} />
    {commandsOpen && <CommandPalette commands={commands} onClose={() => setCommandsOpen(false)} />}
    {notice && <div className="mindflow-notice" role="alert"><span>{notice}</span><button aria-label="关闭提示" onClick={() => setNotice('')}>×</button></div>}
  </div>
}

export default function Whiteboard() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const { scene, libraryItems, style: savedStyle } = await loadWorkspace()
        const migrated = !scene ? readLegacyDocument() : null
        const style = savedStyle ?? 'modern'
        const source = scene ?? migrated
        const data: ExcalidrawInitialDataState = {
          ...source,
          elements: savedStyle ? source?.elements : applyVisualStyle(source?.elements ?? [], style),
          appState: { name: defaultName, theme: 'light', ...source?.appState, ...(!savedStyle ? getStyleDefaults(style) : {}) },
          libraryItems,
          scrollToContent: !!migrated,
        }
        data.elements = await prepareMarkdownScene(data.elements ?? [], data.files ?? {})
        if (!cancelled) setWorkspace({ data, style, canSave: true, message: migrated ? '已从旧版画布恢复，原始数据保留不变' : '' })
      } catch {
        if (!cancelled) setWorkspace({ data: { appState: { name: defaultName, ...getStyleDefaults('modern') } }, style: 'modern', canSave: false, message: '本地画布读取失败。为保护原数据，本次编辑不会自动覆盖保存；可以导出文件备份后刷新重试。' })
      }
    }
    void load()
    return () => { cancelled = true }
  }, [])
  return workspace ? <Editor {...workspace} /> : <div className="mindflow-loading" role="status">正在恢复本地画布…</div>
}
