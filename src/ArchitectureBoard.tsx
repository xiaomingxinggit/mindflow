import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { Background, BackgroundVariant, BaseEdge, EdgeLabelRenderer, Handle, MarkerType, Position, ReactFlow, getSmoothStepPath, useNodesState, useReactFlow } from '@xyflow/react'
import type { EdgeProps, NodeProps } from '@xyflow/react'
import { ArrowDownToLine, Check, ChevronLeft, ChevronRight, Clapperboard, Code2, Database, FileJson, GitBranch, Layers2, Maximize2, MessageSquareText, Pause, Play, RotateCcw, Search, SlidersHorizontal, Sparkles, Video, X, ZoomIn, ZoomOut } from 'lucide-react'
import { architectureEdges, architectureNodes, architectureSteps, initialArchitectureNodes } from './architecture'
import type { ArchitectureNode, ArchitectureEdge } from './architecture'
import './ArchitectureBoard.css'

const icons = { prompt: MessageSquareText, search: Search, sliders: SlidersHorizontal, database: Database, video: Video, sparkles: Sparkles, file: FileJson, clapper: Clapperboard, code: Code2, layers: Layers2, play: Play }
const directions = [['left', Position.Left], ['right', Position.Right], ['top', Position.Top], ['bottom', Position.Bottom]] as const
const ArchitectureCard = memo(({ data, selected }: NodeProps<ArchitectureNode>) => {
  const Icon = icons[data.icon as keyof typeof icons] ?? Layers2
  if (data.icon === 'reuse') return <div className="arch-reuse-note"><span>{data.eyebrow}</span><h3>{data.title}</h3><p>{data.subtitle}</p><div>{data.chips.map(chip => <span key={chip}>{chip}</span>)}</div></div>
  if (data.group) return <div className="arch-layer" style={{ '--arch-color': data.color } as React.CSSProperties}><span>{data.eyebrow}</span><strong>{data.title}</strong><small>{data.subtitle}</small></div>
  return <div className={`arch-node-shell ${data.dimmed ? 'arch-dimmed' : data.muted ? 'arch-muted' : ''}`}>
    <div key={data.replay} className={`arch-node ${selected ? 'arch-selected' : ''} ${data.icon === 'prompt' ? 'arch-prompt-node' : ''} ${data.icon === 'play' ? 'arch-output-node' : ''}`} style={{ '--arch-color': data.color, '--arch-delay': `${(data.order ?? 0) * 35}ms` } as React.CSSProperties}>
      <div className="arch-node-eyebrow"><span className="arch-node-icon"><Icon size={16} /></span><span>{data.eyebrow}</span></div>
      <h3>{data.title}</h3><p>{data.subtitle}</p>
      {!!data.chips.length && <div className="arch-node-chips">{data.chips.map(chip => <span key={chip}>{chip}</span>)}</div>}
    </div>
    {directions.map(([name, direction]) => <Handle key={`in-${name}`} type="target" position={direction} id={`in-${name}`} />)}
    {directions.map(([name, direction]) => <Handle key={`out-${name}`} type="source" position={direction} id={`out-${name}`} />)}
    <Handle type="source" position={Position.Bottom} id="out-bottom-left" style={{ left: '30%' }} />
    <Handle type="source" position={Position.Bottom} id="out-bottom-right" style={{ left: '70%' }} />
    <Handle type="source" position={Position.Right} id="out-right-upper" style={{ top: '35%' }} />
  </div>
})

