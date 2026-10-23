import { useCallback, useEffect, useRef, useState, memo } from 'react'
import { ReactFlow, ReactFlowProvider, Background, BackgroundVariant, Handle, Position, BaseEdge, getBezierPath, useReactFlow } from '@xyflow/react'
import type { Node, NodeProps, Edge, EdgeProps, NodeChange } from '@xyflow/react'
import { ArrowDownToLine, ArrowUpFromLine, Check, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, FilePlus2, Focus, GitBranch, Layers2, Leaf, Maximize2, MoreHorizontal, MousePointer2, Pause, Play, Plus, Redo2, RotateCcw, Settings2, Sparkles, Trash2, Undo2, X, ZoomIn, ZoomOut } from 'lucide-react'
import { branchOf, descendants, layout, palette, STORAGE_KEY, validateDocument } from './mindmap'
import type { Topic } from './mindmap'
import { useDocumentHistory } from './useDocumentHistory'
import ArchitectureBoard from './ArchitectureBoard'
import FlowchartBoard from './FlowchartBoard'
import '@xyflow/react/dist/style.css'
import './App.css'

type TopicData = Topic & { isRoot: boolean; isBranch: boolean; dimmed: boolean; floating: boolean; order: number; replay: number }
type MapNode = Node<TopicData, 'topic'>
type MapEdge = Edge<{ color: string; flowing: boolean; dimmed: boolean }, 'flow'>

const TopicNode = memo(({ data, selected }: NodeProps<MapNode>) => {
  const sourcePosition = data.side === 'left' ? Position.Left : Position.Right
  return <div className={`topic-shell ${data.dimmed ? 'dimmed' : ''}`}>
    <div key={data.replay} className={`topic-card ${data.isRoot ? 'root-topic' : data.isBranch ? 'branch-topic' : 'leaf-topic'} ${selected ? 'is-selected' : ''} ${data.floating ? 'floating' : ''}`} style={{ '--topic-color': data.color, '--entry-delay': `${data.order * 55}ms`, '--float-delay': `${data.order * -0.4}s` } as React.CSSProperties}>
      {data.isRoot ? <><span className="root-eyebrow"><Sparkles size={12} /> THE BIG IDEA</span><h2>{data.label}</h2><p>{data.note}</p><span className="root-decoration"><GitBranch size={40} /></span></> : <><span className="topic-dot" /><div className="topic-text"><strong>{data.label}</strong>{data.isBranch && data.note && <p>{data.note}</p>}</div>{data.isBranch && <ChevronRight size={14} className="branch-arrow" />}</>}
      {data.isRoot ? <><Handle type="source" position={Position.Left} id="left" /><Handle type="source" position={Position.Right} id="right" /></> : <><Handle type="target" position={data.side === 'left' ? Position.Right : Position.Left} id="target" /><Handle type="source" position={sourcePosition} id="source" /></>}
    </div>
  </div>
})

function FlowEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }: EdgeProps<MapEdge>) {
  const [path] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, curvature: 0.45 })
  return <g className={`flow-edge ${data?.dimmed ? 'dimmed' : ''}`}>
    <BaseEdge id={id} path={path} style={{ stroke: data?.color, strokeWidth: 1.8, strokeOpacity: 0.45 }} />
    {data?.flowing && <circle r="3" fill={data.color} className="edge-particle"><animateMotion dur="3.5s" repeatCount="indefinite" path={path} /></circle>}
  </g>
}
const nodeTypes = { topic: TopicNode }
const edgeTypes = { flow: FlowEdge }

