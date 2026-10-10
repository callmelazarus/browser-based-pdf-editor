import { beforeAll, describe, expect, it } from 'vitest'
import { loadHelvetica } from './helvetica'
import { layoutTextBox, wrapText } from './layout'

beforeAll(loadHelvetica)

describe('wrapText', () => {
  it('keeps short text on one line', () => {
    expect(wrapText('hello world', 12, 100)).toEqual(['hello world'])
  })

  it('wraps at word boundaries', () => {
    expect(wrapText('hello world', 12, 40)).toEqual(['hello', 'world'])
  })

  it('breaks a word that is wider than the box', () => {
    expect(wrapText('WWWWWWWWWW', 12, 50)).toEqual(['WWWW', 'WWWW', 'WW'])
  })

  it('preserves explicit newlines and blank lines', () => {
    expect(wrapText('a\n\nb', 12, 100)).toEqual(['a', '', 'b'])
  })

  it('does not hang or throw when the box is narrower than any glyph', () => {
    expect(wrapText('abc', 12, 0)).toEqual(['a', 'b', 'c'])
  })

  it('replaces unsupported characters instead of throwing', () => {
    expect(wrapText('hi 😀', 12, 100)).toEqual(['hi ?'])
  })
})

describe('layoutTextBox', () => {
  it('places baselines below the frame top, one line height apart', () => {
    const { baselines } = layoutTextBox('a\nb', 10, 100, 100)
    expect(baselines[0]).toBeCloseTo(2 + 8.5)
    expect(baselines[1] - baselines[0]).toBeCloseTo(12)
  })

  it('flags text that does not fit the box height', () => {
    expect(layoutTextBox('a\nb\nc\nd\ne\nf', 14, 100, 30).overflows).toBe(true)
    expect(layoutTextBox('a', 14, 100, 48).overflows).toBe(false)
  })

  it('treats empty text as one blank line that fits', () => {
    const r = layoutTextBox('', 14, 160, 48)
    expect(r.lines).toEqual([''])
    expect(r.overflows).toBe(false)
  })
})
