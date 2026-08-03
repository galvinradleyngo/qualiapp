import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { TranscriptDashboard } from './features/editor/TranscriptDashboard'
import { TranscriptWorkspace } from './features/editor/TranscriptWorkspace'
import { PomodoroWidget } from './features/pomodoro/PomodoroWidget'
import {
  defaultActivityTypes,
  defaultTranscripts,
  type ActivityLogEntry,
  type EditorTagRecord,
  type TranscriptRecord,
} from './features/editor/models'
import { loadEditorState, parseImportedEditorState, saveEditorState, stringifyEditorState } from './services/storage/editorState'

const views = [
  {
    id: 'overview',
    label: 'Overview',
    eyebrow: 'Migration',
    title: 'macOS-first workspace',
    body:
      'This isolated app track mirrors the legacy workflow without modifying the current root files.',
  },
  {
    id: 'transcripts',
    label: 'Transcripts',
    eyebrow: 'Feature parity',
    title: 'Transcript coding workbench',
    body:
      'Build the code-mode experience, in-vivo validation, and transcript inspection here before cutover.',
  },
  {
    id: 'release',
    label: 'Release',
    eyebrow: 'Distribution',
    title: 'Signed patchable macOS app',
    body:
      'This track will add patch updates, rollback protection, and notarized release automation after core parity.',
  },
] as const

