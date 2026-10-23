import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import { addEdge, applyEdgeChanges, applyNodeChanges, Background, ConnectionMode, MarkerType, ReactFlow, useReactFlow } from '@xyflow/react'
import type { Connection, EdgeChange, NodeChange, XYPosition } from '@xyflow/react'
import { ArrowDownToLine, ArrowUpFromLine, Check, Circle, Copy, Diamond, FilePlus2, Grid2X2, Hand, HelpCircle, Maximize2, Menu, Minus, MousePointer2, Plus, Redo2, Square, Trash2, Undo2, X } from 'lucide-react'
import { loadFlowDocument, parseFlowDocument, serializeFlowDocument, STORAGE_KEY } from './flowchart'
import type { FlowNode, NodeKind } from './flowchart'
import ThoughtNode from './ThoughtNode'
import { colors, defaultColor, EditingContext } from './thoughtNodeConfig'
import { useFlowchartHistory } from './useFlowchartHistory'
import './FlowchartBoard.css'

const kinds = [{ kind: 'process', label: '矩形想法' }, { kind: 'decision', label: '菱形判断' }, { kind: 'start', label: '圆角起点' }, { kind: 'end', label: '圆角终点' }] as const
const defaultLabels: Record<NodeKind, string> = { process: '新的想法', decision: '想到一个问题', start: '从这里开始', end: '一个结论' }
const edgeOptions = { type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed, color: '#9292a3' }, style: { stroke: '#9292a3', strokeWidth: 1.6 } }
type Tool = 'select' | 'pan' | NodeKind
const nodeTypes = { flowchart: ThoughtNode }

function CommitInput({ value, onCommit, ...props }: { value: string; onCommit: (value: string) => void; 'aria-label': string; placeholder?: string }) {
  const [draft, setDraft] = useState(value)
  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation()
    if (!event.nativeEvent.isComposing && (event.key === 'Enter' || event.key === 'Escape')) event.currentTarget.blur()
  }
  return <input {...props} value={draft} onChange={event => setDraft(event.target.value)} onBlur={() => { if (draft !== value) onCommit(draft) }} onKeyDown={onKey} />
}

