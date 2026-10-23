import type { Edge, Node } from '@xyflow/react'

export type ArchitectureData = {
  title: string; subtitle: string; eyebrow: string; color: string; icon: string
  chips: string[]; description: string; facts: string[]; example?: string
  group?: boolean; dimmed?: boolean; muted?: boolean; order?: number; replay?: number
}
export type ArchitectureNode = Node<ArchitectureData, 'architecture'>
export type ArchitectureEdge = Edge<{ kind: 'data' | 'control' | 'resource'; color: string; label?: string; branch?: 'miss' | 'hit'; dimmed?: boolean; muted?: boolean; flowing?: boolean }, 'architecture'>

const violet = '#8b72e8', teal = '#4b9d96', blue = '#678bd0', orange = '#dca15c'
const node = (id: string, x: number, y: number, width: number, data: ArchitectureData): ArchitectureNode => ({ id, type: 'architecture', position: { x, y }, style: { width }, data, ariaLabel: data.title })
export const architectureNodes: ArchitectureNode[] = [
  { ...node('reuse-note', 0, 575, 420, { title: '一次理解，多个版本', subtitle: '同一份 Metadata + 不同导演 Prompt', eyebrow: 'THE SCALING ADVANTAGE', color: '#8b72e8', icon: 'reuse', chips: ['A · 强钩子', 'B · 产品卖点', 'C · 搞笑', 'D · 30 秒'], description: '', facts: [], group: true }), style: { width: 420, height: 140 }, draggable: false, selectable: false, focusable: false, zIndex: -1 },
  { ...node('understanding-layer', -30, 260, 1045, { title: '素材理解层', subtitle: 'UNDERSTAND ONCE · CACHE & REUSE', eyebrow: '01', color: teal, icon: 'layers', chips: [], description: '', facts: [], group: true }), style: { width: 1045, height: 290 }, draggable: false, selectable: false, focusable: false, zIndex: -1 },
  { ...node('director-layer', 1030, 260, 260, { title: '导演决策层', subtitle: 'DECIDE WITH METADATA', eyebrow: '02', color: blue, icon: 'layers', chips: [], description: '', facts: [], group: true }), style: { width: 260, height: 290 }, draggable: false, selectable: false, focusable: false, zIndex: -1 },
  { ...node('render-layer', 460, 565, 830, { title: '本地执行层', subtitle: 'DETERMINISTIC RENDER', eyebrow: '03', color: orange, icon: 'layers', chips: [], description: '', facts: [], group: true }), style: { width: 830, height: 205 }, draggable: false, selectable: false, focusable: false, zIndex: -1 },
  node('prompt', 510, -25, 250, { title: '用户 Prompt', subtitle: '一个意图，两种策略', eyebrow: 'INTENT', color: violet, icon: 'prompt', chips: ['理解侧重点', '剪辑目标'], description: '把用户意图拆成素材分析策略和导演策略。前者决定看什么，后者决定怎么剪。', facts: ['素材分析 Prompt 控制生成元数据的侧重点。', '导演 Prompt 控制时长、Hook、节奏、风格和 CTA。', '分析策略改变且缓存信息不足时，可显式重新分析素材。'] }),
  node('analysis-prompt', 270, 135, 240, { title: '素材分析 Prompt', subtitle: '商品 · 动作 · 情绪 · Hook 片段', eyebrow: 'ANALYSIS STRATEGY', color: violet, icon: 'search', chips: [], description: '给多模态 AI 指定素材理解的重点，生成可复用的事实和时间片段。', facts: ['关注商品展示、人物动作、情绪表达和潜在 Hook。', '只在缓存未命中或主动重新分析时应用。', '元数据应记录素材标识、分析策略和版本，便于判断缓存是否适用。'] }),
  node('director-prompt', 890, 135, 260, { title: '导演 Prompt', subtitle: '20 秒 · 强 Hook · 快节奏 · CTA', eyebrow: 'DIRECTOR STRATEGY', color: violet, icon: 'sliders', chips: [], description: '控制输出视频的叙事和剪辑目标；同一份元数据可以配合多个导演 Prompt 生成不同版本。', facts: ['例如每 2–3 秒切镜头、强调产品卖点、结尾 CTA。', '强钩子版、产品卖点版、搞笑版和 30 秒版共享素材元数据。', '导演策略改变不必重新上传、重新理解同一批素材。'] }),
  node('assets', 0, 310, 185, { title: '素材', subtitle: '视频 / 图片 / 音频', eyebrow: 'SOURCE ASSETS', color: teal, icon: 'video', chips: ['原始文件'], description: '系统的原始素材输入。使用素材标识查询元数据缓存，原文件保留供最终渲染读取。', facts: ['第一版先检查每份素材是否已有可用元数据。', '多模态 AI 分析实际素材，不能只对空白元数据再分析。', 'Remotion 通过素材引用读取原文件，完成剪辑和渲染。'] }),
  node('cache-check', 230, 310, 210, { title: 'Metadata 存在？', subtitle: '查询素材元数据缓存', eyebrow: 'METADATA CACHE', color: teal, icon: 'database', chips: ['NO → 分析', 'YES → 读取'], description: '按素材标识查找可用的 Asset Metadata，决定走首次分析还是直接复用的路径。', facts: ['不存在：多模态 AI 分析原始素材，生成并存储元数据。', '已存在：直接读取缓存，不再做一次视频理解。', '两条路径输出同一种 Asset Metadata，统一进入导演层。'] }),
  node('multimodal', 500, 285, 235, { title: '多模态 AI', subtitle: '分析原始素材，生成元数据', eyebrow: 'CACHE MISS · NO', color: teal, icon: 'sparkles', chips: ['只负责理解素材'], description: '视频理解层只负责产生 Asset Metadata。首次分析完成后持久化，后续导演任务直接复用。', facts: ['识别镜头、时间片段、商品、动作和情绪。', '受素材分析 Prompt 控制，提取相关事实。', '不负责安排最终剪辑顺序或决定输出叙事。'] }),
  node('read-cache', 500, 435, 235, { title: '读取已有元数据', subtitle: '命中缓存，跳过视频理解', eyebrow: 'CACHE HIT · YES', color: teal, icon: 'database', chips: [], description: '缓存命中时直接读取现有 Asset Metadata，跳过多模态理解环节。', facts: ['省去重复上传和重复分析的成本。', '读取后的元数据与新生成的元数据使用统一格式。', '分析目标有变化时，先判断缓存是否包含需要的信息。'] }),
  node('metadata', 790, 310, 210, { title: 'Asset Metadata', subtitle: '统一素材描述 · 持久化复用', eyebrow: 'REUSABLE CONTRACT', color: teal, icon: 'file', chips: ['理解与决策的边界'], description: '视频理解层和导演层之间的结构化契约。事实只提取一次，导演可反复读取。', facts: ['包括素材引用、时间范围、镜头描述、标签等信息。', '新生成的元数据写入缓存；已有元数据直接读取。', '不同导演 Prompt 可以复用同一份素材描述。'], example: '{\n  "assetId": "clip_01",\n  "segments": [{\n    "start": 0, "end": 3,\n    "description": "商品特写",\n    "tags": ["product", "hook"]\n  }]\n}' }),
  node('director', 1055, 310, 210, { title: 'LLM Director', subtitle: '读取元数据，做导演决策', eyebrow: 'CREATIVE DECISION', color: blue, icon: 'clapper', chips: ['MVP 不重新看原视频'], description: '导演层根据 Asset Metadata 和导演 Prompt 决定片段选择、顺序、时长、字幕与节奏，输出机器可执行的剪辑结构。', facts: ['输入是素材元数据和导演策略，不重复理解原始视频。', '只有元数据不足、精确镜头判断、特殊目标分析或最终视觉确认时，才考虑回看素材。', '第一版可以完全不加入重新看视频的路径。'] }),
  node('editscript', 1055, 610, 210, { title: 'EditScript JSON', subtitle: '机器可执行的导演脚本', eyebrow: 'EDIT DECISION LIST', color: blue, icon: 'code', chips: [], description: '结构化的导演脚本 / Edit Decision List，用于表达可执行的剪辑决策。', facts: ['描述素材引用、入出点、时间线、字幕及转场。', '使用明确的 schema，与渲染端约定单位和必填字段。', 'Remotion 执行前校验脚本与素材引用。'], example: '{\n  "fps": 30,\n  "clips": [{\n    "assetId": "clip_01",\n    "sourceIn": 0, "sourceOut": 3,\n    "timelineStart": 0\n  }]\n}\n// 字段仅为结构示意' }),
  node('remotion', 790, 610, 210, { title: 'Remotion', subtitle: '按脚本在本地确定性渲染', eyebrow: 'LOCAL EXECUTION', color: orange, icon: 'layers', chips: [], description: '依据 EditScript JSON 组装时间线，读取引用的本地素材并确定性执行，输出最终视频。', facts: ['负责片段裁剪、编排、字幕、转场和画面合成。', '导演决策在上游完成，渲染端按结构化脚本执行。', '相同脚本、素材及渲染环境产生可复现的执行结果。'] }),
  node('mp4', 500, 610, 235, { title: 'MP4', subtitle: '可交付、可播放的成片', eyebrow: 'FINAL OUTPUT', color: orange, icon: 'play', chips: [], description: '完整执行链路的交付结果。修改导演 Prompt，就可以使用同一批元数据生成另一种剪辑版本。', facts: ['强钩子版本、产品卖点版本、搞笑版本或 30 秒版本。', '素材元数据重复复用，导演决策与渲染按版本执行。', '批量化的核心：素材只理解一次，元数据反复复用。'] }),
]

