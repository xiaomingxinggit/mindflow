import { getSceneVersion, serializeAsJSON } from '@excalidraw/excalidraw'
import type { ExportedDataState } from '@excalidraw/excalidraw/data/types'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type {
  AppState,
  BinaryFiles,
  ExcalidrawInitialDataState,
  LibraryItems,
} from '@excalidraw/excalidraw/types'
import type { CanvasStyle } from './visualStyles'
import type { ToolColors } from './toolColors'

const DATABASE_NAME = 'mindflow-whiteboard-v1'
const STORE_NAME = 'workspace'
const SAVE_DELAY = 500

type ScenePreferences = Pick<
  AppState,
  | 'name'
  | 'theme'
  | 'scrollX'
  | 'scrollY'
  | 'zoom'
  | 'gridModeEnabled'
  | 'gridSize'
  | 'gridStep'
  | 'viewBackgroundColor'
  | 'objectsSnapModeEnabled'
  | 'zenModeEnabled'
  | 'currentItemStrokeColor'
  | 'currentItemBackgroundColor'
  | 'currentItemFillStyle'
  | 'currentItemStrokeWidth'
  | 'currentItemStrokeStyle'
  | 'currentItemRoughness'
  | 'currentItemOpacity'
  | 'currentItemFontFamily'
  | 'currentItemFontSize'
  | 'currentItemTextAlign'
  | 'currentItemStartArrowhead'
  | 'currentItemEndArrowhead'
  | 'currentItemRoundness'
  | 'currentItemArrowType'
> & { canvasStyle?: CanvasStyle; toolColors?: ToolColors }

type StoredScene = {
  data: string
  preferences: ScenePreferences
}

export type SceneSnapshot = {
  elements: readonly ExcalidrawElement[]
  appState: AppState
  files: BinaryFiles
  style: CanvasStyle
  toolColors: ToolColors
}

export type SaveStatus = 'saving' | 'saved' | 'error'

let databasePromise: Promise<IDBDatabase> | undefined
let writeQueue = Promise.resolve()

function openDatabase() {
  if (!databasePromise) {
    databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, 1)
      request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    }).catch((error) => {
      databasePromise = undefined
      throw error
    })
  }
  return databasePromise
}

function writeRecord(key: 'scene' | 'library', value: StoredScene | LibraryItems) {
  const operation = writeQueue.then(async () => {
    const database = await openDatabase()
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite')
      transaction.objectStore(STORE_NAME).put(value, key)
      transaction.oncomplete = () => resolve()
      transaction.onabort = () => reject(transaction.error)
      transaction.onerror = () => reject(transaction.error)
    })
  })
  // A failed write must not prevent a later edit from being saved.
  writeQueue = operation.catch(() => {})
  return operation
}

export async function loadWorkspace(): Promise<{
  scene: ExcalidrawInitialDataState | undefined
  libraryItems: LibraryItems
  style: CanvasStyle | undefined
  toolColors: ToolColors
}> {
  const database = await openDatabase()
  const records = await new Promise<{
    scene: StoredScene | undefined
    libraryItems: LibraryItems | undefined
  }>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const sceneRequest = store.get('scene')
    const libraryRequest = store.get('library')
    transaction.oncomplete = () => resolve({
      scene: sceneRequest.result,
      libraryItems: libraryRequest.result,
    })
    transaction.onabort = () => reject(transaction.error)
    transaction.onerror = () => reject(transaction.error)
  })
  const storedScene = records.scene
  let scene: ExcalidrawInitialDataState | undefined
  let style: CanvasStyle | undefined
  let toolColors: ToolColors = {}
  if (storedScene) {
    const parsed: ExportedDataState = JSON.parse(storedScene.data)
    const { canvasStyle, toolColors: savedColors, ...appPreferences } = storedScene.preferences
    style = canvasStyle
    toolColors = savedColors ?? {}
    scene = {
      elements: parsed.elements,
      appState: { ...parsed.appState, ...appPreferences },
      files: parsed.files,
    }
  }
  return { scene, libraryItems: records.libraryItems ?? [], style, toolColors }
}

