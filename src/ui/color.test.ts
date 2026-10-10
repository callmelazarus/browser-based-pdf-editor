import { describe, expect, it } from 'vitest'
import { css, hexToRgb, rgbToHex } from './color'

describe('color', () => {
  it('round-trips hex', () => {
    expect(rgbToHex(hexToRgb('#e53935'))).toBe('#e53935')
  })
  it('formats CSS rgb()', () => {
    expect(css({ r: 1, g: 0, b: 0.5 })).toBe('rgb(255, 0, 128)')
  })
})