function ArchitectureConnector({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, data }: EdgeProps<ArchitectureEdge>) {
  let [path, labelX, labelY] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 12, offset: 20, centerY: id === 'director-control' ? sourceY + 20 : undefined })
  if (data?.kind === 'resource') {
    const bottom = Math.max(sourceY, targetY) + 50
    const railX = sourceX - 110, turnY = sourceY + 24
    path = `M ${sourceX} ${sourceY} L ${sourceX} ${turnY - 8} Q ${sourceX} ${turnY} ${sourceX - 8} ${turnY} L ${railX + 8} ${turnY} Q ${railX} ${turnY} ${railX} ${turnY + 8} L ${railX} ${bottom - 12} Q ${railX} ${bottom} ${railX + 12} ${bottom} L ${targetX - 12} ${bottom} Q ${targetX} ${bottom} ${targetX} ${bottom - 12} L ${targetX} ${targetY}`
    labelX = (railX + targetX) / 2; labelY = bottom
  }
  const dashed = data?.kind !== 'data'
  return <>
    <g className={`arch-connector ${data?.dimmed ? 'arch-dimmed' : data?.muted ? 'arch-muted' : ''}`}>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={{ stroke: data?.color, strokeWidth: data?.kind === 'data' ? 1.8 : 1.4, strokeDasharray: dashed ? '5 5' : undefined, strokeOpacity: .8 }} />
      {data?.flowing && !data.dimmed && !data.muted && <circle r={dashed ? 2.5 : 3} fill={data.color}><animateMotion dur={dashed ? '4s' : '2.8s'} repeatCount="indefinite" path={path} /></circle>}
    </g>
    {data?.label && <EdgeLabelRenderer><div className={`arch-edge-label nodrag nopan ${data.dimmed ? 'arch-dimmed' : data.muted ? 'arch-muted' : ''} ${data.branch ? `arch-label-${data.branch}` : ''}`} style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, color: data.color }}>{data.label}</div></EdgeLabelRenderer>}
  </>
}
const nodeTypes = { architecture: ArchitectureCard }
const edgeTypes = { architecture: ArchitectureConnector }

