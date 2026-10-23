export type NodeKind = 'start' | 'process' | 'decision' | 'end'
export type FlowNode = {
  id: string
  type: 'flowchart'
  position: { x: number; y: number }
  data: { label: string; kind: NodeKind; color?: string }
}
export type HandleId = 'top' | 'right' | 'bottom' | 'left'
export type FlowEdge = {
  id: string
  source: string
  target: string
  sourceHandle?: HandleId | null
  targetHandle?: HandleId | null
  label?: string
  type?: 'smoothstep' | 'default' | 'straight'
}
export type FlowDocument = { title: string; nodes: FlowNode[]; edges: FlowEdge[] }

export const STORAGE_KEY = 'mindflow-flowchart-v1'

const defaultTitle = '未命名画布'
const defaultLabels: Record<NodeKind, string> = { start: '起点', process: '新的想法', decision: '待思考的问题', end: '终点' }
const nodeKinds = new Set<unknown>(Object.keys(defaultLabels))
const handleIds = new Set<unknown>(['top', 'right', 'bottom', 'left'])
const edgeTypes = new Set<unknown>(['smoothstep', 'default', 'straight'])
const colorPattern = /^#[\da-f]{6}$/i

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasValidId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function parseFlowDocument(input: unknown): FlowDocument {
  if (!isRecord(input) || !Array.isArray(input.nodes) || !Array.isArray(input.edges)) {
    throw new Error('文件需要包含画布节点和连线。')
  }
  if (input.title !== undefined && typeof input.title !== 'string') {
    throw new Error('画布名称格式不正确。')
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
        label: node.data.label.trim() ? node.data.label : defaultLabels[node.data.kind as NodeKind],
        ...(typeof node.data.color === 'string' ? { color: node.data.color } : {}),
      },
    }
  })

  const edgeIds = new Set<string>()
  const edges: FlowEdge[] = input.edges.map((edge: unknown) => {
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
      ...(edge.sourceHandle === undefined ? {} : { sourceHandle: edge.sourceHandle as HandleId | null }),
      ...(edge.targetHandle === undefined ? {} : { targetHandle: edge.targetHandle as HandleId | null }),
      ...(typeof edge.label === 'string' ? { label: edge.label } : {}),
      type: typeof edge.type === 'string' ? edge.type as FlowEdge['type'] : 'smoothstep',
    }
  })

  return {
    title: typeof input.title === 'string' ? input.title.trim() || defaultTitle : defaultTitle,
    nodes,
    edges,
  }
}
