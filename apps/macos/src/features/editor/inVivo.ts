export type InVivoAlignment = {
  passes: boolean
  reason: string
}

export type InVivoSourceContext = {
  pendingSelectionText?: string | null
  editingTagId?: string | null
  tags?: Array<{ id: string; textSnippet?: string | null }>
}

export function getInVivoSourceText(context: InVivoSourceContext): string {
  const pending = String(context.pendingSelectionText || '').trim()
  if (pending) return pending

  const editingId = String(context.editingTagId || '').trim()
  if (!editingId) return ''

  const existing = (context.tags || []).find((tag) => String(tag.id) === editingId)
  return String(existing?.textSnippet || '').trim()
}

export function evaluateInVivoAlignment(label: string, sourceText: string): InVivoAlignment {
  const normalizedLabel = String(label || '').trim().toLowerCase()
  const normalizedSource = String(sourceText || '').trim().toLowerCase()

  if (!normalizedLabel) {
    return { passes: false, reason: 'Enter a code label to run the in-vivo check.' }
  }

  if (!normalizedSource) {
    return { passes: true, reason: 'No highlighted text selected yet.' }
  }

  if (normalizedSource.includes(normalizedLabel)) {
    return { passes: true, reason: 'Label appears directly in the highlighted text.' }
  }

  const labelTokens = normalizedLabel
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2)

  const sourceTokenSet = new Set(
    normalizedSource
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 2),
  )

  if (!labelTokens.length) {
    return { passes: false, reason: 'Use descriptive words from the highlighted text.' }
  }

  const matches = labelTokens.filter((token) => sourceTokenSet.has(token)).length
  const overlapRatio = matches / labelTokens.length

  if (matches > 0 && overlapRatio >= 0.6) {
    return { passes: true, reason: 'Most label words match the highlighted text.' }
  }

  return {
    passes: false,
    reason: 'Label appears unrelated to the highlighted text. Use participant wording for in-vivo coding.',
  }
}