export default function FlowchartBoard() {
  const [initial] = useState(loadFlowDocument)
  const { doc, setDoc, checkpoint, undo, redo, canUndo, canRedo } = useFlowchartHistory(initial)
  const [saveFailed, setSaveFailed] = useState(false)
  const [tool, setTool] = useState<Tool>('select')
  const [grid, setGrid] = useState(true)
  const [zoom, setZoom] = useState(100)
  const [toast, setToast] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const createdId = useRef<string | null>(null)
  const importRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const edgeLabelRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const flow = useReactFlow<FlowNode>()
  const selectedNodes = doc.nodes.filter(node => node.selected)
  const selectedEdges = doc.edges.filter(edge => edge.selected)
  const selectionCount = selectedNodes.length + selectedEdges.length
  const selectedNode = selectionCount === 1 ? selectedNodes[0] : undefined
  const selectedEdge = selectionCount === 1 ? selectedEdges[0] : undefined
  const savedContent = JSON.stringify(serializeFlowDocument(doc))

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, savedContent)
      // oxlint-disable-next-line react/set-state-in-effect -- report external storage availability
      setSaveFailed(false)
    } catch { setSaveFailed(true) }
  }, [savedContent])
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 4000)
    return () => window.clearTimeout(timer)
  }, [toast])
  useEffect(() => {
    if (!menuOpen) return
    const close = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false) }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [menuOpen])

  const onNodesChange = useCallback((changes: NodeChange<FlowNode>[]) => {
    const transient = changes.every(change => change.type === 'select' || change.type === 'dimensions')
    setDoc(current => ({ ...current, nodes: applyNodeChanges(changes, current.nodes) }), transient ? 'transient' : dragging.current ? 'merge' : 'record')
  }, [setDoc])
  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setDoc(current => ({ ...current, edges: applyEdgeChanges(changes, current.edges) }), changes.every(change => change.type === 'select') ? 'transient' : 'record')
  }, [setDoc])
  const onConnect = useCallback((connection: Connection) => setDoc(current => ({ ...current, edges: addEdge(connection, current.edges) })), [setDoc])
  const clearSelection = useCallback(() => setDoc(current => ({ ...current, nodes: current.nodes.map(node => ({ ...node, selected: false })), edges: current.edges.map(edge => ({ ...edge, selected: false })) }), 'transient'), [setDoc])
  const fitView = () => void flow.fitView({ padding: 0.22, maxZoom: 1, duration: 200 })
  const beginDrag = () => { if (!dragging.current) { checkpoint(); dragging.current = true } }
  const endDrag = () => { dragging.current = false }

  function addNode(kind: NodeKind, screen: XYPosition) {
    const point = flow.screenToFlowPosition(screen)
    const node: FlowNode = { id: crypto.randomUUID(), type: 'flowchart', position: { x: point.x - (kind === 'decision' ? 130 : 110), y: point.y - (kind === 'decision' ? 70 : 38) }, selected: true, data: { kind, label: defaultLabels[kind] } }
    setDoc(current => ({ ...current, nodes: [...current.nodes.map(item => ({ ...item, selected: false })), node], edges: current.edges.map(edge => ({ ...edge, selected: false })) }))
    createdId.current = node.id
    setTool('select')
    setEditingId(node.id)
  }
  const finishEditing = useCallback((id: string, label: string) => {
    setDoc(current => {
      const node = current.nodes.find(node => node.id === id)
      const text = label.trim() ? label : node ? defaultLabels[node.data.kind] : ''
      if (!node || node.data.label === text) return current
      return { ...current, nodes: current.nodes.map(node => node.id === id ? { ...node, data: { ...node.data, label: text } } : node) }
    }, createdId.current === id ? 'merge' : 'record')
    createdId.current = null
    setEditingId(null)
  }, [setDoc])

  const deleteSelection = useCallback(() => {
    const ids = new Set(doc.nodes.filter(node => node.selected).map(node => node.id))
    if (!ids.size && !doc.edges.some(edge => edge.selected)) return
    setDoc(current => ({ ...current, nodes: current.nodes.filter(node => !ids.has(node.id)), edges: current.edges.filter(edge => !edge.selected && !ids.has(edge.source) && !ids.has(edge.target)) }))
  }, [doc.nodes, doc.edges, setDoc])
  const duplicateSelection = useCallback(() => {
    const selected = doc.nodes.filter(node => node.selected)
    if (!selected.length) return
    const ids = new Map(selected.map(node => [node.id, crypto.randomUUID()]))
    const copies = selected.map(({ type, position, data, id }) => ({ type, data: { ...data }, id: ids.get(id)!, position: { x: position.x + 40, y: position.y + 40 }, selected: true }))
    const connections = doc.edges.filter(edge => ids.has(edge.source) && ids.has(edge.target)).map(edge => ({ ...edge, id: crypto.randomUUID(), source: ids.get(edge.source)!, target: ids.get(edge.target)!, selected: false }))
    setDoc(current => ({ ...current, nodes: [...current.nodes.map(node => ({ ...node, selected: false })), ...copies], edges: [...current.edges.map(edge => ({ ...edge, selected: false })), ...connections] }))
    setToast(`已复制 ${copies.length} 个想法`)
  }, [doc.nodes, doc.edges, setDoc])
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (target.closest('input, textarea, select, [contenteditable="true"]') || event.isComposing) return
      const key = event.key.toLowerCase()
      if (event.ctrlKey || event.metaKey) {
        if (key === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo() }
        if (key === 'y') { event.preventDefault(); redo() }
        if (key === 'd') { event.preventDefault(); duplicateSelection() }
        if (key === 'a') { event.preventDefault(); setDoc(current => ({ ...current, nodes: current.nodes.map(node => ({ ...node, selected: true })), edges: current.edges.map(edge => ({ ...edge, selected: true })) }), 'transient') }
      } else {
        if (key === 'v') setTool('select')
        if (key === 'h') setTool('pan')
        if (key === 'delete' || key === 'backspace') { event.preventDefault(); deleteSelection() }
        if (key === 'escape') { clearSelection(); setTool('select'); setMenuOpen(false); setHelpOpen(false) }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo, duplicateSelection, deleteSelection, clearSelection, setDoc])

  function updateNode(patch: Partial<FlowNode['data']>) {
    if (selectedNode) setDoc(current => ({ ...current, nodes: current.nodes.map(node => node.id === selectedNode.id ? { ...node, data: { ...node.data, ...patch } } : node) }))
  }
  function exportDocument() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(serializeFlowDocument(doc), null, 2)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${(doc.title.trim() || '未命名画布').replace(/[\\/:*?"<>|]/g, '_')}.json`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    setMenuOpen(false)
    setToast('画布已导出')
  }
  async function importDocument(file?: File) {
    if (!file) return
    try {
      setDoc(parseFlowDocument(JSON.parse(await file.text())))
      window.setTimeout(fitView, 80)
      setToast('画布已导入，可撤销恢复')
    } catch (error) { setToast(error instanceof SyntaxError ? '文件不是有效的 JSON，当前画布未改动' : error instanceof Error ? error.message : '文件读取失败') }
    if (importRef.current) importRef.current.value = ''
  }

  return <div className="flowchart-page">
    <main className={`flowchart-canvas${tool !== 'select' && tool !== 'pan' ? ' is-placing' : ''}`} onDoubleClick={event => {
      const target = event.target as Element
      if (tool !== 'select' || editingId || target.closest('.react-flow__node, .react-flow__edge') || !target.closest('.react-flow__pane')) return
      addNode('process', { x: event.clientX, y: event.clientY })
    }}>
      <EditingContext.Provider value={{ id: editingId, finish: finishEditing }}>
        <ReactFlow<FlowNode> nodes={doc.nodes} edges={doc.edges} nodeTypes={nodeTypes} defaultEdgeOptions={edgeOptions} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
          onNodeDragStart={beginDrag} onNodeDragStop={endDrag} onSelectionDragStart={beginDrag} onSelectionDragStop={endDrag}
          connectionMode={ConnectionMode.Loose} isValidConnection={connection => connection.source !== connection.target}
          onNodeDoubleClick={(_, node) => { clearSelection(); setDoc(current => ({ ...current, nodes: current.nodes.map(item => ({ ...item, selected: item.id === node.id })) }), 'transient'); setEditingId(node.id) }}
          onEdgeDoubleClick={() => window.requestAnimationFrame(() => edgeLabelRef.current?.querySelector('input')?.focus())}
          onPaneClick={event => { if (tool !== 'select' && tool !== 'pan') addNode(tool, { x: event.clientX, y: event.clientY }) }}
          nodesDraggable={tool === 'select' && !editingId} panOnDrag={tool === 'pan' ? true : [1, 2]} selectionOnDrag={tool === 'select' && !editingId} panActivationKeyCode="Space" snapToGrid={false} zoomOnDoubleClick={false}
          deleteKeyCode={null} multiSelectionKeyCode="Shift" fitView={initial.nodes.length > 0} fitViewOptions={{ padding: 0.22, maxZoom: 1 }} minZoom={0.1} maxZoom={3} onMove={(_, viewport) => setZoom(Math.round(viewport.zoom * 100))} aria-label="自由思维画布">
          {grid && <Background color="#d9d8e2" gap={24} size={1} />}
        </ReactFlow>
      </EditingContext.Provider>
      {!doc.nodes.length && <div className="flowchart-empty"><span className="fc-empty-symbol"><Square size={25} strokeWidth={1.3} /><Plus size={14} /></span><h1>想法，从这里开始</h1><p>双击空白处，记下第一个想法</p><small>自由摆放 · 拖动圆点连线 · 随时继续</small></div>}
    </main>

    <div className="fc-document-area" ref={menuRef}>
      <div className="fc-document-bar fc-floating"><button className="fc-icon-button" aria-label="文件菜单" title="文件菜单" aria-expanded={menuOpen} onClick={() => setMenuOpen(value => !value)}><Menu size={19} /></button><span className="fc-divider" /><div className="fc-document-info"><CommitInput key={doc.title} aria-label="画布名称" value={doc.title} onCommit={title => setDoc(current => ({ ...current, title: title.trim() || '未命名画布' }))} /><span className={saveFailed ? 'fc-save has-error' : 'fc-save'} role="status">{saveFailed ? '保存失败，请导出备份' : <><Check size={10} />已保存到浏览器</>}</span></div></div>
      {menuOpen && <div className="fc-file-menu fc-floating" role="menu" aria-label="文件操作"><span className="fc-menu-brand">mindflow<span> / 自由思维画布</span></span><button role="menuitem" onClick={() => { setDoc({ title: '未命名画布', nodes: [], edges: [] }); setMenuOpen(false); setToast('新画布已创建，可撤销恢复'); void flow.setViewport({ x: 0, y: 0, zoom: 1 }) }}><FilePlus2 size={16} />新建画布</button><button role="menuitem" onClick={() => { importRef.current?.click(); setMenuOpen(false) }}><ArrowUpFromLine size={16} />导入 JSON</button><button role="menuitem" onClick={exportDocument}><ArrowDownToLine size={16} />导出 JSON</button><span className="fc-menu-separator" /><button role="menuitemcheckbox" aria-checked={grid} onClick={() => setGrid(value => !value)}><Grid2X2 size={16} />显示点阵网格{grid && <Check size={14} className="fc-menu-check" />}</button><small>内容仅保存在当前浏览器，导出可备份。</small></div>}
    </div>

    <div className="flowchart-toolbar fc-floating" role="toolbar" aria-label="画布工具">
      <button className={`fc-tool${tool === 'select' ? ' active' : ''}`} aria-label="选择工具" aria-pressed={tool === 'select'} title="选择 V" onClick={() => setTool('select')}><MousePointer2 size={19} /><span>选择</span><kbd>V</kbd></button>
      <button className={`fc-tool${tool === 'pan' ? ' active' : ''}`} aria-label="平移工具" aria-pressed={tool === 'pan'} title="平移 H" onClick={() => setTool('pan')}><Hand size={19} /><span>平移</span><kbd>H</kbd></button><span className="fc-divider" />
      <button className={`fc-tool${tool === 'process' ? ' active' : ''}`} aria-label="想法工具" aria-pressed={tool === 'process'} title="点击画布放置一个想法" onClick={() => setTool('process')}><Square size={19} /><span>想法</span></button>
      <button className={`fc-tool${tool === 'decision' ? ' active' : ''}`} aria-label="判断工具" aria-pressed={tool === 'decision'} title="点击画布放置一个判断" onClick={() => setTool('decision')}><Diamond size={20} /><span>判断</span></button>
      <button className={`fc-tool${tool === 'start' ? ' active' : ''}`} aria-label="起止工具" aria-pressed={tool === 'start'} title="点击画布放置一个圆角想法" onClick={() => setTool('start')}><Circle size={19} /><span>起止</span></button>
    </div>

    {!!selectionCount && <aside className="flowchart-inspector fc-floating" aria-label="属性面板"><div className="fc-panel-heading"><h2>{selectedNode ? '想法属性' : selectedEdge ? '连线属性' : `已选择 ${selectionCount} 项`}</h2><button className="fc-icon-button" aria-label="关闭属性" onClick={clearSelection}><X size={15} /></button></div>
      {selectedNode && <><label className="fc-field"><span>形状</span><select aria-label="节点形状" value={selectedNode.data.kind} onChange={event => updateNode({ kind: event.target.value as NodeKind })}>{kinds.map(item => <option key={item.kind} value={item.kind}>{item.label}</option>)}</select></label><span className="fc-field-label">颜色</span><div className="fc-color-options" role="group" aria-label="节点配色">{colors.map(color => <button key={color.value} aria-label={color.name} title={color.name} aria-pressed={(selectedNode.data.color ?? defaultColor(selectedNode.data.kind).value) === color.value} style={{ background: color.fill, '--swatch-color': color.value } as CSSProperties} onClick={() => updateNode({ color: color.value })}><span style={{ background: color.value }} /></button>)}</div><button className="fc-edit-button" onClick={() => setEditingId(selectedNode.id)}>编辑想法 <kbd>双击节点</kbd></button></>}
      {selectedEdge && <><div ref={edgeLabelRef}><label className="fc-field"><span>连线文字</span><CommitInput key={`${selectedEdge.id}:${selectedEdge.label ?? ''}`} aria-label="连线文字" value={String(selectedEdge.label ?? '')} placeholder="这个联系意味着什么？" onCommit={label => setDoc(current => ({ ...current, edges: current.edges.map(edge => edge.id === selectedEdge.id ? { ...edge, label } : edge) }))} /></label></div><label className="fc-field"><span>线型</span><select aria-label="连线样式" value={selectedEdge.type ?? 'smoothstep'} onChange={event => setDoc(current => ({ ...current, edges: current.edges.map(edge => edge.id === selectedEdge.id ? { ...edge, type: event.target.value } : edge) }))}><option value="smoothstep">圆角折线</option><option value="default">曲线</option><option value="straight">直线</option></select></label></>}
      {selectionCount > 1 && <p className="fc-selection-note">一起移动，或复制这些想法。<br />所选想法之间的连线会一并复制。</p>}
      <div className="fc-inspector-actions"><button disabled={!selectedNodes.length} onClick={duplicateSelection}><Copy size={14} />复制</button><button onClick={deleteSelection}><Trash2 size={14} />删除</button></div>
    </aside>}

    <div className="fc-bottom-left"><div className="fc-zoom-controls fc-floating"><button className="fc-icon-button" aria-label="缩小" onClick={() => void flow.zoomOut({ duration: 150 })}><Minus size={16} /></button><span>{zoom}%</span><button className="fc-icon-button" aria-label="放大" onClick={() => void flow.zoomIn({ duration: 150 })}><Plus size={16} /></button><span className="fc-divider" /><button className="fc-icon-button" aria-label="适应画布" title="适应全部想法" onClick={fitView}><Maximize2 size={16} /></button></div><div className="fc-history-controls fc-floating"><button className="fc-icon-button" aria-label="撤销" title="撤销 Ctrl/Cmd+Z" disabled={!canUndo} onClick={undo}><Undo2 size={17} /></button><button className="fc-icon-button" aria-label="重做" title="重做 Ctrl/Cmd+Shift+Z" disabled={!canRedo} onClick={redo}><Redo2 size={17} /></button></div></div>
    <div className="fc-canvas-hint">{editingId ? 'Enter 换行 · Ctrl / ⌘ + Enter 完成' : tool === 'pan' ? '拖动平移 · 按 V 返回选择' : tool !== 'select' ? '点击空白处放置，随即输入' : '双击记想法 · 拖动圆点连线 · Space 平移'}</div>
    <div className="fc-help-area">{helpOpen && <div className="fc-help-panel fc-floating"><h2>留住每一个想法</h2><p>双击空白处创建，双击想法编辑。</p><p>Enter 换行，Ctrl / ⌘ + Enter 或失焦完成。</p><dl><dt>选择 / 平移</dt><dd>V / H</dd><dt>临时平移</dt><dd>按住 Space 拖动</dd><dt>多选</dt><dd>拖动框选 / Shift 点击</dd><dt>复制 / 删除</dt><dd>Ctrl / ⌘ + D / Delete</dd><dt>撤销 / 重做</dt><dd>Ctrl / ⌘ + Z / Shift + Z</dd></dl><small>滚轮缩放 · 自由定位，不吸附网格</small></div>}<button className="fc-icon-button fc-floating" aria-label="帮助" aria-expanded={helpOpen} onClick={() => setHelpOpen(value => !value)}><HelpCircle size={19} /></button></div>
    <input ref={importRef} type="file" aria-label="导入画布文件" accept=".json,application/json" hidden onChange={event => void importDocument(event.target.files?.[0])} />
    {toast && <div className="fc-toast fc-floating" role="status">{toast}</div>}
  </div>
}
