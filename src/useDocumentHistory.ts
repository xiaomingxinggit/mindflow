import { useCallback, useRef, useState } from 'react'
import { loadDocument } from './mindmap'
import type { MindDocument } from './mindmap'

type History = { past: MindDocument[]; current: MindDocument; future: MindDocument[] }
export function useDocumentHistory() {
  const [history, setHistory] = useState<History>(() => ({ past: [], current: loadDocument(), future: [] }))
  const historyRef = useRef(history)
  const apply = useCallback((next: History) => { historyRef.current = next; setHistory(next) }, [])
  const setDoc = useCallback((update: MindDocument | ((doc: MindDocument) => MindDocument), record = true) => {
    const h = historyRef.current
    const next = typeof update === 'function' ? update(h.current) : update
    apply({ past: record ? [...h.past, h.current].slice(-80) : h.past, current: next, future: [] })
  }, [apply])
  const checkpoint = useCallback(() => { const h = historyRef.current; apply({ ...h, past: [...h.past, h.current].slice(-80), future: [] }) }, [apply])
  const undo = useCallback(() => {
    const h = historyRef.current
    if (h.past.length) apply({ past: h.past.slice(0, -1), current: h.past[h.past.length - 1], future: [h.current, ...h.future] })
  }, [apply])
  const redo = useCallback(() => {
    const h = historyRef.current
    if (h.future.length) apply({ past: [...h.past, h.current], current: h.future[0], future: h.future.slice(1) })
  }, [apply])
  return { doc: history.current, setDoc, checkpoint, undo, redo, canUndo: history.past.length > 0, canRedo: history.future.length > 0 }
}
