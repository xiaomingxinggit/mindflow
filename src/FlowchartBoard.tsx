import { memo, useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { addEdge, applyEdgeChanges, applyNodeChanges, Background, ConnectionMode, Handle, MarkerType, Panel, Position, ReactFlow, useReactFlow } from '@xyflow/react'
import type { Connection, EdgeChange, NodeChange, NodeProps, XYPosition } from '@xyflow/react'
import { ArrowDownToLine, ArrowUpFromLine, Check, ChevronRight, Copy, FilePlus2, Grid2X2, Hand, Layers2, Maximize2, Minus, MousePointer2, Plus, Redo2, Shapes, Trash2, Undo2, Workflow, X } from 'lucide-react'
import { loadFlowDocument, parseFlowDocument, serializeFlowDocument, STORAGE_KEY } from './flowchart'
import type { FlowNode, NodeKind } from './flowchart'
import { useFlowchartHistory } from './useFlowchartHistory'
import './FlowchartBoard.css'

const kinds = [{ kind: 'start', label: '开始' }, { kind: 'process', label: '步骤' }, { kind: 'decision', label: '判断' }, { kind: 'end', label: '结束' }] as const
const colors = [
  { value: '#8b78cf', name: '紫色', fill: '#f4f0ff', text: '#5e4b98' },
  { value: '#6b9bd1', name: '蓝色', fill: '#eff6ff', text: '#416a9a' },
  { value: '#79ad93', name: '绿色', fill: '#f0f8f3', text: '#456c56' },
  { value: '#cfaf65', name: '黄色', fill: '#fffaeb', text: '#88703c' },
  { value: '#a3a5b5', name: '灰色', fill: '#f5f5f8', text: '#626575' },
]
const handles = [Position.Top, Position.Right, Position.Bottom, Position.Left]
const edgeOptions = { type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed, color: '#9292a3' }, style: { stroke: '#9292a3', strokeWidth: 1.6 } }
const defaultColor = (kind: NodeKind) => kind === 'start' ? colors[2] : kind === 'decision' ? colors[3] : kind === 'end' ? colors[4] : colors[0]

const FlowchartNode = memo(({ data, selected }: NodeProps<FlowNode>) => {
  const color = data.color ? colors.find(item => item.value === data.color) ?? { value: data.color, fill: `${data.color}15`, text: data.color } : defaultColor(data.kind)
  return <div className={`flowchart-node flowchart-${data.kind}${selected ? ' is-selected' : ''}`} style={{ '--node-fill': color.fill, '--node-stroke': color.value, '--node-text': color.text } as CSSProperties}>
    {data.kind === 'decision' && <svg className="flowchart-diamond" viewBox="0 0 180 112" aria-hidden="true"><polygon points="90,1 179,56 90,111 1,56" /></svg>}
    <span className="flowchart-node-label" title={data.label}>{data.label}</span>
    {handles.map(position => <Handle key={position} id={position} type="source" position={position} />)}
  </div>
})
const nodeTypes = { flowchart: FlowchartNode }