function App() {
  const [activeView, setActiveView] = useState<(typeof views)[number]['id']>('overview')
  const [transcripts, setTranscripts] = useState<TranscriptRecord[]>(defaultTranscripts)
  const [editorTags, setEditorTags] = useState<EditorTagRecord[]>([])
  const [activityTypes, setActivityTypes] = useState<string[]>(defaultActivityTypes)
  const [storageHydrated, setStorageHydrated] = useState(false)
  const [dataTransferStatus, setDataTransferStatus] = useState<string>('')
  const [activeTranscriptId, setActiveTranscriptId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const snapshot = await loadEditorState()
      if (cancelled) return
      setTranscripts(snapshot.transcripts)
      setEditorTags(snapshot.tags)
      setActivityTypes(snapshot.activityTypes)
      setStorageHydrated(true)
    })()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!storageHydrated) return
    void saveEditorState({ transcripts, tags: editorTags, activityTypes })
  }, [transcripts, editorTags, activityTypes, storageHydrated])

  const addActivityType = (candidate: string) => {
    const nextType = String(candidate || '').trim()
    if (!nextType) return
    setActivityTypes((prev) => (prev.includes(nextType) ? prev : [...prev, nextType]))
  }

  const addActivityLog = (transcriptId: string, entry: ActivityLogEntry) => {
    setTranscripts((prev) =>
      prev.map((transcript) =>
        transcript.id === transcriptId
          ? { ...transcript, activityLog: [entry, ...(transcript.activityLog || [])] }
          : transcript,
      ),
    )
  }

  const exportEditorData = () => {
    const payload = stringifyEditorState({ transcripts, tags: editorTags, activityTypes })
    const blob = new Blob([payload], { type: 'application/json' })
    const href = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = href
    anchor.download = `qualiapp-macos-editor-export-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(href)
    setDataTransferStatus('Exported editor data snapshot.')
  }

  const importEditorData = async (file: File) => {
    try {
      const raw = await file.text()
      const parsed = parseImportedEditorState(raw)
      setTranscripts(parsed.transcripts)
      setEditorTags(parsed.tags)
      setActivityTypes(parsed.activityTypes)
      setDataTransferStatus('Imported editor data snapshot.')
    } catch {
      setDataTransferStatus('Import failed: invalid or incompatible snapshot file.')
    }
  }

  const escapeHtmlForDoc = (value: string): string =>
    String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')

  const formatDurationHMS = (totalSeconds: number): string => {
    const safeSeconds = Math.max(0, Math.round(Number(totalSeconds) || 0))
    const hours = Math.floor(safeSeconds / 3600)
    const minutes = Math.floor((safeSeconds % 3600) / 60)
    const seconds = safeSeconds % 60
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }

  const getAudioDurationSeconds = async (audioSource: string): Promise<number> =>
    new Promise((resolve) => {
      if (!audioSource) {
        resolve(0)
        return
      }

      const audio = document.createElement('audio')
      let settled = false

      const finalize = (durationSeconds: number) => {
        if (settled) return
        settled = true
        resolve(Math.max(0, Number(durationSeconds) || 0))
      }

      const timeoutId = window.setTimeout(() => finalize(0), 8000)

      audio.preload = 'metadata'
      audio.src = audioSource
      audio.onloadedmetadata = () => {
        window.clearTimeout(timeoutId)
        finalize(Number.isFinite(audio.duration) ? audio.duration : 0)
      }
      audio.onerror = () => {
        window.clearTimeout(timeoutId)
        finalize(0)
      }
    })

  const exportTranscriptsDoc = async () => {
    if (!transcripts.length) {
      setDataTransferStatus('No transcripts to export yet.')
      return
    }

    try {
      const renderedSections: string[] = []

      for (const transcript of transcripts) {
        const runningTimeSeconds = transcript.audioDataUrl
          ? await getAudioDurationSeconds(transcript.audioDataUrl)
          : Math.max(0, Number(transcript.resumeAudioTimeSec) || 0)

        const transcriptBody = String(transcript.content || '')
        renderedSections.push(`
          <section class="transcript-block">
            <h1>${escapeHtmlForDoc(transcript.title || 'Untitled transcript')}</h1>
            <div class="meta-line"><strong>Folder:</strong> ${escapeHtmlForDoc(transcript.folder || 'Uncategorized')}</div>
            <div class="meta-line"><strong>Total Running Time:</strong> ${formatDurationHMS(runningTimeSeconds)}</div>
            <hr />
            <pre>${escapeHtmlForDoc(transcriptBody || '[No transcript content]')}</pre>
          </section>
        `)
      }

      const exportedAt = new Date()
      const docHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>QualiApp Transcript Export</title>
  <style>
    body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; color: #0f172a; margin: 28px; }
    h1 { font-size: 18pt; margin: 0 0 8px; }
    .meta-line { margin: 3px 0; }
    .transcript-block { margin-bottom: 36px; page-break-after: always; }
    .transcript-block:last-child { page-break-after: auto; }
    pre { white-space: pre-wrap; word-break: break-word; margin-top: 12px; line-height: 1.45; }
    hr { border: 0; border-top: 1px solid #cbd5e1; margin: 12px 0 10px; }
  </style>
</head>
<body>
  ${renderedSections.join('\n')}
</body>
</html>`

      const blob = new Blob(['\ufeff', docHtml], { type: 'application/msword' })
      const href = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = href
      anchor.download = `qualiapp-macos-transcripts-${exportedAt.toISOString().slice(0, 10)}.doc`
      anchor.click()
      URL.revokeObjectURL(href)
      setDataTransferStatus('Exported transcripts document.')
    } catch {
      setDataTransferStatus('Transcript export failed.')
    }
  }

  const handleCreateTranscript = (data: { title: string; folder?: string }) => {
    const now = Date.now()
    const newTranscript: TranscriptRecord = {
      id: `tx_${now}`,
      title: data.title.trim(),
      content: '',
      folder: data.folder?.trim() || undefined,
      notes: '',
      activityLog: [{
        id: `log_${now}`,
        type: 'Created',
        note: 'Transcript initialized.',
        timestamp: new Date().toISOString(),
      }],
    }
    setTranscripts((prev) => [newTranscript, ...prev])
    setActiveTranscriptId(newTranscript.id)
  }

  const handleDeleteTranscript = (transcriptId: string) => {
    setTranscripts((prev) => prev.filter((t) => t.id !== transcriptId))
    setEditorTags((prev) => prev.filter((tag) => tag.transcriptId !== transcriptId))
    if (activeTranscriptId === transcriptId) setActiveTranscriptId(null)
  }

  const handleRenameTranscript = (transcriptId: string, title: string) => {
    const cleanedTitle = title.trim()
    if (!cleanedTitle) return
    setTranscripts((prev) =>
      prev.map((t) => (t.id === transcriptId ? { ...t, title: cleanedTitle } : t)),
    )
  }

  const handleDuplicateTranscript = (transcriptId: string) => {
    const sourceTranscript = transcripts.find((transcript) => transcript.id === transcriptId)
    if (!sourceTranscript) return

    const copyId = `tx_${Date.now()}`
    const copyTitle = sourceTranscript.title.trim()
      ? `Copy of ${sourceTranscript.title.trim()}`
      : 'Copy of Untitled transcript'
    const copiedTranscript: TranscriptRecord = {
      ...sourceTranscript,
      id: copyId,
      title: copyTitle,
      activityLog: (sourceTranscript.activityLog || []).map((entry, index) => ({
        ...entry,
        id: `log_${Date.now()}_${index}`,
      })),
    }

    const copiedTags = editorTags
      .filter((tag) => tag.transcriptId === transcriptId)
      .map((tag, index) => ({
        ...tag,
        id: `tag_${Date.now()}_${index}`,
        transcriptId: copyId,
      }))

    setTranscripts((prev) => [copiedTranscript, ...prev])
    setEditorTags((prev) => [...copiedTags, ...prev])
    setActiveTranscriptId(copyId)
  }

  const editorSummary = useMemo(() => {
    const categoryCount = new Set(editorTags.map((tag) => tag.category).filter(Boolean)).size
    return {
      transcriptCount: transcripts.length,
      codeCount: editorTags.length,
      categoryCount,
    }
  }, [transcripts, editorTags])

  const currentView = views.find((view) => view.id === activeView) ?? views[0]

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="traffic-lights" aria-hidden="true">
          <span className="traffic-light traffic-light-close" />
          <span className="traffic-light traffic-light-minimize" />
          <span className="traffic-light traffic-light-expand" />
        </div>
        <div className="sidebar-header">
          <p className="eyebrow">QualiApp Native</p>
          <h1>macOS track</h1>
          <p className="supporting-text">
            Parallel workspace for the desktop app. Legacy root files remain untouched.
          </p>
        </div>

        <nav className="nav-list" aria-label="Primary">
          {views.map((view) => (
            <button
              key={view.id}
              type="button"
              className={`nav-item ${view.id === activeView ? 'nav-item-active' : ''}`}
              onClick={() => {
                setActiveView(view.id)
                setActiveTranscriptId(null)
              }}
            >
              <span className="nav-item-label">{view.label}</span>
              <span className="nav-item-meta">{view.eyebrow}</span>
            </button>
          ))}
        </nav>

        <section className="sidebar-card">
          <p className="sidebar-card-title">Migration guardrails</p>
          <ul className="sidebar-list">
            <li>Root app stays unchanged during macOS implementation.</li>
            <li>Storage compatibility remains local-first and offline-first.</li>
            <li>Windows support stays planning-only until macOS stabilizes.</li>
          </ul>
        </section>
      </aside>

      <main className="main-stage">
        <header className="topbar">
          <div>
            <p className="eyebrow">{currentView.eyebrow}</p>
            <h2>{currentView.title}</h2>
          </div>
          <div className="status-pill">Build-ready scaffold</div>
        </header>

        {activeView !== 'transcripts' && (
          <section className="hero-panel">
            <div>
              <p className="hero-kicker">{currentView.label}</p>
              <p className="hero-copy">{currentView.body}</p>
            </div>
            <div className="hero-metrics" aria-label="Implementation status">
              <article>
                <span>Track</span>
                <strong>macOS first</strong>
              </article>
              <article>
                <span>Updates</span>
                <strong>Patchable</strong>
              </article>
              <article>
                <span>Storage</span>
                <strong>IndexedDB parity</strong>
              </article>
              <article>
                <span>Migrated tags</span>
                <strong>{editorSummary.codeCount}</strong>
              </article>
            </div>
          </section>
        )}

        {activeView === 'transcripts' && activeTranscriptId === null && (
          <TranscriptDashboard
            transcripts={transcripts}
            onExportTranscripts={exportTranscriptsDoc}
            onOpen={(id) => setActiveTranscriptId(id)}
            onCreate={handleCreateTranscript}
            onDelete={handleDeleteTranscript}
            onRename={handleRenameTranscript}
          />
        )}

        {activeView === 'transcripts' && activeTranscriptId !== null && (
          <div className="workspace-grid">
            <TranscriptWorkspace
              transcripts={transcripts}
              tags={editorTags}
              activityTypes={activityTypes}
              initialActiveTranscriptId={activeTranscriptId}
              onBack={() => setActiveTranscriptId(null)}
              onDuplicateTranscript={handleDuplicateTranscript}
              onUpdateTranscript={(updatedTranscript) =>
                setTranscripts((prev) =>
                  prev.map((transcript) =>
                    transcript.id === updatedTranscript.id ? { ...transcript, ...updatedTranscript } : transcript,
                  ),
                )
              }
              onAddTag={(tag) => setEditorTags((prev) => [tag, ...prev])}
              onUpdateTag={(updatedTag) =>
                setEditorTags((prev) => prev.map((tag) => (tag.id === updatedTag.id ? updatedTag : tag)))
              }
              onDeleteTag={(tagId) => setEditorTags((prev) => prev.filter((tag) => tag.id !== tagId))}
              onAddActivityType={addActivityType}
              onAddActivityLog={addActivityLog}
              onExportData={exportEditorData}
              onImportData={importEditorData}
              dataTransferStatus={dataTransferStatus}
            />
            <PomodoroWidget />
          </div>
        )}

        {activeView !== 'transcripts' && (
          <div className="workspace-grid" style={{ gridTemplateColumns: '1fr' }}>
            <PomodoroWidget />
          </div>
        )}
      </main>
    </div>
  )
}

export default App
