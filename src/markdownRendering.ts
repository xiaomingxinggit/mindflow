import MarkdownIt from 'markdown-it'
import taskLists from 'markdown-it-task-lists'
import texmath from 'markdown-it-texmath'
import katex from 'katex'
import DOMPurify from 'dompurify'
import { toPng } from 'html-to-image'
import type { ExcalidrawElement, ExcalidrawTextElement } from '@excalidraw/excalidraw/element/types'
import type { BinaryFiles } from '@excalidraw/excalidraw/types'
import { getRichTextRender, registerRichTextRender } from './richTextBridge'
import type { RichTextRender } from './richTextBridge'
import 'katex/dist/katex.min.css'
import './MarkdownContent.css'

type Token = ReturnType<InstanceType<typeof MarkdownIt>['parse']>[number]

const markdown = new MarkdownIt({ html: true, breaks: true, linkify: true, typographer: false })
  .use(taskLists)
  .use(texmath, { engine: katex, delimiters: ['dollars', 'beg_end'], katexOptions: { throwOnError: false, strict: false, trust: false } })

const defaultFence = markdown.renderer.rules.fence!
markdown.renderer.rules.fence = (tokens, index, options, environment, renderer) => {
  const token = tokens[index]
  if (/^(?:latex|math|tex)$/i.test(token.info.trim())) {
    return `<div class="mindflow-math-block">${katex.renderToString(token.content, { displayMode: true, throwOnError: false, strict: false, trust: false })}</div>`
  }
  return defaultFence(tokens, index, options, environment, renderer)
}

const defaultImage = markdown.renderer.rules.image!
markdown.renderer.rules.image = (tokens, index, options, environment, renderer) => {
  const token = tokens[index]
  const source = String(token.attrGet('src') ?? '')
  if (source.startsWith('mindflow-file:')) {
    token.attrSet('data-mindflow-file', source.slice('mindflow-file:'.length))
    token.attrSet('src', '')
  }
  return defaultImage(tokens, index, options, environment, renderer)
}

function visitTokens(tokens: readonly Token[], visit: (token: Token) => void) {
  for (const token of tokens) {
    visit(token)
    if (token.children) visitTokens(token.children, visit)
  }
}

/** Collect only persistent local resource IDs, without parsing Markdown using regular expressions. */
export function collectMarkdownImageFiles(source: string): string[] {
  const ids = new Set<string>()
  visitTokens(markdown.parse(source, {}), token => {
    if (token.type !== 'image') return
    const source = String(token.attrGet('src') ?? '')
    if (source.startsWith('mindflow-file:')) ids.add(source.slice('mindflow-file:'.length))
  })
  return [...ids]
}

/** Shared sanitized HTML for previews; the original Markdown remains the only source. */
export function renderMarkdownHtml(source: string): string {
  return DOMPurify.sanitize(markdown.render(source), { ADD_ATTR: ['data-mindflow-file'], USE_PROFILES: { html: true, mathMl: true, svg: true } })
}

const remoteImages = new Map<string, Promise<string | null>>()
const wantedKeys = new Map<string, string>()
const pending = new Map<string, Promise<RichTextRender>>()
const resolvedHtml = new Map<string, { source: string; html: string }>()

function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

function fetchImage(source: string): Promise<string | null> {
  if (source.startsWith('data:image/')) return Promise.resolve(source)
  const cached = remoteImages.get(source)
  if (cached) return cached
  const request = fetch(source).then(response => response.ok ? response.blob() : null).then(blob => blob?.type.startsWith('image/') ? readBlob(blob) : null).catch(() => null)
  remoteImages.set(source, request)
  return request
}

function missingImage(image: HTMLImageElement) {
  const placeholder = document.createElement('span')
  placeholder.className = 'mindflow-image-placeholder'
  placeholder.textContent = `图片无法加载${image.alt && !/^0?\.\d+$/.test(image.alt) ? `：${image.alt}` : ''}`
  image.replaceWith(placeholder)
}