export default function ArchitectureBoard({ onOpenMindmap }: { onOpenMindmap: () => void }) {
  const [baseNodes, setNodes, onNodesChange] = useNodesState<ArchitectureNode>(initialArchitectureNodes())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [cacheMode, setCacheMode] = useState<'miss' | 'hit'>('miss')
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [presenting, setPresenting] = useState(false)
  const [flowing, setFlowing] = useState(true)
  const [replay, setReplay] = useState(0)
  const [zoom, setZoom] = useState(100)
  const [toast, setToast] = useState('')
  const canvasRef = useRef<HTMLElement>(null)
  const flow = useReactFlow<ArchitectureNode, ArchitectureEdge>()
  const currentStep = architectureSteps[step]
  const selected = architectureNodes.find(n => n.id === selectedId)
  const activeIds = new Set(currentStep.ids)
  const isInactiveBranch = (id: string) => cacheMode === 'miss' ? id === 'read-cache' : id === 'multimodal'
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const fitAll = useCallback(() => { void flow.fitView({ padding: .1, duration: 500, maxZoom: 1.1 }) }, [flow])
  const stopPresentation = useCallback(() => { setPresenting(false); setPlaying(false); setStep(0); fitAll() }, [fitAll])
  const playPause = useCallback(() => {
    if (!presenting) { setPresenting(true); setStep(0); setSelectedId(null); setPlaying(true) }
    else { if (!playing && step === architectureSteps.length - 1) setStep(0); setPlaying(p => !p) }
  }, [presenting, playing, step])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || presenting) return
    let timer: number
    const observer = new ResizeObserver(() => { window.clearTimeout(timer); timer = window.setTimeout(fitAll, 150) })
    observer.observe(canvas)
    return () => { observer.disconnect(); window.clearTimeout(timer) }
  }, [fitAll, presenting])

  useEffect(() => {
    if (!playing) return
    const timer = window.setTimeout(() => { if (step === architectureSteps.length - 1) setPlaying(false); else setStep(s => s + 1) }, 5500)
    return () => window.clearTimeout(timer)
  }, [playing, step])
  useEffect(() => {
    if (!presenting) return
    const ids = currentStep.ids.filter(id => cacheMode === 'miss' ? id !== 'read-cache' : id !== 'multimodal')
    const timer = window.setTimeout(() => { void flow.fitView({ nodes: ids.length ? ids.map(id => ({ id })) : undefined, duration: reducedMotion ? 0 : 700, padding: .2, maxZoom: 1.1 }) }, 50)
    return () => window.clearTimeout(timer)
  }, [presenting, step, cacheMode, currentStep.ids, flow, reducedMotion])
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches('input, textarea, select')) return
      if (e.key === 'Escape') { setSelectedId(null); stopPresentation() }
      if (e.code === 'Space' && (e.target as HTMLElement).tagName !== 'BUTTON') { e.preventDefault(); playPause() }
      if (presenting && e.key === 'ArrowRight') { e.preventDefault(); setPlaying(false); setStep(s => Math.min(architectureSteps.length - 1, s + 1)) }
      if (presenting && e.key === 'ArrowLeft') { e.preventDefault(); setPlaying(false); setStep(s => Math.max(0, s - 1)) }
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [presenting, stopPresentation, playPause])
  useEffect(() => { if (toast) { const timer = window.setTimeout(() => setToast(''), 2500); return () => window.clearTimeout(timer) } }, [toast])

  const nodes = baseNodes.map(n => ({ ...n, selected: n.id === selectedId, data: { ...n.data, replay, muted: isInactiveBranch(n.id), dimmed: !n.data.group && step > 0 && (!activeIds.has(n.id) || isInactiveBranch(n.id)) } }))
  const edges: ArchitectureEdge[] = architectureEdges.map(e => {
    const branchInactive = !!e.data?.branch && e.data.branch !== cacheMode
    const stageInactive = step > 0 && (!activeIds.has(e.source) || !activeIds.has(e.target))
    return { ...e, markerEnd: { type: MarkerType.ArrowClosed, color: e.data!.color, width: 13, height: 13 }, data: { ...e.data!, flowing: flowing && !reducedMotion, muted: branchInactive, dimmed: stageInactive || (step > 0 && branchInactive) } }
  })

  const resetLayout = () => { setNodes(initialArchitectureNodes()); setSelectedId(null); setReplay(r => r + 1); window.setTimeout(fitAll, 60); setToast('已恢复架构布局') }
  const exportDiagram = () => {
    const diagram = { version: 1, title: 'AI 视频创作 · MVP 系统架构', principle: architectureSteps[0].description, nodes: baseNodes.map(n => ({ id: n.id, position: n.position, ...n.data })), edges: architectureEdges.map(e => ({ source: e.source, target: e.target, sourceHandle: e.sourceHandle, targetHandle: e.targetHandle, ...e.data })) }
    const url = URL.createObjectURL(new Blob([JSON.stringify(diagram, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a'); a.href = url; a.download = 'ai-video-mvp-architecture.json'; a.click(); URL.revokeObjectURL(url); setToast('架构图 JSON 已导出')
  }
  const chooseStep = (index: number) => { setStep(index); setPlaying(false); setPresenting(index > 0); setSelectedId(null); if (!index) fitAll() }

  return <div className={`arch-page ${presenting ? 'arch-is-presenting' : ''}`}>
    <header className="app-header arch-header">
      <a className="brand" href="#architecture"><span className="brand-mark"><GitBranch size={23} /></span><span>mindflow<span className="brand-dot">.</span></span></a><span className="header-divider" />
      <nav className="arch-view-nav" aria-label="画布类型"><button onClick={() => { window.location.hash = 'flowchart' }}>流程图</button><span className="active">系统架构</span><button onClick={onOpenMindmap}>自由思维图</button></nav>
      <div className="header-actions"><span className="arch-mvp-badge">MVP ARCHITECTURE</span><button className="secondary-button arch-export-button" onClick={exportDiagram}><ArrowDownToLine size={14} />导出架构</button>{presenting ? <button className="secondary-button" onClick={stopPresentation}><X size={14} />退出演示</button> : <button className="primary-button" onClick={playPause}><Play size={14} fill="currentColor" />开始演示</button>}</div>
    </header>
    <section className="arch-masthead"><div><span className="eyebrow">UNDERSTAND ONCE. CREATE MANY.</span><h1>AI 视频创作<span>系统架构</span><span className="arch-version">v0.1</span></h1><p>素材只理解一次，元数据反复复用；LLM 负责导演决策，Remotion 负责确定性执行。</p></div><div className="arch-scenario" role="group" aria-label="缓存演示场景"><span>演示路径</span><div><button className={cacheMode === 'miss' ? 'active' : ''} aria-pressed={cacheMode === 'miss'} onClick={() => setCacheMode('miss')}><Sparkles size={13} />首次分析</button><button className={cacheMode === 'hit' ? 'active' : ''} aria-pressed={cacheMode === 'hit'} onClick={() => setCacheMode('hit')}><Database size={13} />复用缓存</button></div></div></section>
    <main className="arch-canvas" ref={canvasRef}>
      <ReactFlow<ArchitectureNode, ArchitectureEdge> nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} onNodesChange={onNodesChange} nodesConnectable={false} nodesDraggable={!presenting} deleteKeyCode={null} edgesFocusable={false} onNodeClick={(_, n) => { if (!n.data.group && !presenting) setSelectedId(n.id) }} onPaneClick={() => setSelectedId(null)} fitView fitViewOptions={{ padding: .1, maxZoom: 1.1 }} minZoom={.2} maxZoom={1.8} onMove={(_, v) => setZoom(Math.round(v.zoom * 100))} aria-label="AI 视频创作系统架构画布">
        <Background variant={BackgroundVariant.Dots} color="#d9d5e4" gap={24} size={1} />
      </ReactFlow>
      <div className="arch-legend"><span><i className="arch-legend-data" />数据流</span><span><i className="arch-legend-control" />Prompt 控制</span><span><i className="arch-legend-resource" />素材引用</span></div>
      <div className="arch-canvas-actions"><button className="secondary-button" onClick={resetLayout}><RotateCcw size={13} />恢复布局</button><button className="secondary-button" aria-label="适应架构画布" title="适应画布" onClick={fitAll}><Maximize2 size={14} /></button></div>
      {selected && <aside className="arch-detail" aria-label="节点说明"><div className="arch-detail-header"><span style={{ color: selected.data.color }}>{selected.data.eyebrow}</span><button className="icon-button" aria-label="关闭节点说明" onClick={() => setSelectedId(null)}><X size={17} /></button></div><h2>{selected.data.title}</h2><p>{selected.data.description}</p><ul>{selected.data.facts.map(fact => <li key={fact}>{fact}</li>)}</ul>{selected.data.example && <><div className="arch-example-label">结构示意</div><pre>{selected.data.example}</pre></>}<div className="arch-detail-footnote">点击画布空白处关闭 · 节点可拖动</div></aside>}
      <div className="arch-canvas-bottom"><span className="arch-canvas-note">点击节点查看职责与输入输出 <span>·</span> 拖动平移 / 滚轮缩放</span><div className="arch-zoom"><button aria-label="缩小架构" onClick={() => void flow.zoomOut({ duration: 200 })}><ZoomOut size={15} /></button><span>{zoom}%</span><button aria-label="放大架构" onClick={() => void flow.zoomIn({ duration: 200 })}><ZoomIn size={15} /></button></div></div>
    </main>
    <footer className="arch-playback"><div className="arch-playback-top"><div className="arch-narrative" aria-live="polite"><span className="arch-step-number">0{step + 1}</span><div><strong>{currentStep.title}</strong><p>{currentStep.description}</p></div></div><div className="arch-player-buttons"><button className="icon-button" aria-label="架构上一步" disabled={!step} onClick={() => chooseStep(step - 1)}><ChevronLeft size={19} /></button><button className="play-button" aria-label={playing ? '暂停架构演示' : '播放架构演示'} onClick={playPause}>{playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}</button><button className="icon-button" aria-label="架构下一步" disabled={step === architectureSteps.length - 1} onClick={() => chooseStep(step + 1)}><ChevronRight size={19} /></button><button className={`arch-animation-toggle ${flowing ? 'active' : ''}`} aria-pressed={flowing} onClick={() => setFlowing(v => !v)}><span />连线动画</button></div></div><nav className="arch-stage-nav" aria-label="架构演示步骤">{architectureSteps.map((s, i) => <button key={s.title} className={step === i ? 'active' : ''} aria-current={step === i ? 'step' : undefined} onClick={() => chooseStep(i)}><span>0{i + 1}</span>{s.title}</button>)}</nav></footer>
    {toast && <div className="toast" role="status"><Check size={15} />{toast}</div>}
  </div>
}
