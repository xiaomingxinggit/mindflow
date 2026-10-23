import { useEffect, useRef, useState } from 'react'
import { Crepe } from '@milkdown/crepe'
import { editorViewCtx } from '@milkdown/kit/core'
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
  const touched = useRef(false)
  useEffect(() => { callbacks.current = props }, [props])
  useEffect(() => {
    if (!root.current) return
    let cancelled = false
    const host = root.current
    const touch = () => { touched.current = true }
    host.addEventListener('beforeinput', touch, true)
    host.addEventListener('paste', touch, true)
    host.addEventListener('pointerdown', touch, true)
    const crepe = new Crepe({
      root: host,
      defaultValue: callbacks.current.source,
      features: { [Crepe.Feature.BlockEdit]: false, [Crepe.Feature.Toolbar]: false, [Crepe.Feature.Placeholder]: false },
      featureConfigs: {
        [Crepe.Feature.ImageBlock]: {
          onUpload: file => callbacks.current.onUpload(file),
          proxyDomURL: url => callbacks.current.resolveImage(url),
        },
      },
    }).on(listener => listener.markdownUpdated((_ctx, markdown) => {
      if (touched.current && !cancelled) callbacks.current.onSource(markdown)
    }))
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
        observer.observe(content)
        callbacks.current.onReady(() => touched.current ? crepe.getMarkdown() : callbacks.current.source)
        view.focus()
      })
    }) }, 0)
    return () => {
      cancelled = true
      callbacks.current.onReady(null)
      clearTimeout(createTimer)
      observer.disconnect()
      host.removeEventListener('beforeinput', touch, true)
      host.removeEventListener('paste', touch, true)
      host.removeEventListener('pointerdown', touch, true)
      if (host.querySelector('.ProseMirror')) void crepe.destroy()
    }
  }, [])
  return <div className="mindflow-rich-editor" data-rich-editor aria-busy={props.busy} onPointerDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()} onBeforeInput={event => { if (props.busy) event.preventDefault() }} onKeyDown={event => {
    event.stopPropagation()
    if (props.busy) { event.preventDefault(); return }
    if (event.nativeEvent.isComposing) return
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); props.onFinish() }
    if (event.key === 'Escape') { event.preventDefault(); props.onCancel() }
  }} style={{ width: props.width, fontSize: props.fontSize, color: props.color }}>
    <button className="mindflow-rich-upload" type="button" aria-label="插入图片" disabled={props.busy} onPointerDown={event => event.preventDefault()} onClick={() => imageInput.current?.click()}><ImagePlus size={16} aria-hidden="true" /></button>
    <input ref={imageInput} hidden type="file" accept="image/*" aria-label="插入 Markdown 图片" disabled={props.busy} onChange={event => {
      const file = event.target.files?.[0]
      if (!file) return
      touched.current = true
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
