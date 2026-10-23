import { memo, useContext, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import type { FlowNode } from './flowchart'
import { colors, defaultColor, EditingContext } from './thoughtNodeConfig'

const handles = [Position.Top, Position.Right, Position.Bottom, Position.Left]

function NodeEditor({ id, label }: { id: string; label: string }) {
  const { finish } = useContext(EditingContext)
  const [draft, setDraft] = useState(label)
  const editor = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    editor.current?.focus()
    editor.current?.select()
  }, [])

  useLayoutEffect(() => {
    const textarea = editor.current!
    textarea.style.height = '0px'
    textarea.style.height = `${textarea.scrollHeight}px`
  }, [draft])

  return <textarea
    ref={editor}
    aria-label="想法文字"
    className="fc-node-editor nodrag nopan nowheel"
    rows={1}
    value={draft}
    onChange={event => setDraft(event.target.value)}
    onBlur={() => finish(id, draft)}
    onDoubleClick={event => event.stopPropagation()}
    onKeyDown={event => {
      event.stopPropagation()
      if (event.nativeEvent.isComposing) return
      if (event.key === 'Escape' || (event.key === 'Enter' && (event.ctrlKey || event.metaKey))) {
        event.preventDefault()
        event.currentTarget.blur()
      }
    }}
    onKeyUp={event => event.stopPropagation()}
  />
}

const ThoughtNode = memo(({ id, data, selected }: NodeProps<FlowNode>) => {
  const editing = useContext(EditingContext)
  const color = data.color
    ? colors.find(item => item.value === data.color) ?? { value: data.color, fill: `${data.color}15`, text: data.color }
    : defaultColor(data.kind)

  return <div
    className={`flowchart-node flowchart-${data.kind}${selected ? ' is-selected' : ''}`}
    style={{ '--node-fill': color.fill, '--node-stroke': color.value, '--node-text': color.text } as CSSProperties}
  >
    {data.kind === 'decision' && <svg className="flowchart-diamond" viewBox="0 0 260 140" preserveAspectRatio="none" aria-hidden="true">
      <polygon points="130,1 259,70 130,139 1,70" vectorEffect="non-scaling-stroke" />
    </svg>}
    {editing.id === id
      ? <NodeEditor id={id} label={data.label} />
      : <span className="flowchart-node-label">{data.label}</span>}
    {handles.map(position => <Handle key={position} id={position} type="source" position={position} />)}
  </div>
})

export default ThoughtNode
