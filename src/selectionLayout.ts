import { getCommonBounds } from '@excalidraw/excalidraw'
import type { Bounds } from '@excalidraw/excalidraw/element/bounds'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { AppState } from '@excalidraw/excalidraw/types'

type SelectionState = Pick<AppState, 'selectedElementIds' | 'editingGroupId'>
type LayoutFailure = { ok: false; reason: string }
export type LayoutUnit = { id: string; elementIds: string[]; bounds: Bounds }
export type LayoutSelection = { ok: true; units: LayoutUnit[]; connectorIds: string[] }
export type LayoutMove = { id: string; dx: number; dy: number }
export type CenteredColumnPlan = LayoutSelection & { moves: LayoutMove[]; changed: boolean }

const positionEpsilon = 1e-7
const supportedTypes = new Set(['rectangle', 'diamond', 'ellipse', 'image', 'text', 'freedraw', 'line', 'arrow'])
const failure = (reason: string): LayoutFailure => ({ ok: false, reason })
const isConnector = (element: ExcalidrawElement) => element.type === 'line' || element.type === 'arrow'
const midpoint = (low: number, high: number) => low / 2 + high / 2

/** Native group IDs run from deepest to outermost; editing a group exposes its immediate children. */
function selectedGroup(element: ExcalidrawElement, editingGroupId: string | null) {
  const editIndex = editingGroupId ? element.groupIds.indexOf(editingGroupId) : -1
  return element.groupIds[editIndex < 0 ? element.groupIds.length - 1 : editIndex - 1]
}

/** Resolve complete groups and container labels without counting selected bound connectors as cards. */
export function resolveLayoutSelection(elements: readonly ExcalidrawElement[], state: SelectionState): LayoutSelection | LayoutFailure {
  const live = elements.filter(element => !element.isDeleted)
  const byId = new Map(live.map(element => [element.id, element]))
  const selected = live.filter(element => state.selectedElementIds[element.id])
  const labels = new Map<string, ExcalidrawElement[]>()
  for (const element of live) {
    if (element.type === 'text' && element.containerId) {
      const list = labels.get(element.containerId) ?? []
      list.push(element)
      labels.set(element.containerId, list)
    }
  }
  const owner = (element: ExcalidrawElement) => element.type === 'text' && element.containerId
    ? byId.get(element.containerId) ?? element : element
  const units = new Map<string, Set<string>>()
  const connectors = new Set<string>()
  for (const selectedElement of selected) {
    const element = owner(selectedElement)
    const group = selectedGroup(element, state.editingGroupId)
    if (!group && isConnector(element)) {
      connectors.add(element.id)
      continue
    }
    const key = group ? `group:${group}` : `element:${element.id}`
    if (units.has(key)) continue
    const members = group ? live.filter(member => member.groupIds.includes(group)).map(owner) : [element]
    const ids = new Set(members.map(member => member.id))
    for (const member of members) for (const label of labels.get(member.id) ?? []) ids.add(label.id)
    units.set(key, ids)
  }

  // Bound labels always move with their container, even in imported groups with differing label group IDs.
  const merged: Set<string>[] = []
  for (const ids of units.values()) {
    for (let index = merged.length - 1; index >= 0; index--) {
      if ([...ids].some(id => merged[index].has(id))) {
        for (const id of merged[index]) ids.add(id)
        merged.splice(index, 1)
      }
    }
    merged.push(ids)
  }
  const participating = new Set(merged.flatMap(ids => [...ids]))
  for (const id of participating) connectors.delete(id)
  const touched = new Set([...participating, ...connectors, ...selected.map(element => element.id)])
  for (const id of touched) {
    const element = byId.get(id)!
    if (element.locked) return failure('选区包含锁定对象，请先解锁')
    if (element.type === 'frame' || element.type === 'magicframe' || element.frameId) return failure('暂不支持排列画框或画框内的对象')
    if (!supportedTypes.has(element.type)) return failure('选区包含暂不支持排列的对象')
  }
  for (const id of connectors) {
    const element = byId.get(id)!
    if ((element.type !== 'arrow' && element.type !== 'line') || ![element.startBinding?.elementId, element.endBinding?.elementId].some(boundId => boundId && participating.has(boundId))) {
      return failure('独立线条或箭头不能参与居中成列')
    }
  }

  const resolved: LayoutUnit[] = []
  for (const ids of merged) {
    const members = [...ids].map(id => byId.get(id)!)
    if (!members.some(member => !isConnector(member) && !(member.type === 'text' && member.containerId))) {
      return failure('独立线条或箭头不能参与居中成列')
    }
    const bounds = getCommonBounds(members, byId)
    if (!bounds.every(Number.isFinite) || bounds[2] < bounds[0] || bounds[3] < bounds[1]) return failure('对象尺寸无效，无法排列')
    const elementIds = [...ids].sort()
    resolved.push({ id: elementIds[0], elementIds, bounds })
  }
  if (resolved.length < 2) return failure('请选择至少两个可排列对象')
  return { ok: true, units: resolved, connectorIds: [...connectors].sort() }
}

/** Compute every translation from one unchanged snapshot; applying and routing remains one native action. */
export function planCenteredColumn(elements: readonly ExcalidrawElement[], state: SelectionState, gap: number): CenteredColumnPlan | LayoutFailure {
  if (!Number.isFinite(gap) || gap < 0) return failure('间距须为有限的非负数值')
  const selection = resolveLayoutSelection(elements, state)
  if (!selection.ok) return selection
  const units = [...selection.units].sort((a, b) =>
    midpoint(a.bounds[1], a.bounds[3]) - midpoint(b.bounds[1], b.bounds[3])
    || midpoint(a.bounds[0], a.bounds[2]) - midpoint(b.bounds[0], b.bounds[2])
    || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const left = Math.min(...units.map(unit => unit.bounds[0]))
  const top = Math.min(...units.map(unit => unit.bounds[1]))
  const right = Math.max(...units.map(unit => unit.bounds[2]))
  const bottom = Math.max(...units.map(unit => unit.bounds[3]))
  const centerX = midpoint(left, right)
  const centerY = midpoint(top, bottom)
  const height = units.reduce((total, unit) => total + unit.bounds[3] - unit.bounds[1], gap * (units.length - 1))
  let nextTop = centerY - height / 2
  if (![height, centerX, nextTop].every(Number.isFinite)) return failure('间距或排列结果过大，请减小数值')
  const byId = new Map(elements.map(element => [element.id, element]))
  const moves: LayoutMove[] = []
  for (const unit of units) {
    const dx = centerX - midpoint(unit.bounds[0], unit.bounds[2])
    const dy = nextTop - unit.bounds[1]
    if (!unit.bounds.every((value, index) => Number.isFinite(value + (index % 2 ? dy : dx)))) return failure('间距或排列结果过大，请减小数值')
    for (const id of unit.elementIds) {
      const element = byId.get(id)!
      if (![dx, dy, element.x + dx, element.y + dy].every(Number.isFinite)) return failure('间距或排列结果过大，请减小数值')
      if (Math.abs(dx) > positionEpsilon || Math.abs(dy) > positionEpsilon) moves.push({ id, dx, dy })
    }
    nextTop += unit.bounds[3] - unit.bounds[1] + gap
  }
  return { ...selection, units, moves, changed: moves.length > 0 }
}
