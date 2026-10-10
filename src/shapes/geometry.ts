import type { Point } from '../model/types'

export type BBox = [number, number, number, number]

export function arrowHeadLength(strokeWidth: number): number {
  return Math.max(8, strokeWidth * 4)
}

const HEAD_ANGLE = Math.PI / 7

/** The two barb end-points of an open arrowhead whose tip is `to`. Works in any planar coordinate system. */
export function arrowHeadPoints(from: Point, to: Point, length: number): [Point, Point] {
  const angle = Math.atan2(to.y - from.y, to.x - from.x)
  const at = (offset: number): Point => ({
    x: to.x - length * Math.cos(angle + offset),
    y: to.y - length * Math.sin(angle + offset),
  })
  return [at(HEAD_ANGLE), at(-HEAD_ANGLE)]
}

export function boundsOfPoints(points: readonly Point[]): BBox {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const p of points) {
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y)
    x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y)
  }
  return [x0, y0, x1, y1]
}

export function padBounds(b: BBox, pad: number): BBox {
  return [b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad]
}
