import { useMemo, useState, type FormEvent } from 'react'
import type { TranscriptRecord } from './models'

type TranscriptDashboardProps = {
  transcripts: TranscriptRecord[]
  onExportTranscripts: () => void
  onOpen: (transcriptId: string) => void
  onCreate: (data: { title: string; folder?: string }) => void
  onDelete: (transcriptId: string) => void
  onRename: (transcriptId: string, title: string) => void
}

export function TranscriptDashboard({ transcripts, onExportTranscripts, onOpen, onCreate, onDelete, onRename }: TranscriptDashboardProps) {
  const [showNewForm, setShowNewForm] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newFolder, setNewFolder] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const existingFolders = useMemo(
    () => Array.from(new Set(transcripts.map((t) => t.folder || '').filter(Boolean))).sort(),
    [transcripts],
  )

  const handleCreate = (event: FormEvent) => {
    event.preventDefault()
    if (!newTitle.trim()) return
    onCreate({ title: newTitle.trim(), folder: newFolder.trim() || undefined })
    setNewTitle('')
    setNewFolder('')
    setShowNewForm(false)
  }

  const handleRename = (transcriptId: string) => {
    if (!renameValue.trim()) return
    onRename(transcriptId, renameValue.trim())
    setRenamingId(null)
    setRenameValue('')
  }

  const grouped = useMemo(() => {
    const groups: Record<string, TranscriptRecord[]> = {}
    for (const transcript of transcripts) {
      const folder = transcript.folder || 'Uncategorized'
      if (!groups[folder]) groups[folder] = []
      groups[folder].push(transcript)
    }
    return groups
  }, [transcripts])

  const folderOrder = useMemo(() => {
    const keys = Object.keys(grouped)
    return ['Uncategorized', ...keys.filter((k) => k !== 'Uncategorized').sort()]
  }, [grouped])

  const folderColors = useMemo(() => {
    const colors: Record<string, string> = {}
    const visibleFolders = folderOrder.filter((folder) => grouped[folder]?.length)
    visibleFolders.forEach((folder, index) => {
      const hue = (index * 137.50776405003785) % 360
      colors[folder] = `hsl(${hue.toFixed(2)} 72% 45%)`
    })
    return colors
  }, [folderOrder, grouped])

  return (
    <section className="workspace-panel" aria-labelledby="transcript-dashboard-heading">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Transcripts</p>
          <h3 id="transcript-dashboard-heading">Transcript library</h3>
          <p className="panel-copy">
            {transcripts.length} transcript{transcripts.length !== 1 ? 's' : ''} in this workspace. Open one to start coding.
          </p>
        </div>
        <div className="code-toolbar">
          <button type="button" className="code-action" onClick={onExportTranscripts} disabled={transcripts.length === 0}>
            Export Transcripts
          </button>
          <button type="button" className="code-action" onClick={() => setShowNewForm((prev) => !prev)}>
            {showNewForm ? 'Cancel' : '+ New transcript'}
          </button>
        </div>
      </div>

      {showNewForm && (
        <form onSubmit={handleCreate} className="code-panel" style={{ marginTop: '14px', display: 'grid', gap: '10px' }}>
          <input
            type="text"
            required
            value={newTitle}
            onChange={(event) => setNewTitle(event.target.value)}
            placeholder="Transcript title"
            className="code-action"
            style={{ width: '100%' }}
          />
          <input
            type="text"
            value={newFolder}
            onChange={(event) => setNewFolder(event.target.value)}
            placeholder="Folder (optional)"
            list="dashboard-folders"
            className="code-action"
            style={{ width: '100%' }}
          />
          <datalist id="dashboard-folders">
            {existingFolders.map((folder) => (
              <option key={folder} value={folder} />
            ))}
          </datalist>
          <div className="code-toolbar">
            <button type="submit" className="code-action">
              Create transcript
            </button>
          </div>
        </form>
      )}

      {transcripts.length === 0 && !showNewForm && (
        <p className="hint" style={{ marginTop: '18px' }}>
          No transcripts yet. Create one to start coding.
        </p>
      )}

      {folderOrder
        .filter((folder) => grouped[folder]?.length)
        .map((folder) => (
          <div key={folder} style={{ marginTop: '18px' }}>
            <p className="hint folder-label" style={{ marginBottom: '8px', fontWeight: 600 }}>
              <span
                className="folder-color-swatch"
                aria-hidden="true"
                style={{ backgroundColor: folderColors[folder] }}
              />
              {folder}
            </p>
            <div className="code-list">
              {grouped[folder].map((transcript) => (
                <article className="code-item" key={transcript.id}>
                  <span
                    className="code-dot"
                    aria-hidden="true"
                    style={{ background: folderColors[folder] }}
                  />
                  <div>
                    {renamingId === transcript.id ? (
                      <input
                        type="text"
                        value={renameValue}
                        onChange={(event) => setRenameValue(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') handleRename(transcript.id)
                          if (event.key === 'Escape') {
                            setRenamingId(null)
                            setRenameValue('')
                          }
                        }}
                        className="code-action"
                      />
                    ) : (
                      <strong>{transcript.title}</strong>
                    )}
                    <span>
                      {transcript.activityLog?.length
                        ? `${transcript.activityLog.length} activities`
                        : 'No activity yet'}
                      {transcript.audioName ? ` • ${transcript.audioName}` : ''}
                    </span>
                  </div>
                  <div className="code-toolbar transcript-item-actions">
                    <button type="button" className="code-action" onClick={() => onOpen(transcript.id)}>
                      Open
                    </button>
                    {renamingId === transcript.id ? (
                      <button type="button" className="code-action" onClick={() => handleRename(transcript.id)}>
                        Save
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="code-action icon-action"
                        aria-label={`Rename ${transcript.title}`}
                        title="Rename"
                        onClick={() => {
                          setRenamingId(transcript.id)
                          setRenameValue(transcript.title)
                        }}
                      >
                        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
                          <path
                            d="M4 20h4l10.5-10.5a1.4 1.4 0 0 0 0-2L16.5 5a1.4 1.4 0 0 0-2 0L4 15.5V20zm12.1-12.9 2.8 2.8"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    )}
                    <button
                      type="button"
                      className="code-action icon-action danger-action"
                      aria-label={`Delete ${transcript.title}`}
                      title="Delete"
                      onClick={() => {
                        if (window.confirm(`Delete "${transcript.title}"? This cannot be undone.`)) {
                          onDelete(transcript.id)
                        }
                      }}
                    >
                      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
                        <path
                          d="M4 7h16m-5-3h-6l-1 3h8l-1-3zM7 7l1 13h8l1-13M10 11v6m4-6v6"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        ))}
    </section>
  )
}
