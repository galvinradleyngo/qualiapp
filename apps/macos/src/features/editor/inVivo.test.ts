import { describe, expect, it } from 'vitest'

import { evaluateInVivoAlignment, getInVivoSourceText } from './inVivo'

describe('in-vivo source lookup', () => {
  it('prefers pending selection text', () => {
    const source = getInVivoSourceText({
      pendingSelectionText: 'Participant quote',
      editingTagId: 'tag_1',
      tags: [{ id: 'tag_1', textSnippet: 'Older quote' }],
    })

    expect(source).toBe('Participant quote')
  })

  it('falls back to editing tag snippet', () => {
    const source = getInVivoSourceText({
      editingTagId: 'tag_1',
      tags: [{ id: 'tag_1', textSnippet: 'Fallback quote text' }],
    })

    expect(source).toBe('Fallback quote text')
  })
})

describe('in-vivo alignment', () => {
  it('passes when label appears directly in source', () => {
    const result = evaluateInVivoAlignment('trustworthy wording', 'The participant used trustworthy wording repeatedly.')
    expect(result.passes).toBe(true)
  })

  it('passes when token overlap is high enough', () => {
    const result = evaluateInVivoAlignment(
      'participant exact phrase',
      'The participant reflected on this exact phrase from the interview.',
    )
    expect(result.passes).toBe(true)
  })

  it('fails when label is unrelated', () => {
    const result = evaluateInVivoAlignment('budget pressure', 'Participant described emotional trust and confidence.')
    expect(result.passes).toBe(false)
  })

  it('fails empty label with guidance', () => {
    const result = evaluateInVivoAlignment('', 'Some quote')
    expect(result.passes).toBe(false)
    expect(result.reason).toContain('Enter a code label')
  })
})
