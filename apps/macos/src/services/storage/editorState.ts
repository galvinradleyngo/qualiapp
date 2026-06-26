import {
  defaultActivityTypes,
  defaultTranscripts,
  type EditorTagRecord,
  type TranscriptRecord,
} from '../../features/editor/models'

const editorDbName = 'qualiapp-macos-editor-db'
const editorStoreName = 'snapshots'
const editorSnapshotId = 'editor-state'
const legacyLocalStorageStateKey = 'qualiapp_macos_editor_state_v1'

export type EditorStateSnapshot = {
  transcripts: TranscriptRecord[]
  tags: EditorTagRecord[]
  activityTypes: string[]
}

const defaultSnapshot: EditorStateSnapshot = {
  transcripts: defaultTranscripts,
  tags: [],
  activityTypes: defaultActivityTypes,
}

function normalizeSnapshot(candidate: Partial<EditorStateSnapshot> | null | undefined): EditorStateSnapshot {
  const transcripts = Array.isArray(candidate?.transcripts) && candidate.transcripts.length
    ? candidate.transcripts
    : defaultTranscripts
  const tags = Array.isArray(candidate?.tags) ? candidate.tags : []
  const activityTypes = Array.isArray(candidate?.activityTypes) && candidate.activityTypes.length
    ? candidate.activityTypes
    : defaultActivityTypes
  return { transcripts, tags, activityTypes }
}

function openEditorDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(editorDbName, 1)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(editorStoreName)) {
        db.createObjectStore(editorStoreName, { keyPath: 'id' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('Unable to open editor database.'))
  })
}

function getSnapshotFromDb(db: IDBDatabase): Promise<EditorStateSnapshot | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(editorStoreName, 'readonly')
    const store = tx.objectStore(editorStoreName)
    const request = store.get(editorSnapshotId)

    request.onsuccess = () => {
      const value = request.result as { payload?: EditorStateSnapshot } | undefined
      resolve(value?.payload ? normalizeSnapshot(value.payload) : null)
    }
    request.onerror = () => reject(request.error || new Error('Unable to read editor snapshot.'))
  })
}

function putSnapshotToDb(db: IDBDatabase, snapshot: EditorStateSnapshot): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(editorStoreName, 'readwrite')
    const store = tx.objectStore(editorStoreName)
    const request = store.put({ id: editorSnapshotId, payload: normalizeSnapshot(snapshot) })

    request.onerror = () => reject(request.error || new Error('Unable to save editor snapshot.'))
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error || new Error('Unable to complete editor snapshot write.'))
  })
}

function loadLegacyLocalStorageSnapshot(): EditorStateSnapshot | null {
  try {
    const raw = window.localStorage.getItem(legacyLocalStorageStateKey)
    if (!raw) return null
    return normalizeSnapshot(JSON.parse(raw) as Partial<EditorStateSnapshot>)
  } catch {
    return null
  }
}

async function migrateLegacySnapshotToIndexedDb(db: IDBDatabase): Promise<EditorStateSnapshot | null> {
  const legacySnapshot = loadLegacyLocalStorageSnapshot()
  if (!legacySnapshot) return null

  await putSnapshotToDb(db, legacySnapshot)
  try {
    window.localStorage.removeItem(legacyLocalStorageStateKey)
  } catch {
    // Ignore failures removing legacy fallback.
  }
  return legacySnapshot
}

export async function loadEditorState(): Promise<EditorStateSnapshot> {
  if (typeof window === 'undefined' || typeof window.indexedDB === 'undefined') {
    return defaultSnapshot
  }

  try {
    const db = await openEditorDb()
    try {
      const snapshot = await getSnapshotFromDb(db)
      if (snapshot) return snapshot

      const migrated = await migrateLegacySnapshotToIndexedDb(db)
      if (migrated) return migrated

      return defaultSnapshot
    } finally {
      db.close()
    }
  } catch {
    return defaultSnapshot
  }
}

export async function saveEditorState(snapshot: EditorStateSnapshot): Promise<void> {
  if (typeof window === 'undefined' || typeof window.indexedDB === 'undefined') return

  try {
    const db = await openEditorDb()
    try {
      await putSnapshotToDb(db, snapshot)
    } finally {
      db.close()
    }
  } catch {
    // Ignore storage availability errors in scaffold stage.
  }
}

export function parseImportedEditorState(raw: string): EditorStateSnapshot {
  const parsed = JSON.parse(raw) as Partial<EditorStateSnapshot>
  return normalizeSnapshot(parsed)
}

export function stringifyEditorState(snapshot: EditorStateSnapshot): string {
  return JSON.stringify(normalizeSnapshot(snapshot), null, 2)
}
