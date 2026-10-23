import { createContext } from 'react'
import type { NodeKind } from './flowchart'

export const colors = [
  { value: '#8b78cf', name: '紫色', fill: '#f4f0ff', text: '#5e4b98' },
  { value: '#6b9bd1', name: '蓝色', fill: '#eff6ff', text: '#416a9a' },
  { value: '#79ad93', name: '绿色', fill: '#f0f8f3', text: '#456c56' },
  { value: '#cfaf65', name: '黄色', fill: '#fffaeb', text: '#88703c' },
  { value: '#a3a5b5', name: '灰色', fill: '#f5f5f8', text: '#626575' },
]

export const defaultColor = (kind: NodeKind) => kind === 'start' ? colors[2] : kind === 'decision' ? colors[3] : kind === 'end' ? colors[4] : colors[0]

export const EditingContext = createContext<{ id: string | null; finish: (id: string, label: string) => void }>({
  id: null,
  finish: () => {},
})
