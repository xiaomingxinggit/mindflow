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

function documentChanged(previous: FlowDocument, next: FlowDocument): boolean {
  return JSON.stringify(serializeFlowDocument(previous)) !== JSON.stringify(serializeFlowDocument(next))
}

export function useFlowchartHistory(initial: FlowDocument) {
  const [state, setState] = useState<HistoryState>(() => ({ doc: initial, past: [], future: [] }))
  const latest = useRef(state)
  const pendingCheckpoint = useRef<FlowDocument | null>(null)

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
      const checkpoint = pendingCheckpoint.current
      if (mode === 'record') pendingCheckpoint.current = null
      if (doc === current.doc) return current
      if (mode === 'transient' || !documentChanged(current.doc, doc)) {
        return { ...current, doc }
      }
      pendingCheckpoint.current = null
      return {
        doc,
        past: mode === 'record'
          ? appendSnapshot(current.past, current.doc)
          : checkpoint ? appendSnapshot(current.past, checkpoint) : current.past,
        future: [],
      }
    })
  }, [update])

  const checkpoint = useCallback(() => {
    pendingCheckpoint.current = serializeFlowDocument(latest.current.doc)
  }, [])

  const undo = useCallback(() => {
    pendingCheckpoint.current = null
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
    pendingCheckpoint.current = null
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
