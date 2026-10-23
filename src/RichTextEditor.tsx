import { useEffect, useRef, useState } from 'react'
import { Crepe } from '@milkdown/crepe'
import { editorViewCtx, prosePluginsCtx } from '@milkdown/kit/core'
import { EditorView as CodeEditorView } from '@codemirror/view'
import { exitCode } from '@milkdown/kit/prose/commands'
import { NodeSelection, Plugin, TextSelection } from '@milkdown/kit/prose/state'
import { trailingConfig } from '@milkdown/kit/plugin/trailing'
import type { Node as ProseMirrorNode } from '@milkdown/kit/prose/model'
import { ImagePlus } from 'lucide-react'
import '@milkdown/crepe/theme/common/style.css'
import '@milkdown/crepe/theme/frame.css'
import 'katex/dist/katex.min.css'
import './RichTextEditor.css'

type Props = {
  source: string
  width: number
  fontSize: number
  color: string
  busy: boolean
  caret?: { left: number; top: number }
  onComposition: (composing: boolean) => void
  resolveImage: (url: string) => string
  onSource: (source: string) => void
  onHeight: (height: number) => void
  onUpload: (file: File) => Promise<string>
  onFinish: () => void
  onCancel: () => void
  onReady: (read: (() => string) | null) => void
}

export function RichTextWidthControl({ width, onResize, onEdit }: { width: number; onResize: (width: number) => void; onEdit: () => void }) {
  const [value, setValue] = useState(width)
  return <div className="mindflow-rich-width" onKeyDown={event => event.stopPropagation()}><label>文字宽度 <input aria-label="Markdown 宽度" type="number" min={100} max={1200} value={value} onChange={event => setValue(Number(event.target.value))} onBlur={() => onResize(value)} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }} /></label><button onClick={onEdit}>编辑内容</button></div>
}