export default function FlowchartBoard() {
  const [initial] = useState(loadFlowDocument)
  const { doc, setDoc, checkpoint, undo, redo, canUndo, canRedo } = useFlowchartHistory(initial)
  const [saveFailed, setSaveFailed] = useState(false)
  const [mode, setMode] = useState<'select' | 'pan'>('select')
  const [grid, setGrid] = useState(true)
  const [zoom, setZoom] = useState(100)
  const [toast, setToast] = useState('')
  const canvasRef = useRef<HTMLElement>(null)
  const labelRef = useRef<HTMLInputElement>(null)
  const importRef = useRef<HTMLInputElement>(null)
  const editing = useRef(false)
  const dragging = useRef(false)
  const flow = useReactFlow<FlowNode>()
  const selectedNodes = doc.nodes.filter(node => node.selected)
  const selectedEdges = doc.edges.filter(edge => edge.selected)
  const selectionCount = selectedNodes.length + selectedEdges.length
  const selectedNode = selectionCount === 1 ? selectedNodes[0] : undefined
  const selectedEdge = selectionCount === 1 ? selectedEdges[0] : undefined

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeFlowDocument(doc)))
      // Reflect availability of external browser storage after each write.
      // oxlint-disable-next-line react/set-state-in-effect
      setSaveFailed(false)
    } catch { setSaveFailed(true) }
  }, [doc])
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 3000)
    return () => window.clearTimeout(timer)
  }, [toast])

  const onNodesChange = useCallback((changes: NodeChange<FlowNode>[]) => {
    if (changes.some(change => change.type === 'position') && !dragging.current) checkpoint()
    const transient = changes.every(change => change.type === 'select' || change.type === 'dimensions')
    setDoc(current => ({ ...current, nodes: applyNodeChanges(changes, current.nodes) }), transient ? 'transient' : 'merge')
  }, [setDoc, checkpoint])
  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setDoc(current => ({ ...current, edges: applyEdgeChanges(changes, current.edges) }), changes.every(change => change.type === 'select') ? 'transient' : 'merge')
  }, [setDoc])
  const onConnect = useCallback((connection: Connection) => setDoc(current => ({ ...current, edges: addEdge(connection, current.edges) })), [setDoc])
  const clearSelection = () => setDoc(current => ({ ...current, nodes: current.nodes.map(node => ({ ...node, selected: false })), edges: current.edges.map(edge => ({ ...edge, selected: false })) }), 'transient')
  const fitView = () => void flow.fitView({ padding: 0.2, maxZoom: 1, duration: 200 })

  function addNode(kind: NodeKind, dropPosition?: XYPosition) {
    const bounds = canvasRef.current!.getBoundingClientRect()
    const center = flow.screenToFlowPosition({ x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 })
    const position = dropPosition ?? { x: center.x - 90, y: center.y - 32 }
    if (!dropPosition) while (doc.nodes.some(node => Math.abs(node.position.x - position.x) < 200 && Math.abs(node.position.y - position.y) < 132)) position.x += 220
    const node: FlowNode = { id: crypto.randomUUID(), type: 'flowchart', position, selected: true, data: { kind, label: kind === 'process' ? '新的步骤' : kind === 'decision' ? '判断条件' : kinds.find(item => item.kind === kind)!.label } }
    setDoc(current => ({ ...current, nodes: [...current.nodes.map(item => ({ ...item, selected: false })), node], edges: current.edges.map(edge => ({ ...edge, selected: false })) }))
    setMode('select')
    const screen = flow.flowToScreenPosition(position)
    if (!dropPosition && (screen.x + 180 * flow.getZoom() > bounds.right - 20 || screen.x < bounds.left)) void flow.setCenter(position.x + 90, position.y + 32, { zoom: flow.getZoom(), duration: 200 })
    window.requestAnimationFrame(() => { labelRef.current?.focus(); labelRef.current?.select() })
  }

  const duplicateSelection = useCallback(() => {
    const selected = doc.nodes.filter(node => node.selected)
    if (!selected.length) return
    const ids = new Map(selected.map(node => [node.id, crypto.randomUUID()]))
    const copies = selected.map(node => ({ ...node, id: ids.get(node.id)!, position: { x: node.position.x + 40, y: node.position.y + 40 }, selected: true }))
    const connections = doc.edges.filter(edge => ids.has(edge.source) && ids.has(edge.target)).map(edge => ({ ...edge, id: crypto.randomUUID(), source: ids.get(edge.source)!, target: ids.get(edge.target)!, selected: false }))
    setDoc(current => ({ ...current, nodes: [...current.nodes.map(node => ({ ...node, selected: false })), ...copies], edges: [...current.edges.map(edge => ({ ...edge, selected: false })), ...connections] }))
    setToast(`已复制 ${copies.length} 个节点`)
  }, [doc.nodes, doc.edges, setDoc])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (target.closest('input, textarea, select, [contenteditable="true"]') || event.isComposing) return
      if (event.ctrlKey || event.metaKey) {
        const key = event.key.toLowerCase()
        if (key === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo() }
        if (key === 'y') { event.preventDefault(); redo() }
        if (key === 'd') { event.preventDefault(); duplicateSelection() }
        if (key === 'a') { event.preventDefault(); setDoc(current => ({ ...current, nodes: current.nodes.map(node => ({ ...node, selected: true })), edges: current.edges.map(edge => ({ ...edge, selected: true })) }), 'transient') }
      } else {
        if (event.key.toLowerCase() === 'v') setMode('select')
        if (event.key.toLowerCase() === 'h') setMode('pan')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo, duplicateSelection, setDoc])

  function beginTextEdit() { if (!editing.current) { checkpoint(); editing.current = true } }
  function updateLabel(value: string) {
    beginTextEdit()
    if (selectedNode) setDoc(current => ({ ...current, nodes: current.nodes.map(node => node.id === selectedNode.id ? { ...node, data: { ...node.data, label: value } } : node) }), 'merge')
    if (selectedEdge) setDoc(current => ({ ...current, edges: current.edges.map(edge => edge.id === selectedEdge.id ? { ...edge, label: value } : edge) }), 'merge')
  }
  function updateNode(patch: Partial<FlowNode['data']>) {
    if (selectedNode) setDoc(current => ({ ...current, nodes: current.nodes.map(node => node.id === selectedNode.id ? { ...node, data: { ...node.data, ...patch } } : node) }))
  }
  function exportDocument() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(serializeFlowDocument(doc), null, 2)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${(doc.title.trim() || '我的流程图').replace(/[\\/:*?"<>|]/g, '_')}.json`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    setToast('流程图已导出，可通过导入继续编辑')
  }
  async function importDocument(file?: File) {
    if (!file) return
    try {
      if (file.size > 2_000_000) throw new Error('请选择小于 2 MB 的 JSON 文件')
      setDoc(parseFlowDocument(JSON.parse(await file.text())))
      window.setTimeout(fitView, 80)
      setToast('流程图已导入，可撤销恢复上一张画布')
    } catch (error) { setToast(error instanceof SyntaxError ? '文件不是有效的 JSON' : error instanceof Error ? error.message : '导入失败') }
    if (importRef.current) importRef.current.value = ''
  }

  return <div className={`flowchart-page${selectionCount ? ' has-selection' : ''}`}>
    <header className="flowchart-header">
      <a href="#flowchart" className="flowchart-brand" aria-label="Mindflow 流程图"><span><Workflow size={22} /></span><strong>mindflow<span>.</span></strong></a>
      <div className="flowchart-document">
        <span>我的工作空间 <ChevronRight size={13} /></span>
        <input aria-label="流程图名称" value={doc.title} maxLength={80} onFocus={() => { editing.current = false }} onChange={event => { beginTextEdit(); setDoc(current => ({ ...current, title: event.target.value }), 'merge') }} onBlur={() => { editing.current = false; if (!doc.title.trim()) setDoc(current => ({ ...current, title: '未命名流程图' }), 'merge') }} />
        <span className={`flowchart-save${saveFailed ? ' has-error' : ''}`} role="status"><Check size={12} />{saveFailed ? '保存失败' : '已保存到浏览器'}</span>
      </div>
      <div className="flowchart-header-actions"><button className="fc-icon-button" title="新建流程图" aria-label="新建流程图" onClick={() => { setDoc({ title: '未命名流程图', nodes: [], edges: [] }); setToast('新画布已创建，可通过撤销恢复') }}><FilePlus2 size={17} /></button><button className="fc-secondary" onClick={() => importRef.current?.click()}><ArrowUpFromLine size={15} /><span>导入</span></button><button className="fc-primary" onClick={exportDocument}><ArrowDownToLine size={15} /><span>导出</span></button></div>
    </header>
    <div className="flowchart-toolbar">
      <span className="fc-current-view"><Workflow size={15} />流程图</span><span className="fc-divider" />
      <div className="fc-tool-group"><button className="fc-icon-button" aria-label="撤销" title="撤销 Ctrl+Z" disabled={!canUndo} onClick={undo}><Undo2 size={17} /></button><button className="fc-icon-button" aria-label="重做" title="重做 Ctrl+Shift+Z" disabled={!canRedo} onClick={redo}><Redo2 size={17} /></button></div><span className="fc-divider" />
      <div className="fc-tool-group" aria-label="画布工具"><button className={`fc-icon-button${mode === 'select' ? ' active' : ''}`} aria-label="选择工具" aria-pressed={mode === 'select'} title="选择工具 V" onClick={() => setMode('select')}><MousePointer2 size={17} /></button><button className={`fc-icon-button${mode === 'pan' ? ' active' : ''}`} aria-label="平移工具" aria-pressed={mode === 'pan'} title="平移工具 H" onClick={() => setMode('pan')}><Hand size={17} /></button></div><span className="fc-divider" />
      <div className="fc-tool-group"><button className="fc-icon-button" aria-label="复制选中节点" title="复制 Ctrl+D" disabled={!selectedNodes.length} onClick={duplicateSelection}><Copy size={16} /></button><button className="fc-icon-button" aria-label="删除选中项" title="删除 Delete" disabled={!selectionCount} onClick={() => void flow.deleteElements({ nodes: selectedNodes, edges: selectedEdges })}><Trash2 size={16} /></button></div><span className="fc-divider" />
      <button className={`fc-icon-button${grid ? ' active' : ''}`} aria-label="网格吸附" aria-pressed={grid} title="网格与吸附" onClick={() => setGrid(value => !value)}><Grid2X2 size={16} /></button><span className="fc-shortcut-hint">按住空格拖动画布 <kbd>Space</kbd></span>
    </div>
    <div className="flowchart-workspace">
      <aside className="flowchart-library" aria-label="图形库">
        <div className="fc-panel-heading"><h2>图形库</h2><Shapes size={16} /></div><p className="fc-library-caption">基础流程图</p>
        <div className="fc-shape-grid" role="group" aria-label="添加节点">{kinds.map(({ kind, label }) => <button key={kind} className="fc-shape-card" draggable onClick={() => addNode(kind)} onDragStart={event => { event.dataTransfer.setData('application/mindflow-node', kind); event.dataTransfer.effectAllowed = 'copy' }} title={`点击或拖动添加${label}节点`}><span className="fc-shape-preview"><span className={`fc-shape-${kind}`} /></span><small>{label}</small></button>)}</div>
        <div className="fc-library-note"><MousePointer2 size={15} /><p>拖动图形到画布<br />也可以点击直接添加</p></div>
        <nav className="fc-library-nav" aria-label="其他画布"><a href="#mindmap"><Layers2 size={15} />思维导图<ChevronRight size={13} /></a><a href="#architecture"><Workflow size={15} />系统架构<ChevronRight size={13} /></a></nav>
      </aside>
      <main className="flowchart-canvas" ref={canvasRef} onDragOver={event => { if (event.dataTransfer.types.includes('application/mindflow-node')) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy' } }} onDrop={event => {
        event.preventDefault()
        const kind = event.dataTransfer.getData('application/mindflow-node') as NodeKind
        if (!kinds.some(item => item.kind === kind)) return
        const point = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY })
        addNode(kind, { x: point.x - 90, y: point.y - (kind === 'decision' ? 56 : 32) })
      }}>
        <ReactFlow<FlowNode> nodes={doc.nodes} edges={doc.edges} nodeTypes={nodeTypes} defaultEdgeOptions={edgeOptions} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
          onNodeDragStart={() => { checkpoint(); dragging.current = true }} onNodeDragStop={() => { dragging.current = false }} onBeforeDelete={async ({ nodes, edges }) => { if (nodes.length || edges.length) checkpoint(); return true }}
          connectionMode={ConnectionMode.Loose} isValidConnection={connection => connection.source !== connection.target}
          onNodeDoubleClick={() => { labelRef.current?.focus(); labelRef.current?.select() }} onEdgeDoubleClick={() => { labelRef.current?.focus(); labelRef.current?.select() }}
          nodesDraggable={mode === 'select'} panOnDrag={mode === 'pan' ? true : [1, 2]} selectionOnDrag={mode === 'select'} panActivationKeyCode="Space" snapToGrid={grid} snapGrid={[20, 20]}
          deleteKeyCode={['Backspace', 'Delete']} fitView fitViewOptions={{ padding: 0.2, maxZoom: 1 }} minZoom={0.2} maxZoom={2} onMove={(_, viewport) => setZoom(Math.round(viewport.zoom * 100))} aria-label="流程图画布">
          {grid && <Background color="#dddce5" gap={20} size={1} />}
          <Panel position="bottom-right" className="fc-zoom-controls"><button aria-label="缩小" title="缩小" onClick={() => void flow.zoomOut({ duration: 150 })}><Minus size={16} /></button><span>{zoom}%</span><button aria-label="放大" title="放大" onClick={() => void flow.zoomIn({ duration: 150 })}><Plus size={16} /></button><span className="fc-zoom-divider" /><button aria-label="适应画布" title="适应画布" onClick={fitView}><Maximize2 size={16} /></button></Panel>
          <Panel position="bottom-left" className="flowchart-help">{mode === 'select' ? '拖拽框选 · 拖动圆点连线' : '拖动画布平移 · 按 V 返回选择'}</Panel>
        </ReactFlow>
        <div className="fc-canvas-label"><Workflow size={14} /><small>{doc.title || '未命名流程图'}</small></div>
        {!doc.nodes.length && <div className="flowchart-empty"><Shapes size={34} /><strong>从一个节点开始</strong><p>拖入左侧图形，开始绘制流程</p></div>}
      </main>
      <aside className="flowchart-inspector" aria-label="属性面板">
        <div className="fc-panel-heading"><h2>{selectionCount ? '元素属性' : '画布'}</h2>{selectionCount ? <button className="fc-icon-button" aria-label="关闭属性" onClick={clearSelection}><X size={16} /></button> : <Layers2 size={16} />}</div>
        <div className="fc-inspector-body">
          {selectedNode || selectedEdge ? <>
            <div className="fc-selection-summary"><span>{selectedNode ? <Shapes size={20} /> : <Workflow size={20} />}</span><div><h3>{selectedNode ? `${kinds.find(item => item.kind === selectedNode.data.kind)!.label}节点` : '连接线'}</h3><p>{selectedNode ? '定义这个步骤的内容与样式' : '为流程方向添加条件说明'}</p></div></div>
            <label className="fc-field"><span>{selectedNode ? '节点文字' : '连线文字'}</span><input ref={labelRef} aria-label={selectedNode ? '节点文字' : '连线文字'} value={selectedNode?.data.label ?? String(selectedEdge?.label ?? '')} maxLength={selectedNode ? 40 : 20} placeholder={selectedNode ? '输入节点文字' : '例如：是 / 否'} onFocus={() => { editing.current = false }} onChange={event => updateLabel(event.target.value)} onBlur={event => { if (selectedNode && !event.target.value.trim()) updateLabel(kinds.find(item => item.kind === selectedNode.data.kind)!.label); editing.current = false }} onKeyDown={event => { if (!event.nativeEvent.isComposing && (event.key === 'Enter' || event.key === 'Escape')) event.currentTarget.blur() }} /></label>
            {selectedNode && <><label className="fc-field"><span>节点形状</span><select aria-label="节点形状" value={selectedNode.data.kind} onChange={event => updateNode({ kind: event.target.value as NodeKind })}>{kinds.map(item => <option key={item.kind} value={item.kind}>{item.label}</option>)}</select></label><p className="fc-section-title">节点配色</p><div className="fc-color-options" role="group" aria-label="节点配色">{colors.map(color => <button key={color.value} aria-label={color.name} title={color.name} aria-pressed={(selectedNode.data.color ?? defaultColor(selectedNode.data.kind).value) === color.value} style={{ background: color.fill, '--swatch-color': color.value } as CSSProperties} onClick={() => updateNode({ color: color.value })}><span style={{ background: color.value }} /></button>)}</div></>}
            {selectedEdge && <label className="fc-field"><span>连线样式</span><select aria-label="连线样式" value={selectedEdge.type ?? 'smoothstep'} onChange={event => setDoc(current => ({ ...current, edges: current.edges.map(edge => edge.id === selectedEdge.id ? { ...edge, type: event.target.value } : edge) }))}><option value="smoothstep">圆角折线</option><option value="default">曲线</option><option value="straight">直线</option></select></label>}
          </> : selectionCount ? <div className="fc-inspector-empty"><Layers2 size={28} /><h3>已选择 {selectionCount} 项</h3><p>可以批量复制或删除。<br />点击单个元素可编辑属性。</p></div> : <><div className="fc-inspector-empty"><MousePointer2 size={28} /><h3>让流程清晰起来</h3><p>选中节点或连线，<br />在这里修改文字与样式。</p></div><div className="fc-document-stats"><div><strong>{doc.nodes.length}</strong><span>节点</span></div><div><strong>{doc.edges.length}</strong><span>连接线</span></div></div><p className="fc-section-title">常用快捷键</p><div className="fc-shortcuts"><div><span>选择 / 平移</span><kbd>V / H</kbd></div><div><span>撤销</span><kbd>Ctrl Z</kbd></div><div><span>复制节点</span><kbd>Ctrl D</kbd></div><div><span>多选</span><kbd>Shift</kbd></div><div><span>删除</span><kbd>Delete</kbd></div></div></>}
          {!!selectionCount && <div className="fc-inspector-actions"><button className="fc-secondary" disabled={!selectedNodes.length} onClick={duplicateSelection}><Copy size={14} />复制</button><button className="fc-secondary is-danger" onClick={() => void flow.deleteElements({ nodes: selectedNodes, edges: selectedEdges })}><Trash2 size={14} />删除</button></div>}
        </div>
      </aside>
    </div>
    <footer className="flowchart-statusbar"><span>{doc.nodes.length} 个节点<span> · </span>{doc.edges.length} 条连线</span><span>{saveFailed ? '浏览器保存失败，请导出备份' : '本地自动保存'}<span> · </span>{grid ? '网格吸附已开启' : '自由定位'}</span></footer>
    <input ref={importRef} type="file" accept=".json,application/json" hidden onChange={event => void importDocument(event.target.files?.[0])} />
    {toast && <div className="fc-toast" role="status"><Check size={15} />{toast}</div>}
  </div>
}
