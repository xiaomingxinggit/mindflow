import type { Edge, Node } from '@xyflow/react'

export type NodeKind = 'start' | 'process' | 'decision' | 'end'
export type FlowNode = Node<{ label: string; kind: NodeKind; color?: string }, 'flowchart'>
export type FlowDocument = { title: string; nodes: FlowNode[]; edges: Edge[] }

export const STORAGE_KEY = 'mindflow-flowchart-v1'

const defaultTitle = '我的流程图'
const defaultLabels: Record<NodeKind, string> = { start: '开始', process: '步骤', decision: '判断', end: '结束' }
const nodeKinds = new Set<unknown>(Object.keys(defaultLabels))
const handleIds = new Set<unknown>(['top', 'right', 'bottom', 'left'])
const edgeTypes = new Set<unknown>(['smoothstep', 'default', 'straight'])
const colorPattern = /^#[\da-f]{6}$/i

const initialDocument: FlowDocument = {
  title: defaultTitle,
  nodes: [
    { id: 'start', type: 'flowchart', position: { x: 300, y: 0 }, data: { kind: 'start', label: '开始' } },
    { id: 'step', type: 'flowchart', position: { x: 300, y: 125 }, data: { kind: 'process', label: '处理任务' } },
    { id: 'decision', type: 'flowchart', position: { x: 300, y: 270 }, data: { kind: 'decision', label: '是否完成？' } },
    { id: 'end', type: 'flowchart', position: { x: 300, y: 465 }, data: { kind: 'end', label: '结束' } },
  ],
  edges: [
    { id: 'start-step', source: 'start', target: 'step', sourceHandle: 'bottom', targetHandle: 'top' },
    { id: 'step-decision', source: 'step', target: 'decision', sourceHandle: 'bottom', targetHandle: 'top' },
    { id: 'decision-end', source: 'decision', target: 'end', sourceHandle: 'bottom', targetHandle: 'top', label: '是' },
    { id: 'decision-step', source: 'decision', target: 'step', sourceHandle: 'right', targetHandle: 'right', label: '否' },
  ],
}

export function serializeFlowDocument(doc: FlowDocument): FlowDocument {
  return {
    title: doc.title.trim() || defaultTitle,
    nodes: doc.nodes.map(({ id, position, data }) => ({
      id,
      type: 'flowchart',
      position: { x: position.x, y: position.y },
      data: {
        kind: data.kind,
        label: data.label.trim() || defaultLabels[data.kind],
        ...(data.color === undefined ? {} : { color: data.color }),
      },
    })),
    edges: doc.edges.map(({ id, source, target, sourceHandle, targetHandle, label, type }) => ({
      id,
      source,
      target,
      ...(sourceHandle === undefined ? {} : { sourceHandle }),
      ...(targetHandle === undefined ? {} : { targetHandle }),
      ...(label === undefined ? {} : { label }),
      type: edgeTypes.has(type) ? type : 'smoothstep',
    })),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasValidId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function parseFlowDocument(input: unknown): FlowDocument {
  if (!isRecord(input) || !Array.isArray(input.nodes) || !Array.isArray(input.edges)) {
    throw new Error('文件需要包含流程图节点和连线。')
  }
  if (input.title !== undefined && typeof input.title !== 'string') {
    throw new Error('流程图名称格式不正确。')
  }

  const nodeIds = new Set<string>()
  const nodes: FlowNode[] = input.nodes.map((node: unknown) => {
    if (!isRecord(node) || !hasValidId(node.id) || nodeIds.has(node.id) || node.type !== 'flowchart'
      || !isRecord(node.position) || typeof node.position.x !== 'number' || !Number.isFinite(node.position.x)
      || typeof node.position.y !== 'number' || !Number.isFinite(node.position.y)
      || !isRecord(node.data) || !nodeKinds.has(node.data.kind) || typeof node.data.label !== 'string'
      || (node.data.color !== undefined && (typeof node.data.color !== 'string' || !colorPattern.test(node.data.color)))) {
      throw new Error('节点数据不正确，请检查节点类型、文字、颜色和位置。')
    }
    nodeIds.add(node.id)
    return {
      id: node.id,
      type: 'flowchart',
      position: { x: node.position.x, y: node.position.y },
      data: {
        kind: node.data.kind as NodeKind,
        label: node.data.label,
        ...(typeof node.data.color === 'string' ? { color: node.data.color } : {}),
      },
    }
  })

  const edgeIds = new Set<string>()
  const edges: Edge[] = input.edges.map((edge: unknown) => {
    if (!isRecord(edge) || !hasValidId(edge.id) || edgeIds.has(edge.id)
      || typeof edge.source !== 'string' || !nodeIds.has(edge.source)
      || typeof edge.target !== 'string' || !nodeIds.has(edge.target)
      || (edge.sourceHandle != null && !handleIds.has(edge.sourceHandle))
      || (edge.targetHandle != null && !handleIds.has(edge.targetHandle))
      || (edge.label !== undefined && typeof edge.label !== 'string')
      || (edge.type !== undefined && !edgeTypes.has(edge.type))) {
      throw new Error('连线数据不正确，请检查连线端点、文字和线型。')
    }
    edgeIds.add(edge.id)
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      ...(edge.sourceHandle === undefined ? {} : { sourceHandle: edge.sourceHandle as string | null }),
      ...(edge.targetHandle === undefined ? {} : { targetHandle: edge.targetHandle as string | null }),
      ...(typeof edge.label === 'string' ? { label: edge.label } : {}),
      type: typeof edge.type === 'string' ? edge.type : 'smoothstep',
    }
  })

  return serializeFlowDocument({ title: typeof input.title === 'string' ? input.title : defaultTitle, nodes, edges })
}

export function loadFlowDocument(): FlowDocument {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved !== null) {
      try {
        return parseFlowDocument(JSON.parse(saved))
      } catch {
        try {
          localStorage.setItem(`${STORAGE_KEY}-recovery`, saved)
        } catch {
          // A full or unavailable store must not prevent opening the editor.
        }
      }
    }
  } catch {
    // Browser storage can be unavailable even when the editor itself is usable.
  }
  return serializeFlowDocument(initialDocument)
}