const edge = (id: string, source: string, target: string, sourceHandle: string, targetHandle: string, data: NonNullable<ArchitectureEdge['data']>): ArchitectureEdge => ({ id, source, target, sourceHandle, targetHandle, type: 'architecture', data, selectable: false, focusable: false })
export const architectureEdges: ArchitectureEdge[] = [
  edge('prompt-analysis', 'prompt', 'analysis-prompt', 'out-bottom-left', 'in-top', { kind: 'control', color: violet }),
  edge('prompt-director', 'prompt', 'director-prompt', 'out-bottom-right', 'in-top', { kind: 'control', color: violet }),
  edge('analysis-control', 'analysis-prompt', 'multimodal', 'out-right', 'in-top', { kind: 'control', color: violet, label: '控制分析侧重点', branch: 'miss' }),
  edge('director-control', 'director-prompt', 'director', 'out-bottom', 'in-top', { kind: 'control', color: violet, label: '控制剪辑内容' }),
  edge('assets-check', 'assets', 'cache-check', 'out-right', 'in-left', { kind: 'data', color: teal }),
  edge('cache-miss', 'cache-check', 'multimodal', 'out-right-upper', 'in-left', { kind: 'data', color: teal, label: 'NO', branch: 'miss' }),
  edge('cache-hit', 'cache-check', 'read-cache', 'out-bottom', 'in-left', { kind: 'data', color: teal, label: 'YES', branch: 'hit' }),
  edge('generate-metadata', 'multimodal', 'metadata', 'out-right', 'in-left', { kind: 'data', color: teal, label: '写入缓存', branch: 'miss' }),
  edge('cached-metadata', 'read-cache', 'metadata', 'out-right', 'in-bottom', { kind: 'data', color: teal, label: '复用', branch: 'hit' }),
  edge('metadata-director', 'metadata', 'director', 'out-right', 'in-left', { kind: 'data', color: blue }),
  edge('director-script', 'director', 'editscript', 'out-bottom', 'in-top', { kind: 'data', color: blue, label: '导演决策' }),
  edge('script-render', 'editscript', 'remotion', 'out-left', 'in-right', { kind: 'data', color: orange }),
  edge('render-output', 'remotion', 'mp4', 'out-left', 'in-right', { kind: 'data', color: orange }),
  edge('source-render', 'assets', 'remotion', 'out-bottom', 'in-bottom', { kind: 'resource', color: '#a6a3af', label: '按脚本中的引用读取原素材' }),
]