/** One active ProseMirror instance; the native scene receives one final edit. */
export default function RichTextEditor(props: Props) {
  const root = useRef<HTMLDivElement>(null)
  const imageInput = useRef<HTMLInputElement>(null)
  const callbacks = useRef(props)
  const instance = useRef<Crepe | null>(null)
  const changed = useRef(false)
  useEffect(() => { callbacks.current = props }, [props])
  useEffect(() => {
    if (!root.current) return
    let cancelled = false
    const host = root.current
    let ready = false
    let initialDoc: ProseMirrorNode | null = null
    let placementFrame = 0
    let compositionFrame = 0
    const compositionStart = () => { cancelAnimationFrame(compositionFrame); callbacks.current.onComposition(true) }
    // Chromium commits the final input after compositionend; finish on the next frame.
    const compositionEnd = () => { compositionFrame = requestAnimationFrame(() => callbacks.current.onComposition(false)) }
    const cancelPendingPlacement = () => cancelAnimationFrame(placementFrame)
    const cancelPlacement = (event: PointerEvent) => {
      cancelAnimationFrame(placementFrame)
      const target = event.target as Element
      // Crepe otherwise promotes a first cell click to a whole-paragraph node
      // selection on the next frame. Establish the caret before that handler.
      if (!event.shiftKey && target.closest('td, th') && !target.closest('button') && instance.current) {
        instance.current.editor.action(ctx => {
          const view = ctx.get(editorViewCtx)
          const hit = view.posAtCoords({ left: event.clientX, top: event.clientY })
          if (hit) view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(hit.pos))))
        })
        return
      }
      const preview = target.closest('.milkdown-code-block .preview')
      const block = preview?.closest('.milkdown-code-block')
      if (!block || !instance.current) return
      event.preventDefault()
      instance.current.editor.action(ctx => {
        const view = ctx.get(editorViewCtx)
        const position = view.state.doc.resolve(view.posAtDOM(block, 0))
        const start = position.parent.type.name === 'code_block' ? position.before() : position.pos
        view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, start)))
      })
    }
    host.addEventListener('compositionstart', compositionStart, true)
    host.addEventListener('compositionend', compositionEnd, true)
    host.addEventListener('pointerdown', cancelPlacement, true)
    host.addEventListener('keydown', cancelPendingPlacement, true)
    host.addEventListener('beforeinput', cancelPendingPlacement, true)
    const crepe = new Crepe({
      root: host,
      defaultValue: callbacks.current.source,
      features: { [Crepe.Feature.BlockEdit]: false, [Crepe.Feature.Toolbar]: false, [Crepe.Feature.Placeholder]: false, [Crepe.Feature.ListItem]: false },
      featureConfigs: {
        [Crepe.Feature.Cursor]: { virtual: false },
        [Crepe.Feature.CodeMirror]: { extensions: [CodeEditorView.lineWrapping] },
        [Crepe.Feature.ImageBlock]: {
          onUpload: file => callbacks.current.onUpload(file),
          proxyDomURL: url => callbacks.current.resolveImage(url),
        },
      },
    }).on(listener => listener.markdownUpdated((_ctx, markdown) => {
      if (changed.current && !cancelled) callbacks.current.onSource(markdown)
    }))
    crepe.editor.config(ctx => ctx.update(trailingConfig.key, config => ({ ...config, shouldAppend: () => false })))
    crepe.editor.config(ctx => ctx.update(prosePluginsCtx, plugins => [...plugins, new Plugin({
      props: { nodeViews: { list_item: (initialNode, view, getPos) => {
        // Crepe's Vue list view restores a captured selection on the next frame.
        // A synchronous DOM view lets ProseMirror own typing and selection entirely.
        let node = initialNode
        const dom = document.createElement('li')
        const contentDOM = document.createElement('div')
        const checkbox = document.createElement('input')
        checkbox.type = 'checkbox'
        checkbox.contentEditable = 'false'
        checkbox.className = 'task-list-item-checkbox'
        checkbox.setAttribute('aria-label', '完成事项')
        const sync = () => {
          dom.dataset.spread = String(node.attrs.spread)
          dom.classList.toggle('task-list-item', node.attrs.checked != null)
          checkbox.hidden = node.attrs.checked == null
          checkbox.checked = !!node.attrs.checked
        }
        checkbox.onpointerdown = event => event.preventDefault()
        checkbox.onchange = () => {
          const pos = getPos()
          if (pos !== undefined) view.dispatch(view.state.tr.setNodeAttribute(pos, 'checked', checkbox.checked))
        }
        dom.append(checkbox, contentDOM)
        sync()
        return { dom, contentDOM, update: next => {
          if (next.type !== node.type) return false
          node = next
          sync()
          return true
        }, stopEvent: event => event.target === checkbox, ignoreMutation: mutation => mutation.type !== 'selection' && !contentDOM.contains(mutation.target) }
      } } },
      state: { init: () => null, apply: transaction => {
        if (ready && transaction.docChanged) changed.current = true
        return null
      } },
    })]))
    const observer = new ResizeObserver(entries => {
      callbacks.current.onHeight(Math.max(callbacks.current.fontSize * 1.5, entries[0].contentRect.height))
    })
    const createTimer = window.setTimeout(() => { void crepe.create().then(() => {
      if (cancelled) { void crepe.destroy(); return }
      crepe.editor.action(ctx => {
        instance.current = crepe
        const view = ctx.get(editorViewCtx)
        const content = view.dom
        content.setAttribute('aria-label', 'Markdown 内容')
        content.setAttribute('role', 'textbox')
        content.setAttribute('aria-multiline', 'true')
        content.classList.add('mindflow-markdown-content')
        view.dispatch(view.state.tr.setSelection(TextSelection.atStart(view.state.doc)))
        initialDoc = view.state.doc
        ready = true
        observer.observe(content)
        callbacks.current.onReady(() => !changed.current || view.state.doc.eq(initialDoc!) ? callbacks.current.source : crepe.getMarkdown())
        callbacks.current.onHeight(Math.max(callbacks.current.fontSize * 1.5, content.offsetHeight))
        const initialCaret = callbacks.current.caret
        const initialHit = initialCaret && callbacks.current.source.trim() ? view.posAtCoords(initialCaret) : null
        if (initialHit) view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(initialHit.pos))))
        view.focus()
        // Place once, after React has aligned the measured overlay. Later images/typing
        // may resize the editor, but must never take ownership of the user's caret.
        placementFrame = requestAnimationFrame(() => {
          const caret = callbacks.current.caret
          const hit = caret && callbacks.current.source.trim() ? view.posAtCoords(caret) : null
          if (hit) view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(hit.pos))))
        })
      })
    }) }, 0)
    return () => {
      cancelled = true
      callbacks.current.onReady(null)
      clearTimeout(createTimer)
      observer.disconnect()
      cancelAnimationFrame(placementFrame)
      cancelAnimationFrame(compositionFrame)
      host.removeEventListener('compositionstart', compositionStart, true)
      host.removeEventListener('compositionend', compositionEnd, true)
      host.removeEventListener('pointerdown', cancelPlacement, true)
      host.removeEventListener('keydown', cancelPendingPlacement, true)
      host.removeEventListener('beforeinput', cancelPendingPlacement, true)
      if (host.querySelector('.ProseMirror')) void crepe.destroy()
    }
  }, [])
  return <div className="mindflow-rich-editor" data-rich-editor aria-busy={props.busy} onPointerDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()} onBeforeInput={event => { if (props.busy) event.preventDefault() }} onKeyDown={event => event.stopPropagation()} onKeyDownCapture={event => {
    if (props.busy) { event.preventDefault(); return }
    if (event.nativeEvent.isComposing) return
    if (event.key === 'ArrowDown' && (event.target as Element).closest('.cm-content')) {
      const code = CodeEditorView.findFromDOM(event.target as HTMLElement)
      if (code && code.state.selection.main.empty && code.state.selection.main.head === code.state.doc.length) {
        instance.current?.editor.action(ctx => {
          const view = ctx.get(editorViewCtx)
          const position = view.state.selection.$from
          if (position.parent.type.name === 'code_block' && position.after() === view.state.doc.content.size && exitCode(view.state, view.dispatch)) {
            event.preventDefault()
            event.stopPropagation()
            view.focus()
          }
        })
      }
    }
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); props.onFinish() }
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); props.onCancel() }
  }} style={{ width: props.width, fontSize: props.fontSize, color: props.color }}>
    <button className="mindflow-rich-upload" type="button" aria-label="插入图片" disabled={props.busy} onPointerDown={event => event.preventDefault()} onClick={() => imageInput.current?.click()}><ImagePlus size={16} aria-hidden="true" /></button>
    <input ref={imageInput} hidden type="file" accept="image/*" aria-label="插入 Markdown 图片" disabled={props.busy} onChange={event => {
      const file = event.target.files?.[0]
      if (!file) return
      void props.onUpload(file).then(src => instance.current?.editor.action(ctx => {
        const view = ctx.get(editorViewCtx)
        const type = view.state.schema.nodes['image-block']
        view.dispatch(view.state.tr.replaceSelectionWith(type.create({ src })))
        view.focus()
      }))
      event.target.value = ''
    }} />
    <div ref={root} />
  </div>
}
