import { describe, expect, it } from 'vitest'
import { nextZoom } from './zoom'

describe('nextZoom', () => {
  it('steps through the preset levels', () => {
    expect(nextZoom(1, 1)).toBe(1.25)
    expect(nextZoom(1, -1)).toBe(0.75)
  })
  it('clamps at the ends', () => {
    expect(nextZoom(3, 1)).toBe(3)
    expect(nextZoom(0.5, -1)).toBe(0.5)
  })
  it('moves to the next preset from an arbitrary fit-to-width value', () => {
    expect(nextZoom(1.1, 1)).toBe(1.25)
    expect(nextZoom(1.1, -1)).toBe(1)
  })
})
