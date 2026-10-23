import { convertToExcalidrawElements } from '@excalidraw/excalidraw'
import type { ImportedDataState } from '@excalidraw/excalidraw/data/types'
import type { ExcalidrawElementSkeleton } from '@excalidraw/excalidraw/data/transform'
import type { ExcalidrawLinearElement } from '@excalidraw/excalidraw/element/types'
import { parseFlowDocument, STORAGE_KEY } from './flowchart'
import type { FlowEdge, FlowNode, HandleId, NodeKind } from './flowchart'

const palette = [
  { stroke: '#8b78cf', fill: '#f4f0ff', text: '#5e4b98' },
  { stroke: '#6b9bd1', fill: '#eff6ff', text: '#416a9a' },
  { stroke: '#79ad93', fill: '#f0f8f3', text: '#456c56' },
  { stroke: '#cfaf65', fill: '#fffaeb', text: '#88703c' },
  { stroke: '#a3a5b5', fill: '#f5f5f8', text: '#626575' },
]
const defaultPalette: Record<NodeKind, number> = { start: 2, process: 0, decision: 3, end: 4 }

type NodeBounds = FlowNode & { width: number; height: number }
type Point = ExcalidrawLinearElement['points'][number]

function nodeBounds(node: FlowNode): NodeBounds {
  const diamond = node.data.kind === 'decision'
  const contentWidth = diamond ? 120 : 180
  const lineCount = node.data.label.split('\n').reduce((count, line) => {
    const width = Array.from(line).reduce((sum, char) => sum + (char.charCodeAt(0) > 127 ? 14 : 7), 0)
    return count + Math.max(1, Math.ceil(width / contentWidth))
  }, 0)
  return {
    ...node,
    width: diamond ? 260 : 220,
    height: Math.max(diamond ? 140 : 76, lineCount * 23 + (diamond ? 86 : 40)),
  }
}

function nodeSkeleton(node: NodeBounds): ExcalidrawElementSkeleton {
  const color = node.data.color
    ? palette.find(item => item.stroke.toLowerCase() === node.data.color?.toLowerCase())
      ?? { stroke: node.data.color, fill: `${node.data.color}15`, text: node.data.color }
    : palette[defaultPalette[node.data.kind]]
  return {
    id: node.id,
    type: node.data.kind === 'decision' ? 'diamond' : 'rectangle',
    x: node.position.x,
    y: node.position.y,
    width: node.width,
    height: node.height,
    strokeColor: color.stroke,
    backgroundColor: color.fill,
    fillStyle: 'solid',
    strokeWidth: 1,
    roughness: 0,
    roundness: node.data.kind === 'start' || node.data.kind === 'end' ? { type: 3, value: 38 } : null,
    label: {
      text: node.data.label,
      fontSize: 14,
      fontFamily: 2,
      textAlign: 'center',
      verticalAlign: 'middle',
      strokeColor: color.text,
    },
  }
}

function facingHandle(from: NodeBounds, to: NodeBounds): HandleId {
  const dx = to.position.x + to.width / 2 - from.position.x - from.width / 2
  const dy = to.position.y + to.height / 2 - from.position.y - from.height / 2
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy >= 0 ? 'bottom' : 'top')
}

function endpoint(node: NodeBounds, handle: HandleId): { x: number; y: number } {
  const { x, y } = node.position
  if (handle === 'left') return { x, y: y + node.height / 2 }
  if (handle === 'right') return { x: x + node.width, y: y + node.height / 2 }
  if (handle === 'top') return { x: x + node.width / 2, y }
  return { x: x + node.width / 2, y: y + node.height }
}

function arrowSkeleton(edge: FlowEdge, source: NodeBounds, target: NodeBounds, id: string): ExcalidrawElementSkeleton {
  const sourceHandle = edge.sourceHandle ?? facingHandle(source, target)
  const targetHandle = edge.targetHandle ?? facingHandle(target, source)
  const start = endpoint(source, sourceHandle)
  const end = endpoint(target, targetHandle)
  const dx = end.x - start.x
  const dy = end.y - start.y
  const points: Point[] = [[0, 0] as Point]
  if (edge.type === 'smoothstep' && dx !== 0 && dy !== 0) {
    const sourceHorizontal = sourceHandle === 'left' || sourceHandle === 'right'
    const targetHorizontal = targetHandle === 'left' || targetHandle === 'right'
    if (sourceHorizontal && targetHorizontal) points.push([dx / 2, 0] as Point, [dx / 2, dy] as Point)
    else if (!sourceHorizontal && !targetHorizontal) points.push([0, dy / 2] as Point, [dx, dy / 2] as Point)
    else points.push((sourceHorizontal ? [dx, 0] : [0, dy]) as Point)
  }
  points.push([dx, dy] as Point)
  return {
    id,
    type: 'arrow',
    x: start.x,
    y: start.y,
    points,
    start: { id: source.id },
    end: { id: target.id },
    strokeColor: '#9292a3',
    strokeWidth: 1,
    roughness: 0,
    roundness: edge.type === 'straight' ? null : { type: 2 },
    ...(edge.label ? { label: { text: edge.label, fontSize: 14, fontFamily: 2 } } : {}),
  }
}

/** Convert only the former flowchart format; the old storage value is never rewritten. */
export function migrateLegacyDocument(input: unknown): ImportedDataState {
  const document = parseFlowDocument(input)
  const nodes = document.nodes.map(nodeBounds)
  const nodeMap = new Map(nodes.map(node => [node.id, node]))
  const ids = new Set(nodes.map(node => node.id))
  const skeletons = nodes.map(nodeSkeleton)
  for (const edge of document.edges) {
    let id = `legacy-edge:${edge.id}`
    while (ids.has(id)) id += '-'
    ids.add(id)
    skeletons.push(arrowSkeleton(edge, nodeMap.get(edge.source)!, nodeMap.get(edge.target)!, id))
  }
  return {
    elements: convertToExcalidrawElements(skeletons, { regenerateIds: false }),
    appState: { name: document.title },
    files: {},
    scrollToContent: true,
  }
}

export function readLegacyDocument(): ImportedDataState | null {
  const saved = localStorage.getItem(STORAGE_KEY)
  return saved === null ? null : migrateLegacyDocument(JSON.parse(saved))
}
