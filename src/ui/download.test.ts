import { describe, expect, it } from 'vitest'
import { annotatedFileName } from './download'

describe('annotatedFileName', () => {
  it('adds -annotated before the extension', () => {
    expect(annotatedFileName('report.pdf')).toBe('report-annotated.pdf')
    expect(annotatedFileName('Report.PDF')).toBe('Report-annotated.pdf')
  })
  it('handles names without an extension or with only an extension', () => {
    expect(annotatedFileName('report')).toBe('report-annotated.pdf')
    expect(annotatedFileName('.pdf')).toBe('document-annotated.pdf')
  })
})
