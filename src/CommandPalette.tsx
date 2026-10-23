import { useId, useState } from 'react'
import './CommandPalette.css'

export type Command = {
  id: string
  label: string
  shortcut?: string
  onSelect: () => void
}

type Props = { commands: Command[]; onClose: () => void }

export default function CommandPalette({ commands, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const listId = useId()
  const matches = commands.filter(command => command.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const activeIndex = Math.min(selected, matches.length - 1)

  function runCommand(command: Command) {
    command.onSelect()
    onClose()
  }

  return <div className="command-palette-overlay" onClick={event => {
    if (event.target === event.currentTarget) onClose()
  }} onKeyDown={event => {
    event.stopPropagation()
    if (event.key === 'Escape' && !event.nativeEvent.isComposing) {
      event.preventDefault()
      onClose()
    }
  }}>
    <div className="command-palette" role="dialog" aria-modal="true" aria-label="命令面板">
      <div className="command-palette-search">
        <input autoFocus aria-label="搜索命令" role="combobox" aria-expanded="true" aria-controls={listId}
          aria-activedescendant={matches[activeIndex] ? `${listId}-${matches[activeIndex].id}` : undefined}
          placeholder="搜索命令…" value={query} onChange={event => {
            setQuery(event.target.value)
            setSelected(0)
          }} onKeyDown={event => {
            if (event.nativeEvent.isComposing) return
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault()
              if (matches.length) setSelected((activeIndex + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length)
            } else if (event.key === 'Enter') {
              event.preventDefault()
              if (matches[activeIndex]) runCommand(matches[activeIndex])
            }
          }} />
        <button type="button" className="command-palette-close" aria-label="关闭命令面板" onClick={onClose}>×</button>
      </div>
      <div className="command-palette-results" id={listId} role="listbox" aria-label="匹配命令">
        {matches.map((command, index) => <button type="button" key={command.id} id={`${listId}-${command.id}`}
          className="command-palette-item" role="option" aria-selected={index === activeIndex}
          ref={node => { if (index === activeIndex) node?.scrollIntoView({ block: 'nearest' }) }}
          onMouseEnter={() => setSelected(index)} onClick={() => runCommand(command)}>
          <span>{command.label}</span>{command.shortcut && <kbd>{command.shortcut}</kbd>}
        </button>)}
        {!matches.length && <p className="command-palette-empty">没有找到命令</p>}
      </div>
      <div className="command-palette-hint">↑ ↓ 选择 · Enter 执行 · Esc 关闭</div>
    </div>
  </div>
}