function MindFlow({ onOpenArchitecture }: { onOpenArchitecture: () => void }) {
  const { doc, setDoc, checkpoint, undo, redo, canUndo, canRedo } = useDocumentHistory()
  const [selectedId, setSelectedId] = useState<string | null>(() => doc.topics.find(t => !t.parent)!.id)
  const [tab, setTab] = useState<'outline' | 'style'>('outline')
  const [flowing, setFlowing] = useState(true)
  const [floating, setFloating] = useState(false)
  const [presenting, setPresenting] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [step, setStep] = useState(0)
  const [duration, setDuration] = useState(5)
  const [replay, setReplay] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [saveState, setSaveState] = useState('已保存到此浏览器')
  const [toast, setToast] = useState('')
  const [zoom, setZoom] = useState(100)
  const [nodeMetadata, setNodeMetadata] = useState<Record<string, { measured?: { width: number; height: number }; dragging?: boolean }>>({})
  const importRef = useRef<HTMLInputElement>(null)
  const latestDocument = useRef(doc)
  const flow = useReactFlow<MapNode, MapEdge>()
  const selected = doc.topics.find(t => t.id === selectedId)
  const root = doc.topics.find(t => !t.parent)!
  const branches = doc.topics.filter(t => t.parent === root.id)
  const activeBranch = step > 0 ? branches[step - 1]?.id : null
  const stepsCount = branches.length + 1

  useEffect(() => { latestDocument.current = doc }, [doc])
  useEffect(() => () => {
    const current = latestDocument.current
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, title: current.title.trim() || '未命名导图', topics: current.topics.map(t => ({ ...t, label: t.label.trim() || '新的想法' })) })) }
    catch { /* The editor displays persistence errors while mounted. */ }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...doc, title: doc.title.trim() || '未命名导图', topics: doc.topics.map(t => ({ ...t, label: t.label.trim() || '新的想法' })) })); setSaveState('已保存到此浏览器') }
      catch { setSaveState('保存失败，请导出备份') }
    }, 400)
    return () => window.clearTimeout(timer)
  }, [doc])
  useEffect(() => { if (toast) { const timer = window.setTimeout(() => setToast(''), 3000); return () => window.clearTimeout(timer) } }, [toast])
  useEffect(() => {
    if (!playing) return
    const timer = window.setTimeout(() => {
      if (step >= stepsCount - 1) setPlaying(false)
      else setStep(current => current + 1)
    }, duration * 1000)
    return () => window.clearTimeout(timer)
  }, [playing, duration, stepsCount, step])
  useEffect(() => {
    if (!presenting) return
    const ids = activeBranch ? descendants(activeBranch, doc.topics) : new Set(doc.topics.map(t => t.id))
    const timer = window.setTimeout(() => { void flow.fitView({ nodes: [...ids].map(id => ({ id })), duration: 800, padding: activeBranch ? 0.45 : 0.18, maxZoom: 1.15 }) }, 50)
    return () => window.clearTimeout(timer)
  }, [presenting, activeBranch, doc.topics, flow])

  const updateTopic = useCallback((id: string, patch: Partial<Topic>) => {
    setDoc(current => ({ ...current, topics: current.topics.map(t => t.id === id ? { ...t, ...patch } : t) }))
    setSaveState('正在保存…')
  }, [setDoc])

  const addTopic = useCallback(() => {
    if (doc.topics.length >= 500) { setToast('最多支持 500 个节点'); return }
    const parent = selected ?? root
    const side = parent.parent ? parent.side : branches.filter(t => t.side === 'left').length <= branches.filter(t => t.side === 'right').length ? 'left' : 'right'
    const id = crypto.randomUUID()
    const topic: Topic = { id, parent: parent.id, label: '新的想法', note: '', color: parent.parent ? parent.color : palette[branches.length % palette.length], side, position: { x: 0, y: 0 } }
    setDoc(current => ({ ...current, topics: layout([...current.topics, topic]) }))
    setSelectedId(id); setSaveState('正在保存…'); setToast('分支已添加，可在左侧修改内容')
    window.setTimeout(() => { void flow.fitView({ duration: 500, padding: 0.18 }) }, 100)
  }, [doc.topics, selected, root, branches, flow, setDoc])

  const removeTopic = useCallback(() => {
    if (!selected?.parent) return
    const removed = descendants(selected.id, doc.topics)
    setDoc(current => ({ ...current, topics: layout(current.topics.filter(t => !removed.has(t.id))) }))
    setSelectedId(selected.parent); setToast(`已删除 ${removed.size} 个节点`)
  }, [selected, doc.topics, setDoc])

  const exitPresentation = useCallback(() => { setPresenting(false); setPlaying(false); setStep(0); window.setTimeout(() => { void flow.fitView({ duration: 500, padding: 0.18 }) }, 100) }, [flow])
  const startPresentation = () => { setPresenting(true); setPlaying(true); setStep(0); setMenuOpen(false) }
  const togglePlayback = useCallback(() => {
    if (!presenting) { setPresenting(true); setStep(0); setPlaying(true) }
    else { if (step >= stepsCount - 1 && !playing) setStep(0); setPlaying(value => !value) }
  }, [presenting, step, stepsCount, playing])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (target.matches('input, textarea, select') || target.isContentEditable) return
      if (helpOpen) { if (event.key === 'Escape') setHelpOpen(false); return }
      if (!presenting && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo(); return }
      if (!presenting && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); return }
      if (event.key === 'Escape') { exitPresentation(); setHelpOpen(false); setMenuOpen(false) }
      if (event.code === 'Space' && target.tagName !== 'BUTTON') { event.preventDefault(); togglePlayback() }
      if (presenting && event.key === 'ArrowRight') setStep(s => Math.min(stepsCount - 1, s + 1))
      if (presenting && event.key === 'ArrowLeft') setStep(s => Math.max(0, s - 1))
      if (!presenting && event.key === 'Tab' && (target.closest('.react-flow') || target === document.body)) { event.preventDefault(); addTopic() }
      if (!presenting && ['Delete', 'Backspace'].includes(event.key)) { event.preventDefault(); removeTopic() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [addTopic, removeTopic, presenting, stepsCount, togglePlayback, exitPresentation, undo, redo, helpOpen])

  const onNodesChange = useCallback((changes: NodeChange<MapNode>[]) => {
    const metadataChanges = changes.filter(c => c.type === 'dimensions' || (c.type === 'position' && c.dragging !== undefined))
    if (metadataChanges.length) setNodeMetadata(current => {
      const next = { ...current }
      for (const c of metadataChanges) {
        if (c.type === 'dimensions' && c.dimensions) next[c.id] = { ...next[c.id], measured: c.dimensions }
        if (c.type === 'position') next[c.id] = { ...next[c.id], dragging: c.dragging }
      }
      return next
    })
    const positions = changes.filter(c => c.type === 'position')
    if (positions.length) setDoc(current => ({ ...current, topics: current.topics.map(t => {
      const change = positions.find(c => c.id === t.id)
      return change?.position ? { ...t, position: change.position } : t
    }) }), false)
    for (const change of changes) if (change.type === 'select' && change.selected) setSelectedId(change.id)
  }, [setDoc])

  const nodes: MapNode[] = doc.topics.map((t, order) => ({ id: t.id, type: 'topic', position: t.position, ...nodeMetadata[t.id], selected: !presenting && t.id === selectedId, data: { ...t, isRoot: !t.parent, isBranch: t.parent === root.id, dimmed: presenting && !!activeBranch && t.id !== root.id && branchOf(t, doc.topics) !== activeBranch, floating, order, replay } }))
  const edges: MapEdge[] = doc.topics.filter(t => t.parent).map(t => ({ id: `edge-${t.id}`, source: t.parent!, target: t.id, type: 'flow', sourceHandle: t.parent === root.id ? t.side : 'source', targetHandle: 'target', data: { color: t.color, flowing, dimmed: presenting && !!activeBranch && branchOf(t, doc.topics) !== activeBranch } }))

  function exportDocument() {
    const normalized = { ...doc, title: doc.title.trim() || '未命名导图', topics: doc.topics.map(t => ({ ...t, label: t.label.trim() || '新的想法' })) }
    const url = URL.createObjectURL(new Blob([JSON.stringify(normalized, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a'); a.href = url; a.download = `${doc.title.replace(/[\\/:*?"<>|]/g, '_')}.json`; a.click(); URL.revokeObjectURL(url)
    setMenuOpen(false); setToast('导图已导出，可随时重新导入')
  }
  async function importDocument(file?: File) {
    if (!file) return
    try {
      if (file.size > 2_000_000) throw new Error('文件过大，请选择小于 2 MB 的 JSON 文件')
      const imported = validateDocument(JSON.parse(await file.text()))
      setDoc(imported); setSelectedId(imported.topics.find(t => !t.parent)!.id); exitPresentation(); setToast('导图已导入')
    } catch (error) { setToast(error instanceof SyntaxError ? '文件不是有效的 JSON' : error instanceof Error ? error.message : '导入失败') }
    if (importRef.current) importRef.current.value = ''
    setMenuOpen(false)
  }
  const selectTopic = (id: string) => { setSelectedId(id); void flow.fitView({ nodes: [{ id }], duration: 500, maxZoom: 1, padding: 1 }) }
  const rearrange = () => { const heights = Object.fromEntries(flow.getNodes().map(n => [n.id, n.measured?.height ?? 76])); setDoc(current => ({ ...current, topics: layout(current.topics, heights) })); window.setTimeout(() => { void flow.fitView({ duration: 500, padding: 0.12 }) }, 100); setToast('已整理为双侧思维导图') }
  const changeColor = (color: string) => { if (!selected) return; const ids = descendants(selected.id, doc.topics); setDoc(current => ({ ...current, topics: current.topics.map(t => ids.has(t.id) ? { ...t, color } : t) })) }
  const newDocument = () => {
    setDoc({ version: 1, title: '我的思维导图', topics: [{ id: 'root', parent: null, label: '我的中心主题', note: '从一个想法开始', color: palette[0], side: 'right', position: { x: 0, y: -65 } }] })
    setSelectedId('root'); setMenuOpen(false); exitPresentation(); setToast('新画布已准备好，上一张导图可通过撤销恢复')
  }

  function outline(topic: Topic, depth = 0): React.ReactNode {
    return <div key={topic.id}><button className={`outline-item ${selectedId === topic.id ? 'active' : ''}`} style={{ paddingLeft: 13 + depth * 15 }} onClick={() => selectTopic(topic.id)}><span className="outline-dot" style={{ background: topic.color }} /><span>{topic.label}</span>{!topic.parent && <span className="outline-root">中心</span>}</button>{doc.topics.filter(t => t.parent === topic.id).map(t => outline(t, depth + 1))}</div>
  }

  return <div className={`app ${presenting ? 'presenting' : ''}`}>
    <header className="app-header">
      <a className="brand" href="#" onClick={e => e.preventDefault()}><span className="brand-mark"><GitBranch size={23} /></span><span>mindflow<span className="brand-dot">.</span></span></a>
      <span className="header-divider" /><div className="document-name"><input aria-label="导图名称" value={doc.title} maxLength={100} onChange={e => setDoc(d => ({ ...d, title: e.target.value }))} onBlur={() => { if (!doc.title.trim()) setDoc(d => ({ ...d, title: '未命名导图' })) }} /><button className="secondary-button" onClick={onOpenArchitecture}>系统架构</button><button className="secondary-button" onClick={() => { window.location.hash = 'flowchart' }}>流程图</button></div>
      <div className="header-actions"><span className={`save-status ${saveState.includes('失败') ? 'save-error' : ''}`}><Check size={13} />{saveState}</span><div className="history-actions"><button className="icon-button" aria-label="撤销" title="撤销 Ctrl+Z" disabled={!canUndo} onClick={undo}><Undo2 size={16} /></button><button className="icon-button" aria-label="重做" title="重做 Ctrl+Shift+Z" disabled={!canRedo} onClick={redo}><Redo2 size={16} /></button></div><div className="menu-wrap"><button className="icon-button" aria-label="文件菜单" onClick={() => setMenuOpen(!menuOpen)}><MoreHorizontal size={20} /></button>{menuOpen && <div className="file-menu"><button onClick={newDocument}><FilePlus2 size={16} />新建导图</button><button onClick={exportDocument}><ArrowDownToLine size={16} />导出 JSON</button><button onClick={() => importRef.current?.click()}><ArrowUpFromLine size={16} />导入 JSON</button></div>}</div><button className="primary-button" onClick={startPresentation}><Play size={14} fill="currentColor" />开始演示</button></div>
    </header>
    <div className="workspace">
      <aside className="sidebar">
        <div className="sidebar-heading"><div><span className="eyebrow">YOUR CREATIVE SPACE</span><h1>思维画布 <span>✧</span></h1></div><button className="icon-button" aria-label="使用帮助" onClick={() => setHelpOpen(true)}><CircleHelp size={17} /></button></div>
        <div className="sidebar-tabs"><button className={tab === 'outline' ? 'active' : ''} onClick={() => setTab('outline')}><Layers2 size={15} />大纲</button><button className={tab === 'style' ? 'active' : ''} onClick={() => setTab('style')}><Settings2 size={15} />样式与动画</button></div>
        <div className="sidebar-scroll">
          {tab === 'outline' ? <><div className="section-label">主题结构 <span>{doc.topics.length} 个节点</span></div><div className="outline-tree">{outline(root)}</div><button className="add-branch-button" onClick={addTopic}><Plus size={16} />添加子分支 <kbd>Tab</kbd></button></> : <div className="animation-settings"><div className="section-label">让思考有节奏</div><label className="toggle-row"><span><strong>连线流动</strong><small>光点沿着思路流动</small></span><input type="checkbox" checked={flowing} onChange={e => setFlowing(e.target.checked)} /><span className="toggle" /></label><label className="toggle-row"><span><strong>轻盈浮动</strong><small>给节点一点呼吸感</small></span><input type="checkbox" checked={floating} onChange={e => setFloating(e.target.checked)} /><span className="toggle" /></label><button className="secondary-button full-width" onClick={() => setReplay(r => r + 1)}><RotateCcw size={14} />重播入场动画</button><div className="section-label speed-label">演示节奏 <span>每步 {duration} 秒</span></div><input className="speed-range" aria-label="演示每步秒数" type="range" min="2" max="10" value={duration} onChange={e => setDuration(Number(e.target.value))} /><div className="range-labels"><span>轻快</span><span>从容</span></div><div className="style-tip"><Sparkles size={17} /><p>动画服务于表达。演示时，画布会自动聚焦当前分支，让每个想法都有自己的时刻。</p></div></div>}
          {selected && <section className="topic-editor"><div className="section-label">{selected.parent ? '编辑主题' : '中心主题'}<span><MousePointer2 size={12} /> 已选中</span></div><label className="field-label" htmlFor="topic-title">主题名称</label><input id="topic-title" maxLength={100} value={selected.label} onChange={e => updateTopic(selected.id, { label: e.target.value })} onBlur={() => { if (!selected.label.trim()) updateTopic(selected.id, { label: '新的想法' }) }} /><label className="field-label" htmlFor="topic-note">备注</label><textarea id="topic-note" placeholder="为这个想法写一点说明…" maxLength={500} value={selected.note} onChange={e => updateTopic(selected.id, { note: e.target.value })} /><div className="field-label">分支颜色</div><div className="color-palette">{palette.map(color => <button key={color} aria-label={`使用颜色 ${color}`} aria-pressed={selected.color === color} style={{ background: color }} onClick={() => changeColor(color)}>{selected.color === color && <Check size={12} />}</button>)}</div>{selected.parent && <button className="delete-topic" onClick={removeTopic}><Trash2 size={13} />删除此主题及子分支</button>}</section>}
        </div>
        <div className="sidebar-footer"><span className="small-leaf"><Leaf size={16} /></span><div><strong>给想法一点生长的空间</strong><p>从一个念头，到无限可能。</p></div></div>
      </aside>
      <main className="canvas-area">
        <ReactFlow<MapNode, MapEdge> nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} onNodesChange={onNodesChange} onNodeDragStart={checkpoint} onNodeClick={(_, node) => { if (!presenting) setSelectedId(node.id) }} onNodeDoubleClick={(_, node) => { if (!presenting) { setSelectedId(node.id); window.setTimeout(() => document.getElementById('topic-title')?.focus(), 0) } }} onPaneClick={() => { setMenuOpen(false); if (!presenting) setSelectedId(null) }} nodesDraggable={!presenting} nodesConnectable={false} edgesFocusable={false} elementsSelectable={!presenting} deleteKeyCode={null} fitView fitViewOptions={{ padding: 0.12, maxZoom: 1 }} minZoom={0.15} maxZoom={2} onMove={(_, viewport) => setZoom(Math.round(viewport.zoom * 100))} aria-label="思维导图画布">
          <Background variant={BackgroundVariant.Dots} color="#d6d4df" gap={22} size={1} />
        </ReactFlow>
        {!presenting && <><div className="canvas-caption"><span className="live-dot" />灵感正在发生<span className="caption-divider" />拖动、连接你的想法</div><div className="canvas-top-actions"><button onClick={rearrange}><GitBranch size={15} />整理布局</button><button aria-label="适应画布" title="适应画布" onClick={() => void flow.fitView({ duration: 500, padding: 0.18 })}><Maximize2 size={15} /></button></div><div className="canvas-watermark">A LITTLE SPACE. A BIG IDEA.</div><div className="canvas-hint"><MousePointer2 size={13} />拖动画布平移 <span>·</span> 滚轮缩放 <span>·</span> 双击节点编辑</div></>}
        {presenting && <><div className="presentation-title"><span className="eyebrow">PRESENTATION MODE</span><h2>{activeBranch ? branches[step - 1]?.label : doc.title}</h2><p>{activeBranch ? branches[step - 1]?.note : '让每一个想法，依次被看见。'}</p></div><button className="exit-presentation secondary-button" onClick={exitPresentation}><X size={15} />退出演示 <kbd>Esc</kbd></button></>}
        <div className="zoom-controls"><button aria-label="缩小" onClick={() => void flow.zoomOut({ duration: 200 })}><ZoomOut size={16} /></button><span>{zoom}%</span><button aria-label="放大" onClick={() => void flow.zoomIn({ duration: 200 })}><ZoomIn size={16} /></button><span className="zoom-divider" /><button aria-label="居中显示全部" onClick={() => void flow.fitView({ duration: 500, padding: 0.18 })}><Focus size={17} /></button></div>
        <div className="playback-bar"><div className="playback-label"><span className="playback-icon"><Sparkles size={16} /></span><div><strong>{presenting ? '思维导图演示' : '让你的思维导图动起来'}</strong><span>{presenting ? `${step + 1} / ${stepsCount} · ${activeBranch ? branches[step - 1]?.label : '全景概览'}` : '把思考过程，变成一场精彩的表达'}</span></div></div><div className="playback-center"><button className="icon-button" aria-label="上一个主题" disabled={!presenting || step === 0} onClick={() => setStep(s => Math.max(0, s - 1))}><ChevronLeft size={18} /></button><button className="play-button" aria-label={playing ? '暂停演示' : '播放演示'} onClick={togglePlayback}>{playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}</button><button className="icon-button" aria-label="下一个主题" disabled={!presenting || step === stepsCount - 1} onClick={() => setStep(s => Math.min(stepsCount - 1, s + 1))}><ChevronRight size={18} /></button><div className="step-dots">{Array.from({ length: stepsCount }, (_, i) => <button key={i} aria-label={`演示第 ${i + 1} 步`} className={i === step ? 'active' : ''} onClick={() => { setPresenting(true); setPlaying(false); setStep(i) }} />)}</div></div><button className={`animation-chip ${flowing ? 'enabled' : ''}`} onClick={() => setFlowing(!flowing)}><span />连线动画 {flowing ? '开启' : '关闭'}<ChevronDown size={12} /></button></div>
      </main>
    </div>
    <input ref={importRef} type="file" accept=".json,application/json" className="hidden-input" onChange={e => void importDocument(e.target.files?.[0])} />
    {toast && <div className="toast" role="status"><Check size={16} />{toast}</div>}
    {helpOpen && <div className="modal-overlay" onClick={() => setHelpOpen(false)}><section className="help-modal" role="dialog" aria-modal="true" aria-labelledby="help-title" onClick={e => e.stopPropagation()}><button className="icon-button modal-close" aria-label="关闭帮助" onClick={() => setHelpOpen(false)}><X size={19} /></button><span className="brand-mark"><GitBranch size={23} /></span><h2 id="help-title">从一个想法开始</h2><p>选择节点，在左侧编辑内容。拖动节点自由布局，或点击「整理布局」重新排列。</p><div className="shortcut"><span>添加所选主题的子分支</span><kbd>Tab</kbd></div><div className="shortcut"><span>删除所选主题及其子分支</span><kbd>Delete</kbd></div><div className="shortcut"><span>播放 / 暂停演示</span><kbd>Space</kbd></div><div className="shortcut"><span>演示上一 / 下一主题</span><kbd>← / →</kbd></div><div className="shortcut"><span>退出演示</span><kbd>Esc</kbd></div><p className="help-footnote">导图自动保存在当前浏览器。使用右上角文件菜单导出 JSON，可以备份或迁移到另一台设备。</p><button className="primary-button full-width" onClick={() => setHelpOpen(false)}>开始创作</button></section></div>}
  </div>
}

function currentView() {
  return window.location.hash === '#mindmap' ? 'mindmap' : window.location.hash === '#architecture' ? 'architecture' : 'flowchart'
}

export default function App() {
  const [view, setView] = useState(currentView)
  useEffect(() => { document.title = view === 'flowchart' ? '流程图 | Mindflow' : view === 'architecture' ? 'AI 视频创作 · MVP 系统架构 | Mindflow' : 'Mindflow · 让想法流动起来' }, [view])
  useEffect(() => {
    const onHashChange = () => setView(currentView())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])
  return <ReactFlowProvider key={view}>{view === 'flowchart' ? <FlowchartBoard /> : view === 'architecture' ? <ArchitectureBoard onOpenMindmap={() => { window.location.hash = 'mindmap' }} /> : <MindFlow onOpenArchitecture={() => { window.location.hash = 'architecture' }} />}</ReactFlowProvider>
}