export function saveLibraryItems(libraryItems: LibraryItems) {
  return writeRecord('library', libraryItems)
}

function getPreferences(appState: AppState, style: CanvasStyle, toolColors: ToolColors): ScenePreferences {
  return {
    name: appState.name,
    theme: appState.theme,
    scrollX: appState.scrollX,
    scrollY: appState.scrollY,
    zoom: { value: appState.zoom.value },
    gridModeEnabled: appState.gridModeEnabled,
    gridSize: appState.gridSize,
    gridStep: appState.gridStep,
    viewBackgroundColor: appState.viewBackgroundColor,
    objectsSnapModeEnabled: appState.objectsSnapModeEnabled,
    zenModeEnabled: appState.zenModeEnabled,
    currentItemStrokeColor: appState.currentItemStrokeColor,
    currentItemBackgroundColor: appState.currentItemBackgroundColor,
    currentItemFillStyle: appState.currentItemFillStyle,
    currentItemStrokeWidth: appState.currentItemStrokeWidth,
    currentItemStrokeStyle: appState.currentItemStrokeStyle,
    currentItemRoughness: appState.currentItemRoughness,
    currentItemOpacity: appState.currentItemOpacity,
    currentItemFontFamily: appState.currentItemFontFamily,
    currentItemFontSize: appState.currentItemFontSize,
    currentItemTextAlign: appState.currentItemTextAlign,
    currentItemStartArrowhead: appState.currentItemStartArrowhead,
    currentItemEndArrowhead: appState.currentItemEndArrowhead,
    currentItemRoundness: appState.currentItemRoundness,
    currentItemArrowType: appState.currentItemArrowType,
    canvasStyle: style,
    toolColors,
  }
}

/** Debounces edits and queues writes in order, so an older save cannot win a race. */
export function createSceneSaver(onStatus: (status: SaveStatus, error?: unknown) => void) {
  let pending: SceneSnapshot | undefined
  let lastElements: SceneSnapshot['elements'] | undefined
  let lastSceneVersion: number | undefined
  let lastPreferences: string | undefined
  let lastFiles: BinaryFiles | undefined
  let savedSignature: string | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let revision = 0
  let activeWrite = Promise.resolve()

  function clearTimer() {
    clearTimeout(timer)
    timer = undefined
  }

  function flush() {
    clearTimer()
    if (!pending) return activeWrite
    const snapshot = pending
    const savedRevision = revision
    pending = undefined
    activeWrite = activeWrite
      .then(async () => {
        const storedScene: StoredScene = {
          data: serializeAsJSON(snapshot.elements, snapshot.appState, snapshot.files, 'local'),
          preferences: getPreferences(snapshot.appState, snapshot.style, snapshot.toolColors),
        }
        const signature = JSON.stringify(storedScene)
        if (signature !== savedSignature) {
          await writeRecord('scene', storedScene)
          savedSignature = signature
        }
        if (savedRevision === revision) onStatus('saved')
      })
      .catch((error) => {
        if (savedRevision === revision) {
          lastSceneVersion = undefined
          onStatus('error', error)
        }
      })
    return activeWrite
  }

  return {
    schedule(snapshot: SceneSnapshot) {
      const sceneVersion = getSceneVersion(snapshot.elements)
      const preferences = JSON.stringify(getPreferences(snapshot.appState, snapshot.style, snapshot.toolColors))
      if (
        snapshot.elements === lastElements
        && sceneVersion === lastSceneVersion
        && preferences === lastPreferences
        && snapshot.files === lastFiles
      ) return
      lastElements = snapshot.elements
      lastSceneVersion = sceneVersion
      lastPreferences = preferences
      lastFiles = snapshot.files
      pending = snapshot
      revision += 1
      onStatus('saving')
      clearTimer()
      timer = setTimeout(() => { void flush() }, SAVE_DELAY)
    },
    flush,
    cancel() {
      clearTimer()
      pending = undefined
      lastSceneVersion = undefined
      revision += 1
    },
  }
}
