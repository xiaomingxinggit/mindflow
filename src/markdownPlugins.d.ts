declare module 'markdown-it-task-lists' {
  import type MarkdownIt from 'markdown-it'
  const taskLists: (markdown: MarkdownIt, options?: { enabled?: boolean; label?: boolean; labelAfter?: boolean }) => void
  export default taskLists
}

declare module 'markdown-it-texmath' {
  import type MarkdownIt from 'markdown-it'
  import type { KatexOptions } from 'katex'
  const texmath: (markdown: MarkdownIt, options?: { engine?: unknown; delimiters?: string | string[]; katexOptions?: KatexOptions }) => void
  export default texmath
}
