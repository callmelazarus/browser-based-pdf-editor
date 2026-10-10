import { describe, expect, it } from 'vitest'
import { findUnsupportedChars, sanitizeText, toPdfLiteral } from './winansi'

describe('winansi', () => {
  it('accepts ASCII, Latin-1 and common WinAnsi punctuation', () => {
    expect(findUnsupportedChars('Hello café “quoted” — 5€ …')).toEqual([])
  })

  it('reports unsupported characters once each, ignoring whitespace controls', () => {
    expect(findUnsupportedChars('a 😀 b 😀 日本\t\n')).toEqual(['😀', '日', '本'])
  })

  it('sanitizes line endings, tabs and unsupported characters', () => {
    expect(sanitizeText('a\r\nb\rc\td😀')).toBe('a\nb\nc d?')
  })

  it('escapes parentheses and backslashes in PDF literals', () => {
    expect(toPdfLiteral('a(b)c\\d')).toBe('(a\\(b\\)c\\\\d)')
  })

  it('encodes non-ASCII characters as octal WinAnsi codes', () => {
    expect(toPdfLiteral('é')).toBe('(\\351)')
    expect(toPdfLiteral('“')).toBe('(\\223)')
    expect(toPdfLiteral('€')).toBe('(\\200)')
  })
})
