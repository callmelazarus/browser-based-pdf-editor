import { describe, expect, it } from 'vitest'
import { PdfLoadError, toLoadError } from './pdf-document'

describe('toLoadError', () => {
  it('maps a pdf.js password exception', () => {
    const e = toLoadError(Object.assign(new Error('No password given'), { name: 'PasswordException' }))
    expect(e).toBeInstanceOf(PdfLoadError)
    expect(e.kind).toBe('password')
    expect(e.message).toMatch(/password/i)
  })

  it('maps invalid, format and missing exceptions to "not a valid PDF"', () => {
    for (const name of ['InvalidPDFException', 'FormatError', 'MissingPDFException']) {
      const e = toLoadError(Object.assign(new Error('x'), { name }))
      expect(e.kind).toBe('invalid')
      expect(e.message).toMatch(/valid PDF/)
    }
  })

  it('falls back to a generic message', () => {
    const e = toLoadError(new Error('boom'))
    expect(e.kind).toBe('unknown')
  })
})
