import { useMemo, useState, type FormEvent } from 'react'
import type { TranscriptRecord } from './models'

type TranscriptDashboardProps = {
  transcripts: TranscriptRecord[]
  onOpen: (transcriptId: string) => void
  onCreate: (data: { title: string; folder?: string }) => void
  onDelete: (transcriptId: string) => void
  onRename: (transcriptId: string, title: string) => void
}

export function TranscriptDashboard({ transcripts, onOpen, onCreate, onDelete, onRename }: TranscriptDashboardProps) {
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
        <button type="button" className="code-action" onClick={() => setShowNewForm((prev) => !prev)}>
          {showNewForm ? 'Cancel' : '+ New transcript'}
        </button>
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
            <p className="hint" style={{ marginBottom: '8px', fontWeight: 600 }}>
              {folder}
            </p>
            <div className="code-list">
              {grouped[folder].map((transcript) => (
                <article className="code-item" key={transcript.id}>
                  <span className="code-dot" aria-hidden="true" />
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
                  <div className="code-toolbar">
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
                        className="code-action"
                        onClick={() => {
                          setRenamingId(transcript.id)
                          setRenameValue(transcript.title)
                        }}
                      >
                        Rename
                      </button>
                    )}
                    <button
                      type="button"
                      className="code-action"
                      onClick={() => {
                        if (window.confirm(`Delete "${transcript.title}"? This cannot be undone.`)) {
                          onDelete(transcript.id)
                        }
                      }}
                    >
                      Delete
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
