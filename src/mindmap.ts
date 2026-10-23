export const STORAGE_KEY = 'mindflow.document.v1'
export const palette = ['#8b72e8', '#4ba8a0', '#e7a65c', '#dc849c', '#648bd5', '#849d61']
export type Topic = { id: string; parent: string | null; label: string; note: string; color: string; side: 'left' | 'right'; position: { x: number; y: number } }
export type MindDocument = { version: 1; title: string; topics: Topic[] }

export function layout(topics: Topic[], measuredHeights: Record<string, number> = {}): Topic[] {
  const positions = new Map<string, { x: number; y: number }>()
  const root = topics.find(t => !t.parent)
  if (!root) return topics
  const estimateLines = (text: string, unitsPerLine: number) => Math.ceil([...text].reduce((sum, c) => sum + (c.codePointAt(0)! > 127 ? 1 : 0.6), 0) / unitsPerLine)
  const nodeHeight = (topic: Topic) => measuredHeights[topic.id] ?? (!topic.parent ? Math.max(130, 84 + estimateLines(topic.label, 9) * 33 + estimateLines(topic.note, 20) * 15) : topic.parent === root.id ? Math.max(76, 34 + estimateLines(topic.label, 10) * 23 + (topic.note ? 5 + estimateLines(topic.note, 15) * 17 : 0)) : Math.max(44, 24 + estimateLines(topic.label, 12) * 20))
  positions.set(root.id, { x: 0, y: -nodeHeight(root) / 2 })
  const children = (id: string) => topics.filter(t => t.parent === id)
  const heights = new Map<string, number>()
  const weight = (id: string): number => {
    const cached = heights.get(id)
    if (cached !== undefined) return cached
    const height = Math.max(nodeHeight(topics.find(t => t.id === id)!) + 36, children(id).reduce((sum, t) => sum + weight(t.id), 0), 90)
    heights.set(id, height)
    return height
  }
  const place = (topic: Topic, depth: number, top: number) => {
    const height = weight(topic.id)
    positions.set(topic.id, { x: topic.side === 'left' ? -depth * 265 - 25 : depth * 265 + 55, y: top + height / 2 - nodeHeight(topic) / 2 })
    let next = top + (height - children(topic.id).reduce((sum, t) => sum + weight(t.id), 0)) / 2
    children(topic.id).forEach(child => { place(child, depth + 1, next); next += weight(child.id) })
  }
  for (const side of ['left', 'right'] as const) {
    const branches = children(root.id).filter(t => t.side === side)
    let top = -branches.reduce((sum, t) => sum + weight(t.id), 0) / 2
    branches.forEach(t => { place(t, 1, top); top += weight(t.id) })
  }
  return topics.map(t => ({ ...t, position: positions.get(t.id) ?? t.position }))
}

export function branchOf(topic: Topic, topics: Topic[]): string {
  let current = topic
  while (current.parent) {
    const parent = topics.find(t => t.id === current.parent)
    if (!parent || !parent.parent) break
    current = parent
  }
  return current.id
}

export function descendants(id: string, topics: Topic[]): Set<string> {
  const result = new Set([id])
  let changed = true
  while (changed) {
    changed = false
    for (const t of topics) if (t.parent && result.has(t.parent) && !result.has(t.id)) { result.add(t.id); changed = true }
  }
  return result
}

export function validateDocument(value: unknown): MindDocument {
  if (!value || typeof value !== 'object') throw new Error('文件不是有效的导图')
  const doc = value as MindDocument
  if (doc.version !== 1 || typeof doc.title !== 'string' || !doc.title.trim() || doc.title.length > 100 || !Array.isArray(doc.topics) || !doc.topics.length || doc.topics.length > 500) throw new Error('导图格式不正确，最多支持 500 个节点')
  const ids = new Set<string>()
  for (const t of doc.topics) {
    if (!t || typeof t.id !== 'string' || !t.id || ids.has(t.id) || (t.parent !== null && typeof t.parent !== 'string') || typeof t.label !== 'string' || !t.label.trim() || t.label.length > 100 || typeof t.note !== 'string' || t.note.length > 500 || !/^#[0-9a-f]{6}$/i.test(t.color) || !['left', 'right'].includes(t.side) || !Number.isFinite(t.position?.x) || !Number.isFinite(t.position?.y)) throw new Error('节点数据不完整或存在重复编号')
    ids.add(t.id)
  }
  if (doc.topics.filter(t => t.parent === null).length !== 1) throw new Error('导图必须有一个中心主题')
  for (const topic of doc.topics) {
    let current = topic
    const visited = new Set<string>()
    while (current.parent !== null) {
      if (visited.has(current.id)) throw new Error('导图中存在循环关系')
      visited.add(current.id)
      const parent = doc.topics.find(t => t.id === current.parent)
      if (!parent) throw new Error('导图中存在缺失的父节点')
      if (parent.parent && parent.side !== current.side) throw new Error('同一个分支的节点方向应一致')
      current = parent
    }
  }
  return { version: 1, title: doc.title, topics: doc.topics.map(t => ({ id: t.id, parent: t.parent, label: t.label, note: t.note, color: t.color, side: t.side, position: { ...t.position } })) }
}

const seeds = [
  ['inspire', 'root', '捕捉灵感', '每一个好想法，都值得被看见', 0, 'left'],
  ['spark', 'inspire', '记录一闪而过的想法', '', 0, 'left'],
  ['connect', 'inspire', '建立想法之间的连接', '', 0, 'left'],
  ['structure', 'root', '梳理思路', '把复杂的事情，想得更清楚', 1, 'left'],
  ['break', 'structure', '拆解核心问题', '', 1, 'left'],
  ['organize', 'structure', '找到思考的层次', '', 1, 'left'],
  ['story', 'root', '讲述故事', '让观众跟上你的思考节奏', 2, 'right'],
  ['focus', 'story', '一次聚焦一个主题', '', 2, 'right'],
  ['rhythm', 'story', '用动画引导注意力', '', 2, 'right'],
  ['create', 'root', '自由创作', '你的画布，由你定义', 3, 'right'],
  ['style', 'create', '用颜色表达个性', '', 3, 'right'],
  ['share', 'create', '分享你的思维世界', '', 3, 'right'],
] as const

export function createExample(): MindDocument {
  return { version: 1, title: '让想法，流动起来', topics: layout([
    { id: 'root', parent: null, label: '让想法，流动起来', note: '一张有生命力的思维导图', color: palette[0], side: 'right', position: { x: 0, y: 0 } },
    ...seeds.map(([id, parent, label, note, color, side]) => ({ id, parent, label, note, color: palette[color], side, position: { x: 0, y: 0 } })),
  ]) }
}

export function loadDocument(): MindDocument {
  try { const saved = localStorage.getItem(STORAGE_KEY); return saved ? validateDocument(JSON.parse(saved)) : createExample() }
  catch { return createExample() }
}