async function loadImages(host: HTMLElement, files: BinaryFiles) {
  await Promise.all(Array.from(host.querySelectorAll('img')).map(async image => {
    const id = image.dataset.mindflowFile
    const original = image.getAttribute('src') ?? ''
    const source = id ? files[id]?.dataURL : original && await fetchImage(original)
    if (!source) {
      missingImage(image)
      return
    }
    const size = /(?:^|\s)width\s*=\s*["']?(\d+(?:\.\d+)?)(px|%)?/i.exec(image.title)
    const ratio = Number(image.alt)
    if (size) image.style.width = `${size[1]}${size[2] || 'px'}`
    else if (image.alt.trim() && ratio > 0 && ratio <= 1) image.style.width = `${ratio * 100}%`
    image.src = source
    try {
      await image.decode()
      // Preserve the decoded aspect ratio for synchronous native resize layout.
      // A selected display width stays in CSS and the attributes describe the resource.
      const displayWidth = image.getAttribute('width')
      if (!image.style.width && displayWidth) image.style.width = displayWidth.endsWith('%') ? displayWidth : `${parseFloat(displayWidth)}px`
      image.width = image.naturalWidth
      image.height = image.naturalHeight
    } catch {
      missingImage(image)
    }
  }))
}

function renderKey(text: ExcalidrawTextElement, files: BinaryFiles, width: number): string {
  return JSON.stringify([
    text.originalText, width, text.fontSize, text.strokeColor,
    collectMarkdownImageFiles(text.originalText).map(id => [id, files[id]?.dataURL ?? null]),
  ])
}

function createMeasureHost(text: ExcalidrawTextElement, width: number, html: string) {
  const host = document.createElement('div')
  host.className = 'mindflow-markdown-content'
  Object.assign(host.style, { position: 'fixed', left: '-100000px', top: '0', width: `${width}px`, fontSize: `${text.fontSize}px`, color: text.strokeColor })
  host.innerHTML = html
  if (!text.originalText.trim()) host.innerHTML = '<p><br></p>'
  document.body.append(host)
  return host
}

function measureHost(host: HTMLElement, fontSize: number, width: number): number {
  // A display formula remains fully visible within the user's chosen width.
  for (const formula of host.querySelectorAll<HTMLElement>('.katex-display > .katex')) {
    if (formula.scrollWidth > width) formula.style.fontSize = `${width / formula.scrollWidth * 100}%`
  }
  return Math.max(Math.ceil(host.getBoundingClientRect().height), Math.ceil(fontSize * 1.5))
}

/** Reflow inside the native resize transaction; this only measures cached HTML. */
export function measureMarkdownResize(text: ExcalidrawTextElement, container: ExcalidrawElement | null) {
  if (container && !['rectangle', 'ellipse', 'diamond', 'arrow'].includes(container.type)) return null
  const cached = resolvedHtml.get(text.id)
  if (!cached || cached.source !== text.originalText) return null
  const factor = container?.type === 'diamond' ? 2 : container?.type === 'ellipse' ? Math.SQRT2 : 1
  const width = Math.max(100, Math.round(!container || container.type === 'arrow' ? text.width : container.width / factor - 32))
  const host = createMeasureHost(text, width, cached.html)
  try {
    return {
      width,
      height: measureHost(host, text.fontSize, width),
      customData: {
        ...text.customData,
        mindflowMarkdown: { ...text.customData?.mindflowMarkdown, width, imageFiles: text.customData?.mindflowMarkdown?.imageFiles ?? collectMarkdownImageFiles(text.originalText) },
      },
    }
  } finally {
    host.remove()
  }
}

async function renderImage(text: ExcalidrawTextElement, files: BinaryFiles, width: number, key: string): Promise<RichTextRender> {
  const host = createMeasureHost(text, width, renderMarkdownHtml(text.originalText))
  try {
    await loadImages(host, files)
    await document.fonts.ready
    const html = host.innerHTML
    const height = measureHost(host, text.fontSize, width)
    const dataUrl = await toPng(host, {
      width, height, pixelRatio: 2, preferredFontFormat: 'woff2',
      // Chrome also clones logical insets from the offscreen host. Static
      // positioning ignores those offsets inside the SVG foreignObject.
      style: { position: 'static', margin: '0', transform: 'none' },
    })
    const image = new Image()
    image.src = dataUrl
    await image.decode()
    if (wantedKeys.get(text.id) === key) resolvedHtml.set(text.id, { source: text.originalText, html })
    return { image, dataUrl, width, height, key }
  } finally {
    host.remove()
  }
}

/** Measure the complete rendered object and cache its static native canvas/SVG representation. */
export async function prepareMarkdownRender(text: ExcalidrawTextElement, files: BinaryFiles, requestedWidth?: number): Promise<{ width: number; height: number; key: string }> {
  const width = Math.max(48, Math.round(requestedWidth ?? text.customData?.mindflowMarkdown?.width ?? text.width ?? 320))
  const key = renderKey(text, files, width)
  wantedKeys.set(text.id, key)
  const cached = getRichTextRender(text.id)
  if (cached?.key === key) return { width: cached.width, height: cached.height, key }
  const entryKey = `${text.id}:${key}`
  let request = pending.get(entryKey)
  if (!request) {
    request = renderImage(text, files, width, key)
    pending.set(entryKey, request)
  }
  try {
    const render = await request
    if (wantedKeys.get(text.id) === key) registerRichTextRender(text.id, render)
    return { width: render.width, height: render.height, key }
  } finally {
    if (pending.get(entryKey) === request) pending.delete(entryKey)
  }
}
