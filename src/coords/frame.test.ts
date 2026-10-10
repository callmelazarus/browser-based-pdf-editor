import { describe, expect, it } from 'vitest'
import { applyMatrix, screenFrame } from './frame'
import { rectToViewport, userToViewport, type PageGeometry } from './page-space'

describe('screenFrame', () => {
  const rect = { x: 100, y: 200, width: 50, height: 30 }

  it('swaps width and height for 90/270', () => {
    expect(screenFrame(rect, 0)).toMatchObject({ width: 50, height: 30 })
    expect(screenFrame(rect, 90)).toMatchObject({ width: 30, height: 50 })
    expect(screenFrame(rect, 180)).toMatchObject({ width: 50, height: 30 })
    expect(screenFrame(rect, 270)).toMatchObject({ width: 30, height: 50 })
  })

  it('uses the standard rotation matrices', () => {
    expect(screenFrame(rect, 0).matrix).toEqual([1, 0, 0, 1, 100, 200])
    expect(screenFrame(rect, 90).matrix).toEqual([0, 1, -1, 0, 150, 200])
    expect(screenFrame(rect, 180).matrix).toEqual([-1, 0, 0, -1, 150, 230])
    expect(screenFrame(rect, 270).matrix).toEqual([0, -1, 1, 0, 100, 230])
  })

  it('agrees with the viewport conversion: the frame top-left and bottom-right land on the viewport rect corners', () => {
    for (const rotate of [0, 90, 180, 270] as const) {
      const g: PageGeometry = { view: [0, 0, 612, 792], rotate }
      const frame = screenFrame(rect, rotate)
      const rv = rectToViewport(g, 1, rect)
      const topLeft = userToViewport(g, 1, applyMatrix(frame.matrix, { x: 0, y: frame.height }))
      const bottomRight = userToViewport(g, 1, applyMatrix(frame.matrix, { x: frame.width, y: 0 }))
      expect(topLeft).toEqual({ x: rv.x, y: rv.y })
      expect(bottomRight).toEqual({ x: rv.x + rv.width, y: rv.y + rv.height })
    }
  })
})