export const architectureSteps = [
  { title: '架构总览', description: '素材只理解一次，元数据反复复用；LLM 负责导演决策，Remotion 负责确定性执行。', ids: [] },
  { title: 'Prompt 分成两路', description: '素材分析 Prompt 决定看什么；导演 Prompt 决定怎么剪，两种策略分别控制理解和决策。', ids: ['prompt', 'analysis-prompt', 'director-prompt', 'multimodal', 'director'] },
  { title: '先检查元数据缓存', description: '不存在就分析原素材；已存在就读取缓存。导演层接收统一格式的元数据。', ids: ['assets', 'cache-check', 'multimodal', 'read-cache', 'metadata'] },
  { title: '理解一次，复用多次', description: '首次生成 Asset Metadata 后持久化；缓存命中时跳过多模态分析，直接进入导演层。', ids: ['analysis-prompt', 'cache-check', 'multimodal', 'read-cache', 'metadata'] },
  { title: 'LLM 做导演决策', description: '导演读取 Metadata 和导演 Prompt，输出 EditScript JSON；MVP 无需重新看原视频。', ids: ['metadata', 'director-prompt', 'director', 'editscript'] },
  { title: '本地渲染，交付 MP4', description: 'Remotion 执行结构化剪辑脚本并读取原素材；换一个导演 Prompt，即可复用元数据生成新版本。', ids: ['assets', 'editscript', 'remotion', 'mp4'] },
]

export function initialArchitectureNodes(): ArchitectureNode[] {
  return architectureNodes.map((n, order) => ({ ...n, position: { ...n.position }, data: { ...n.data, order } }))
}
