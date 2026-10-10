import { describe, expect, it } from 'vitest'
import {
  normalizeRotation, rectToViewport, userToViewport, viewportRectToUser, viewportSize, viewportToUser,
  type PageGeometry,
} from './page-space'

const letter = (rotate: PageGeometry['rotate']): PageGeometry => ({ view: [0, 0, 612, 792], rotate })

describe('page-space', () => {
  it('normalizes rotation values', () => {
    expect(normalizeRotation(-90)).toBe(270)
    expect(normalizeRotation(450)).toBe(90)
    expect(normalizeRotation(0)).toBe(0)
  })

  it('sizes the viewport, swapping axes for 90/270', () => {
    expect(viewportSize(letter(0), 2)).toEqual({ width: 1224, height: 1584 })
    expect(viewportSize(letter(90), 1)).toEqual({ width: 792, height: 612 })
    expect(viewportSize(letter(270), 1)).toEqual({ width: 792, height: 612 })
  })

  it('maps user space to a top-left-origin viewport at rotation 0', () => {
    expect(userToViewport(letter(0), 2, { x: 100, y: 700 })).toEqual({ x: 200, y: 184 })
  })

  it('maps the user-space origin to the expected viewport corner for each rotation', () => {
    expect(userToViewport(letter(0), 1, { x: 0, y: 0 })).toEqual({ x: 0, y: 792 })
    expect(userToViewport(letter(90), 1, { x: 0, y: 0 })).toEqual({ x: 0, y: 0 })
    expect(userToViewport(letter(180), 1, { x: 0, y: 0 })).toEqual({ x: 612, y: 0 })
    expect(userToViewport(letter(270), 1, { x: 0, y: 0 })).toEqual({ x: 792, y: 612 })
  })

  it('honours a crop box that does not start at the origin', () => {
    const g: PageGeometry = { view: [10, 20, 310, 420], rotate: 0 }
    expect(userToViewport(g, 1, { x: 10, y: 420 })).toEqual({ x: 0, y: 0 })
    expect(userToViewport(g, 1, { x: 310, y: 20 })).toEqual({ x: 300, y: 400 })
  })

  it('honours a non-zero crop origin for rotated pages (literal forward values)', () => {
    const at = (rotate: PageGeometry['rotate']): PageGeometry => ({ view: [10, 20, 310, 420], rotate })
    // 90: viewport 400x300; bottom-left of crop box -> top-left, top-right -> bottom-right
    expect(userToViewport(at(90), 1, { x: 10, y: 20 })).toEqual({ x: 0, y: 0 })
    expect(userToViewport(at(90), 1, { x: 310, y: 420 })).toEqual({ x: 400, y: 300 })
    // 180: viewport 300x400; bottom-right of crop box -> top-left, top-left -> bottom-right
    expect(userToViewport(at(180), 1, { x: 310, y: 20 })).toEqual({ x: 0, y: 0 })
    expect(userToViewport(at(180), 1, { x: 10, y: 420 })).toEqual({ x: 300, y: 400 })
    // 270: viewport 400x300; top-left of crop box -> bottom-left, bottom-right -> top-right
    expect(userToViewport(at(270), 1, { x: 10, y: 420 })).toEqual({ x: 0, y: 300 })
    expect(userToViewport(at(270), 1, { x: 310, y: 20 })).toEqual({ x: 400, y: 0 })
  })

  it('round-trips points for every rotation, crop box and scale', () => {
    for (const rotate of [0, 90, 180, 270] as const) {
      const g: PageGeometry = { view: [10, 20, 310, 420], rotate }
      const p = { x: 123.5, y: 77.25 }
      const back = viewportToUser(g, 1.5, userToViewport(g, 1.5, p))
      expect(back.x).toBeCloseTo(p.x, 6)
      expect(back.y).toBeCloseTo(p.y, 6)
    }
  })

  it('converts rects to a normalized viewport rect and back', () => {
    const r = { x: 100, y: 600, width: 200, height: 50 }
    expect(rectToViewport(letter(0), 1, r)).toEqual({ x: 100, y: 142, width: 200, height: 50 })
    for (const rotate of [0, 90, 180, 270] as const) {
      const g = letter(rotate)
      const back = viewportRectToUser(g, 2, rectToViewport(g, 2, r))
      expect(back.x).toBeCloseTo(r.x, 6)
      expect(back.y).toBeCloseTo(r.y, 6)
      expect(back.width).toBeCloseTo(r.width, 6)
      expect(back.height).toBeCloseTo(r.height, 6)
    }
  })
})
