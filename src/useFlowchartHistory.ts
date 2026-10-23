import { useCallback, useRef, useState } from 'react'
import { serializeFlowDocument } from './flowchart'
import type { FlowDocument } from './flowchart'

type UpdateMode = 'record' | 'merge' | 'transient'
type DocumentUpdater = FlowDocument | ((current: FlowDocument) => FlowDocument)
type HistoryState = { doc: FlowDocument; past: FlowDocument[]; future: FlowDocument[] }

const historyLimit = 60

function appendSnapshot(history: FlowDocument[], doc: FlowDocument): FlowDocument[] {
  return [...history, serializeFlowDocument(doc)].slice(-historyLimit)
}

export function useFlowchartHistory(initial: FlowDocument) {
  const [state, setState] = useState<HistoryState>(() => ({ doc: initial, past: [], future: [] }))
  const latest = useRef(state)

  const update = useCallback((updater: (current: HistoryState) => HistoryState) => {
    const current = latest.current
    const next = updater(current)
    if (next === current) return
    latest.current = next
    setState(next)
  }, [])

  const setDoc = useCallback((updater: DocumentUpdater, mode: UpdateMode = 'record') => {
    update(current => {
      const doc = typeof updater === 'function' ? updater(current.doc) : updater
      if (doc === current.doc) return current
      return {
        doc,
        past: mode === 'record' ? appendSnapshot(current.past, current.doc) : current.past,
        future: mode === 'transient' ? current.future : [],
      }
    })
  }, [update])

  const checkpoint = useCallback(() => {
    update(current => ({ ...current, past: appendSnapshot(current.past, current.doc), future: [] }))
  }, [update])

  const undo = useCallback(() => {
    update(current => {
      const doc = current.past.at(-1)
      if (!doc) return current
      return {
        doc,
        past: current.past.slice(0, -1),
        future: appendSnapshot(current.future, current.doc),
      }
    })
  }, [update])

  const redo = useCallback(() => {
    update(current => {
      const doc = current.future.at(-1)
      if (!doc) return current
      return {
        doc,
        past: appendSnapshot(current.past, current.doc),
        future: current.future.slice(0, -1),
      }
    })
  }, [update])

  return { doc: state.doc, setDoc, checkpoint, undo, redo, canUndo: state.past.length > 0, canRedo: state.future.length > 0 }
}
