export type TranscriptMode = 'edit' | 'code' | 'review'

export type TranscriptRecord = {
  id: string
  title: string
  content: string
  notes?: string
  folder?: string
  audioName?: string
  audioDataUrl?: string
  playbackRate?: number
  resumeAudioTimeSec?: number
  activityLog?: ActivityLogEntry[]
}

export type ActivityLogEntry = {
  id: string
  type: string
  note: string
  timestamp: string
}

export type EditorTagRecord = {
  id: string
  transcriptId: string
  category: string
  tagName: string
  memo: string
  textSnippet: string
  start: number
  end: number
}

export type PendingSelection = {
  text: string
  start: number
  end: number
}

export const defaultActivityTypes = ['Edited', 'First Review', 'Coded', 'Member Checked']

export const defaultTranscripts: TranscriptRecord[] = [
  {
    id: 'tx_1',
    title: 'Interview 01',
    content:
      'I needed the code label to use the participant exact phrase, otherwise it stopped feeling trustworthy. When we stayed close to participant wording, review feedback cycles were shorter. The right panel should appear only in code mode to keep reading focused.',
    notes: 'Interview focused on trust in coding labels and reproducibility of reviewer feedback.',
    activityLog: [
      {
        id: 'tx1_log_1',
        type: 'Created',
        note: 'Transcript initialized in macOS parity workspace.',
        timestamp: '2026-01-04T09:00:00.000Z',
      },
    ],
  },
  {
    id: 'tx_2',
    title: 'Interview 02',
    content:
      'Participants described timeline pressure and confidence shifts over the week. Keeping labels tied to highlighted excerpts helped auditors retrace coding decisions quickly.',
    notes: 'Mentions confidence shifts and timeline pressure as recurring themes.',
    activityLog: [
      {
        id: 'tx2_log_1',
        type: 'Created',
        note: 'Transcript initialized in macOS parity workspace.',
        timestamp: '2026-01-05T10:15:00.000Z',
      },
    ],
  },
]
