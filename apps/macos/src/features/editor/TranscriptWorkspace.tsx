import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'

import { evaluateInVivoAlignment, getInVivoSourceText } from './inVivo'
import type { ActivityLogEntry, EditorTagRecord, PendingSelection, TranscriptMode, TranscriptRecord } from './models'

type TranscriptSegment = {
  id: string
  text: string
  tag: EditorTagRecord | null
  isPending: boolean
}

type TranscriptWorkspaceProps = {
  transcripts: TranscriptRecord[]
  tags: EditorTagRecord[]
  activityTypes: string[]
  initialActiveTranscriptId?: string
  onBack?: () => void
  onUpdateTranscript: (transcript: TranscriptRecord) => void
  onAddTag: (tag: EditorTagRecord) => void
  onUpdateTag: (tag: EditorTagRecord) => void
  onDeleteTag: (tagId: string) => void
  onAddActivityType: (activityType: string) => void
  onAddActivityLog: (transcriptId: string, entry: ActivityLogEntry) => void
  onExportData: () => void
  onImportData: (file: File) => Promise<void>
  dataTransferStatus: string
}

const checkpoints = [
  'Code panel appears only in code mode',
  'In-vivo toggle enables validation gate',
  'Save is blocked on failed in-vivo alignment',
  'Source text resolves from selection or edited tag',
  'Audio upload/playback/resume is persisted per transcript',
  'In-vivo code labels display with double quotes across UI and exports',
  'Categorization supports alphabetical sort and manual ordering with row spacing',
]

export function TranscriptWorkspace({
  transcripts,
  tags,
  activityTypes,
  initialActiveTranscriptId,
  onBack,
  onUpdateTranscript,
  onAddTag,
  onUpdateTag,
  onDeleteTag,
  onAddActivityType,
  onAddActivityLog,
  onExportData,
  onImportData,
  dataTransferStatus,
}: TranscriptWorkspaceProps) {
  const [mode, setMode] = useState<TranscriptMode>('code')
  const [inVivoMode, setInVivoMode] = useState(true)
  const [activeTranscriptId, setActiveTranscriptId] = useState<string>(
    initialActiveTranscriptId || transcripts[0]?.id || ''
  )
  const [pendingSelection, setPendingSelection] = useState<PendingSelection | null>(null)
  const [editingTagId, setEditingTagId] = useState<string | null>(null)
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null)
  const [tagFormCategory, setTagFormCategory] = useState('')
  const [tagFormName, setTagFormName] = useState('')
  const [tagFormMemo, setTagFormMemo] = useState('')
  const speedSteps = [0.5, 0.75, 1, 1.25, 1.5, 2]

  const [logType, setLogType] = useState('')
  const [logNote, setLogNote] = useState('')
  const [transcriptDraftContent, setTranscriptDraftContent] = useState('')
  const [transcriptDraftNotes, setTranscriptDraftNotes] = useState('')
  const [playbackRate, setPlaybackRate] = useState(1)
  const [isImportingData, setIsImportingData] = useState(false)
  const [checkpointLog, setCheckpointLog] = useState<string[]>([])

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const transcriptSelectionRef = useRef<HTMLDivElement | null>(null)

  const activeTranscript = useMemo(
    () => transcripts.find((transcript) => transcript.id === activeTranscriptId) || transcripts[0] || null,
    [transcripts, activeTranscriptId],
  )

  const transcriptTags = useMemo(
    () => tags.filter((tag) => tag.transcriptId === activeTranscript?.id),
    [tags, activeTranscript?.id],
  )

  const activityLog = activeTranscript?.activityLog || []

  useEffect(() => {
    setTranscriptDraftContent(activeTranscript?.content || '')
    setTranscriptDraftNotes(activeTranscript?.notes || '')
    setPlaybackRate(activeTranscript?.playbackRate || 1)
  }, [activeTranscript?.id, activeTranscript?.content, activeTranscript?.notes, activeTranscript?.playbackRate])

  useEffect(() => {
    if (initialActiveTranscriptId) {
      setActiveTranscriptId(initialActiveTranscriptId)
      setEditingTagId(null)
      setSelectedTagId(null)
      setPendingSelection(null)
      setTagFormCategory('')
      setTagFormName('')
      setTagFormMemo('')
    }
  }, [initialActiveTranscriptId])

  useEffect(() => {
    if (!audioRef.current) return
    audioRef.current.playbackRate = playbackRate
  }, [playbackRate, activeTranscript?.audioDataUrl])

  useEffect(() => {
    if (!audioRef.current) return
    if (!activeTranscript?.audioDataUrl) return

    const node = audioRef.current
    const target = Math.max(0, Number(activeTranscript.resumeAudioTimeSec || 0))
    if (target <= 0) return

    const applyResume = () => {
      try {
        if (Number.isFinite(node.duration) && target > node.duration) {
          node.currentTime = Math.max(0, node.duration - 0.25)
        } else {
          node.currentTime = target
        }
      } catch {
        // Ignore metadata timing issues.
      }
    }

    node.addEventListener('loadedmetadata', applyResume, { once: true })
    if (node.readyState >= 1) applyResume()

    return () => node.removeEventListener('loadedmetadata', applyResume)
  }, [activeTranscript?.id, activeTranscript?.audioDataUrl, activeTranscript?.resumeAudioTimeSec])

  const updateActiveTranscript = (partial: Partial<TranscriptRecord>) => {
    if (!activeTranscript) return
    onUpdateTranscript({ ...activeTranscript, ...partial })
  }

  const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = () => reject(reader.error || new Error('Unable to read selected audio file.'))
      reader.readAsDataURL(file)
    })

  const handleAudioUpload = async (event: FormEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    const file = input.files?.[0]
    input.value = ''
    if (!file) return

    try {
      const dataUrl = await readFileAsDataUrl(file)
      updateActiveTranscript({
        audioName: file.name,
        audioDataUrl: dataUrl,
        resumeAudioTimeSec: 0,
        playbackRate: 1,
      })
      setPlaybackRate(1)
      appendCheckpoint('Attached audio to transcript.')
    } catch {
      appendCheckpoint('Audio import failed for selected file.')
    }
  }

  const persistAudioResume = () => {
    if (!audioRef.current) return
    updateActiveTranscript({
      resumeAudioTimeSec: Number((audioRef.current.currentTime || 0).toFixed(2)),
      playbackRate,
    })
  }

  const changePlaybackRate = (direction: 'up' | 'down') => {
    const currentIndex = speedSteps.findIndex((step) => step >= playbackRate)
    const safeIndex = currentIndex === -1 ? speedSteps.length - 1 : currentIndex
    const targetIndex = direction === 'up'
      ? Math.min(speedSteps.length - 1, safeIndex + 1)
      : Math.max(0, safeIndex - 1)
    const nextRate = speedSteps[targetIndex]
    if (nextRate === playbackRate) return
    setPlaybackRate(nextRate)
    updateActiveTranscript({ playbackRate: nextRate })
  }

  const resetPlaybackRate = () => {
    if (playbackRate === 1) return
    setPlaybackRate(1)
    updateActiveTranscript({ playbackRate: 1 })
  }

  const removeAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    updateActiveTranscript({
      audioName: '',
      audioDataUrl: '',
      resumeAudioTimeSec: 0,
      playbackRate: 1,
    })
    setPlaybackRate(1)
    appendCheckpoint('Removed audio from transcript.')
  }

  const transcriptContent = String(activeTranscript?.content || '')

  const normalizedTranscriptTags = useMemo(() => {
    const max = transcriptContent.length
    if (!max) return []

    return transcriptTags
      .map((tag) => {
        const boundedStart = Math.min(max, Math.max(0, Number(tag.start) || 0))
        const boundedEnd = Math.min(max, Math.max(0, Number(tag.end) || 0))
        if (boundedEnd <= boundedStart) return null
        return {
          ...tag,
          start: boundedStart,
          end: boundedEnd,
        }
      })
      .filter((tag): tag is EditorTagRecord => !!tag)
      .sort((a, b) => a.start - b.start || a.end - b.end)
  }, [transcriptTags, transcriptContent])

  const transcriptSegments = useMemo<TranscriptSegment[]>(() => {
    if (!transcriptContent) return []

    const boundaries = new Set<number>([0, transcriptContent.length])
    for (const tag of normalizedTranscriptTags) {
      boundaries.add(tag.start)
      boundaries.add(tag.end)
    }
    if (pendingSelection && pendingSelection.end > pendingSelection.start) {
      const start = Math.min(transcriptContent.length, Math.max(0, pendingSelection.start))
      const end = Math.min(transcriptContent.length, Math.max(0, pendingSelection.end))
      boundaries.add(start)
      boundaries.add(end)
    }

    const points = Array.from(boundaries).sort((a, b) => a - b)
    const segments: TranscriptSegment[] = []

    for (let index = 0; index < points.length - 1; index += 1) {
      const start = points[index]
      const end = points[index + 1]
      if (end <= start) continue

      const text = transcriptContent.slice(start, end)
      if (!text) continue

      const owningTag = normalizedTranscriptTags.find((tag) => start >= tag.start && end <= tag.end) || null
      const isPending =
        !!pendingSelection &&
        start >= pendingSelection.start &&
        end <= pendingSelection.end &&
        pendingSelection.end > pendingSelection.start

      segments.push({
        id: `segment_${index}_${start}_${end}`,
        text,
        tag: owningTag,
        isPending,
      })
    }

    return segments
  }, [normalizedTranscriptTags, pendingSelection, transcriptContent])

  const sourceText = getInVivoSourceText({
    pendingSelectionText: pendingSelection?.text,
    editingTagId,
    tags: transcriptTags,
  })

  const inVivoAlignment = inVivoMode ? evaluateInVivoAlignment(tagFormName, sourceText) : null

  const existingCategories = useMemo(
    () => Array.from(new Set(tags.map((tag) => tag.category).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [tags],
  )

  const existingCodes = useMemo(
    () => Array.from(new Set(tags.map((tag) => tag.tagName).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [tags],
  )

  const appendCheckpoint = (message: string) => {
    setCheckpointLog((prev) => [message, ...prev].slice(0, 6))
  }

  const captureSelectionFromTranscript = () => {
    if (mode !== 'code') return
    const container = transcriptSelectionRef.current
    if (!container) return

    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return

    const range = selection.getRangeAt(0)
    if (!container.contains(range.commonAncestorContainer)) return

    const selectedText = range.toString()
    if (!selectedText.trim()) return

    const preRange = range.cloneRange()
    preRange.selectNodeContents(container)
    preRange.setEnd(range.startContainer, range.startOffset)

    let start = preRange.toString().length
    let end = start + selectedText.length

    const leadingWhitespace = selectedText.match(/^\s*/)?.[0].length || 0
    const trailingWhitespace = selectedText.match(/\s*$/)?.[0].length || 0
    start += leadingWhitespace
    end -= trailingWhitespace

    const boundedStart = Math.min(transcriptContent.length, Math.max(0, start))
    const boundedEnd = Math.min(transcriptContent.length, Math.max(0, end))
    if (boundedEnd <= boundedStart) return

    const text = transcriptContent.slice(boundedStart, boundedEnd)
    setMode('code')
    setPendingSelection({
      text,
      start: boundedStart,
      end: boundedEnd,
    })
    setEditingTagId(null)
    setSelectedTagId(null)
    appendCheckpoint('Captured text selection for coding.')
    selection.removeAllRanges()
  }

  const resetTagForm = () => {
    setTagFormCategory('')
    setTagFormName('')
    setTagFormMemo('')
    setEditingTagId(null)
    setSelectedTagId(null)
    setPendingSelection(null)
  }

  const scrollToTagHighlight = (tagId: string) => {
    const container = transcriptSelectionRef.current
    if (!container) return
    const highlight = container.querySelector<HTMLButtonElement>(`[data-tag-id="${tagId}"]`)
    if (!highlight) return
    highlight.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const focusTag = (tag: EditorTagRecord) => {
    setSelectedTagId(tag.id)
    setEditingTagId(null)
    setPendingSelection(null)
    setTagFormCategory('')
    setTagFormName('')
    setTagFormMemo('')
    setMode('code')
    setTimeout(() => scrollToTagHighlight(tag.id), 0)
  }

  const clearAllCodes = () => {
    if (!transcriptTags.length && !pendingSelection && !editingTagId && !selectedTagId) return
    if (!window.confirm('Clear all codes and highlights from this transcript?')) return
    for (const tag of transcriptTags) {
      onDeleteTag(tag.id)
    }
    setPendingSelection(null)
    setEditingTagId(null)
    setSelectedTagId(null)
    setTagFormCategory('')
    setTagFormName('')
    setTagFormMemo('')
    appendCheckpoint('Cleared all transcript codes.')
  }

  const submitTagForm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!tagFormName.trim()) return

    const normalizedCategory = tagFormCategory.trim() || 'Uncategorized'
    const normalizedCode = tagFormName.trim()

    if (inVivoMode) {
      const check = evaluateInVivoAlignment(normalizedCode, sourceText)
      if (!check.passes) {
        appendCheckpoint(`Blocked save: ${check.reason}`)
        return
      }
    }

    if (editingTagId) {
      const existing = transcriptTags.find((tag) => tag.id === editingTagId)
      if (!existing) return
      onUpdateTag({
        ...existing,
        category: normalizedCategory,
        tagName: normalizedCode,
        memo: tagFormMemo.trim(),
      })
      setSelectedTagId(existing.id)
      appendCheckpoint('Updated existing code label.')
    } else if (pendingSelection && activeTranscript) {
      const nextTagId = `tag_${Date.now()}`
      onAddTag({
        id: nextTagId,
        transcriptId: activeTranscript.id,
        category: normalizedCategory,
        tagName: normalizedCode,
        memo: tagFormMemo.trim(),
        textSnippet: pendingSelection.text,
        start: pendingSelection.start,
        end: pendingSelection.end,
      })
      setSelectedTagId(nextTagId)
      appendCheckpoint('Saved code from highlighted quote.')
    }

    resetTagForm()
  }

  const openEditTag = (tag: EditorTagRecord) => {
    setEditingTagId(tag.id)
    setSelectedTagId(tag.id)
    setPendingSelection({ text: tag.textSnippet, start: tag.start, end: tag.end })
    setTagFormCategory(tag.category)
    setTagFormName(tag.tagName)
    setTagFormMemo(tag.memo)
    setMode('code')
  }

  const submitActivityLog = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const normalizedType = logType.trim()
    if (!normalizedType || !activeTranscript) return

    onAddActivityType(normalizedType)
    onAddActivityLog(activeTranscript.id, {
      id: `activity_${Date.now()}`,
      type: normalizedType,
      note: logNote.trim(),
      timestamp: new Date().toISOString(),
    })
    appendCheckpoint('Added transcript activity event.')
    setLogType('')
    setLogNote('')
  }

  const handleImportFile = async (event: FormEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    const file = input.files?.[0]
    input.value = ''
    if (!file) return

    setIsImportingData(true)
    try {
      await onImportData(file)
      appendCheckpoint('Imported editor snapshot data.')
    } finally {
      setIsImportingData(false)
    }
  }

  const saveTranscriptDraft = () => {
    if (!activeTranscript) return
    onUpdateTranscript({
      ...activeTranscript,
      content: transcriptDraftContent,
      notes: transcriptDraftNotes,
    })
    appendCheckpoint('Saved transcript content and notes.')
  }

  const modeButtons: Array<{ id: TranscriptMode; label: string }> = [
    { id: 'edit', label: 'Edit' },
    { id: 'code', label: 'Code' },
    { id: 'review', label: 'Review' },
  ]

  return (
    <section className="workspace-panel" aria-labelledby="transcript-workspace-heading">
      {onBack && (
        <div className="code-toolbar" style={{ marginBottom: '14px' }}>
          <button type="button" className="code-action" onClick={onBack}>
            ← Back to transcripts
          </button>
          <p className="hint">{activeTranscript?.title || ''}</p>
        </div>
      )}

      <div className="panel-header">
        <div>
          <p className="eyebrow">Editor track</p>
          <h3 id="transcript-workspace-heading">Transcript coding workbench</h3>
          <p className="panel-copy">
            First migration target: preserve transcript review, code mode, and in-vivo checks in a native-feeling shell.
          </p>
        </div>
        <div className="segment-row" aria-label="Transcript modes">
          {modeButtons.map((button) => (
            <button
              key={button.id}
              type="button"
              className={mode === button.id ? 'segment-active' : ''}
              onClick={() => {
                setMode(button.id)
                appendCheckpoint(`Switched transcript mode to ${button.label}.`)
              }}
            >
              {button.label}
            </button>
          ))}
        </div>
      </div>

      {!onBack && (
        <div className="code-toolbar" style={{ marginBottom: '10px' }}>
          <select
            className="code-action"
            value={activeTranscript?.id || ''}
            onChange={(event) => {
              setActiveTranscriptId(event.target.value)
              resetTagForm()
              appendCheckpoint('Switched active transcript.')
            }}
          >
            {transcripts.map((transcript) => (
              <option key={transcript.id} value={transcript.id}>
                {transcript.title}
              </option>
            ))}
          </select>
          <p className="hint">Active transcript: {activeTranscript?.title || 'None'}</p>
        </div>
      )}

      <div className="transcript-preview">
        <div className="quote-card">
          <p className="hint">
            {mode === 'code'
              ? 'Select text in the transcript body to create a coded highlight. Click an existing highlight to edit it.'
              : 'Switch to code mode to select transcript text and create inline coded highlights.'}
          </p>
          <div
            ref={transcriptSelectionRef}
            className={mode === 'code' ? 'transcript-surface transcript-surface-selectable' : 'transcript-surface'}
            onMouseUp={captureSelectionFromTranscript}
            onKeyUp={(event) => {
              if (event.key === 'Shift' || event.key.startsWith('Arrow')) captureSelectionFromTranscript()
            }}
            role={mode === 'code' ? 'textbox' : undefined}
            aria-readonly={mode === 'code' ? 'true' : undefined}
            aria-label={mode === 'code' ? 'Transcript coding surface' : undefined}
            tabIndex={mode === 'code' ? 0 : -1}
          >
            {transcriptSegments.length > 0 ? (
              transcriptSegments.map((segment) => {
                if (!segment.tag && !segment.isPending) {
                  return <span key={segment.id}>{segment.text}</span>
                }

                const segmentClassName = segment.tag
                  ? `transcript-highlight transcript-highlight-tagged${selectedTagId === segment.tag.id ? ' transcript-highlight-selected' : ''}`
                  : 'transcript-highlight transcript-highlight-pending'
                const label = segment.tag
                  ? `${segment.tag.tagName} (${segment.tag.category})`
                  : 'Pending selection'

                return (
                  <button
                    key={segment.id}
                    type="button"
                    className={segmentClassName}
                    title={label}
                    data-tag-id={segment.tag ? segment.tag.id : undefined}
                    onClick={() => {
                      if (segment.tag) {
                        if (selectedTagId === segment.tag.id && editingTagId !== segment.tag.id) {
                          openEditTag(segment.tag)
                          appendCheckpoint('Opened code editor from transcript highlight.')
                        } else {
                          focusTag(segment.tag)
                          appendCheckpoint('Focused code from transcript highlight.')
                        }
                      } else {
                        setMode('code')
                      }
                    }}
                  >
                    {segment.text}
                  </button>
                )
              })
            ) : (
              <p className="hint">No transcript text available yet. Add content in edit mode first.</p>
            )}
          </div>
        </div>

        {mode === 'code' && (
          <div className="code-panel">
            <div className="code-toolbar">
              <label className="toggle-chip" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <input
                  type="checkbox"
                  checked={inVivoMode}
                  onChange={(event) => {
                    setInVivoMode(event.target.checked)
                    appendCheckpoint(`In-vivo mode ${event.target.checked ? 'enabled' : 'disabled'}.`)
                  }}
                />
                In-vivo mode
              </label>
              <button
                type="button"
                className="code-action"
                onClick={clearAllCodes}
                disabled={!transcriptTags.length && !pendingSelection && !editingTagId && !selectedTagId}
              >
                Clear codes
              </button>
              <p className="hint">The right code panel appears only when transcript mode is set to Code.</p>
            </div>

            {(pendingSelection || editingTagId) && (
              <form onSubmit={submitTagForm}>
                <p className="hint" style={{ marginBottom: '10px' }}>
                  "{sourceText || 'Select a quote to start coding.'}"
                </p>
                {pendingSelection && !editingTagId && (
                  <p className="hint" style={{ marginBottom: '10px' }}>
                    Selected range: {pendingSelection.start} to {pendingSelection.end}
                  </p>
                )}

                {inVivoMode && inVivoAlignment && (
                  <p className="hint" style={{ marginBottom: '12px' }}>
                    <strong>In-vivo check:</strong> {inVivoAlignment.reason}
                  </p>
                )}

                <input
                  type="text"
                  value={tagFormCategory}
                  onChange={(event) => setTagFormCategory(event.target.value)}
                  placeholder="Parent category"
                  list="editor-categories"
                  className="code-action"
                  style={{ width: '100%', marginBottom: '8px' }}
                />
                <datalist id="editor-categories">
                  {existingCategories.map((category) => (
                    <option key={category} value={category} />
                  ))}
                </datalist>

                <input
                  type="text"
                  value={tagFormName}
                  onChange={(event) => setTagFormName(event.target.value)}
                  placeholder={inVivoMode ? 'Use participant wording from highlighted quote' : 'Code label'}
                  list="editor-codes"
                  className="code-action"
                  style={{ width: '100%', marginBottom: '8px' }}
                />
                <datalist id="editor-codes">
                  {existingCodes.map((code) => (
                    <option key={code} value={code} />
                  ))}
                </datalist>

                <textarea
                  value={tagFormMemo}
                  onChange={(event) => setTagFormMemo(event.target.value)}
                  placeholder="Code memo"
                  className="code-action"
                  style={{ width: '100%', minHeight: '70px', marginBottom: '10px' }}
                />

                <div className="code-toolbar">
                  <button
                    type="submit"
                    className="code-action"
                    title={inVivoMode && inVivoAlignment && !inVivoAlignment.passes ? 'Adjust label to align with highlighted text' : undefined}
                    style={{
                      opacity: inVivoMode && inVivoAlignment && !inVivoAlignment.passes ? 0.6 : 1,
                    }}
                  >
                    {editingTagId ? 'Update code' : 'Save code'}
                  </button>
                  <button type="button" className="code-action" onClick={resetTagForm}>
                    Cancel
                  </button>
                </div>
              </form>
            )}

            <div className="code-list">
              {transcriptTags.map((tag) => (
                <article
                  className={`code-item${selectedTagId === tag.id ? ' code-item-selected' : ''}`}
                  key={tag.id}
                  onClick={() => focusTag(tag)}
                >
                  <span className="code-dot" aria-hidden="true" />
                  <div>
                    <strong>{tag.tagName}</strong>
                    <span>{tag.category} • {tag.textSnippet}</span>
                  </div>
                  <button
                    type="button"
                    className="code-action"
                    onClick={(event) => {
                      event.stopPropagation()
                      openEditTag(tag)
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="code-action"
                    onClick={(event) => {
                      event.stopPropagation()
                      onDeleteTag(tag.id)
                      if (editingTagId === tag.id) {
                        resetTagForm()
                      } else if (selectedTagId === tag.id) {
                        setSelectedTagId(null)
                      }
                      appendCheckpoint('Removed code highlight from transcript.')
                    }}
                  >
                    Remove
                  </button>
                </article>
              ))}

              {transcriptTags.length === 0 && <p className="hint">No saved codes yet. Highlight a quote and save one.</p>}
            </div>
          </div>
        )}

        {mode !== 'code' && (
          <div className="code-panel">
            {mode === 'edit' && (
              <>
                <p className="hint">Edit transcript content and notes in this mode. Code panel remains hidden.</p>

                <div className="code-panel" style={{ marginTop: '10px' }}>
                  <p className="hint">Audio workflow (attach, play, speed, and resume position).</p>
                  {activeTranscript?.audioDataUrl ? (
                    <>
                      <audio
                        ref={audioRef}
                        src={activeTranscript.audioDataUrl}
                        controls
                        onPause={persistAudioResume}
                        onEnded={persistAudioResume}
                        className="code-action"
                        style={{ width: '100%' }}
                      />
                      <p className="hint">
                        {activeTranscript.audioName || 'Attached audio'} • Resume at {Math.floor((activeTranscript.resumeAudioTimeSec || 0) / 60)
                          .toString()
                          .padStart(2, '0')}
                        :{Math.floor((activeTranscript.resumeAudioTimeSec || 0) % 60).toString().padStart(2, '0')}
                      </p>
                      <div className="code-toolbar">
                        <button type="button" className="code-action" onClick={() => changePlaybackRate('down')}>
                          Slower
                        </button>
                        <button type="button" className="code-action" onClick={() => changePlaybackRate('up')}>
                          Faster
                        </button>
                        <button type="button" className="code-action" onClick={resetPlaybackRate}>
                          1x
                        </button>
                        <span className="hint">{playbackRate.toFixed(2).replace(/\.00$/, '')}x</span>
                      </div>
                      <div className="code-toolbar">
                        <button type="button" className="code-action" onClick={persistAudioResume}>
                          Save playback position
                        </button>
                        <button type="button" className="code-action" onClick={removeAudio}>
                          Remove audio
                        </button>
                      </div>
                    </>
                  ) : (
                    <label className="code-action" style={{ display: 'inline-flex', width: 'fit-content' }}>
                      Attach audio
                      <input type="file" accept="audio/*" onInput={handleAudioUpload} style={{ display: 'none' }} />
                    </label>
                  )}
                </div>

                <textarea
                  value={transcriptDraftContent}
                  onChange={(event) => setTranscriptDraftContent(event.target.value)}
                  placeholder="Transcript content"
                  className="code-action"
                  style={{ width: '100%', minHeight: '180px', marginTop: '10px' }}
                />
                <textarea
                  value={transcriptDraftNotes}
                  onChange={(event) => setTranscriptDraftNotes(event.target.value)}
                  placeholder="Analyst notes"
                  className="code-action"
                  style={{ width: '100%', minHeight: '120px' }}
                />
                <div className="code-toolbar">
                  <button type="button" className="code-action" onClick={saveTranscriptDraft}>
                    Save transcript
                  </button>
                </div>
              </>
            )}

            {mode === 'review' && (
              <>
                <p className="hint">Activity timeline migrated from the web editor for transcript review parity.</p>
                <form onSubmit={submitActivityLog} className="code-panel" style={{ marginTop: '10px' }}>
                  <input
                    type="text"
                    required
                    value={logType}
                    onChange={(event) => setLogType(event.target.value)}
                    placeholder="Activity type"
                    list="activity-types"
                    className="code-action"
                    style={{ width: '100%' }}
                  />
                  <datalist id="activity-types">
                    {activityTypes.map((activityType) => (
                      <option key={activityType} value={activityType} />
                    ))}
                  </datalist>
                  <input
                    type="text"
                    value={logNote}
                    onChange={(event) => setLogNote(event.target.value)}
                    placeholder="Details / note (optional)"
                    className="code-action"
                    style={{ width: '100%' }}
                  />
                  <button type="submit" className="code-action">
                    Log activity
                  </button>
                </form>

                <div className="code-list" style={{ marginTop: '10px' }}>
                  {activityLog.map((entry) => (
                    <article key={entry.id} className="code-item">
                      <span className="code-dot" aria-hidden="true" />
                      <div>
                        <strong>{entry.type}</strong>
                        <span>
                          {new Date(entry.timestamp).toLocaleString()}
                          {entry.note ? ` • ${entry.note}` : ''}
                        </span>
                      </div>
                    </article>
                  ))}
                  {activityLog.length === 0 && <p className="hint">No activities logged yet for this transcript.</p>}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <section className="storage-panel" aria-labelledby="storage-compat-heading">
        <div className="storage-row">
          <div>
            <h4 id="storage-compat-heading">Storage compatibility checkpoint</h4>
            <p className="storage-copy">
              Keep legacy local data importable here before any UI cutover or desktop packaging step.
            </p>
          </div>
          <div className="toggle-chip">IndexedDB parity</div>
        </div>
        <div className="storage-row">
          <span>Database strategy</span>
          <strong>Mirror existing local-first schema first</strong>
        </div>
        <div className="storage-row">
          <span>Import path</span>
          <strong>Support backup restore before native-only features</strong>
        </div>
        <div className="storage-row">
          <span>Data transfer</span>
          <div className="code-toolbar">
            <button type="button" className="code-action" onClick={onExportData}>
              Export JSON
            </button>
            <label className="code-action" style={{ display: 'inline-flex' }}>
              {isImportingData ? 'Importing…' : 'Import JSON'}
              <input type="file" accept="application/json" onInput={handleImportFile} style={{ display: 'none' }} />
            </label>
          </div>
        </div>
        <div className="storage-row">
          <span>Parity checkpoints</span>
          <strong>{checkpoints.length} defined</strong>
        </div>
        {dataTransferStatus && <p className="hint" style={{ marginTop: '10px' }}>{dataTransferStatus}</p>}
        <ul className="sidebar-list" style={{ marginTop: '12px' }}>
          {checkpoints.map((checkpoint) => (
            <li key={checkpoint}>{checkpoint}</li>
          ))}
        </ul>
        {checkpointLog.length > 0 && (
          <>
            <p className="sidebar-card-title" style={{ marginTop: '14px' }}>Recent checkpoint events</p>
            <ul className="sidebar-list">
              {checkpointLog.map((event, index) => (
                <li key={`${event}_${index}`}>{event}</li>
              ))}
            </ul>
          </>
        )}
      </section>
    </section>
  )
}
