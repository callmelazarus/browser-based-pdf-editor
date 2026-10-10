import type { Point, Rect, Rotation } from '../model/types'

export type Matrix = readonly [number, number, number, number, number, number]

/**
 * A screen-oriented coordinate frame for a rect: (0,0) is the lower-left of the box as seen
 * on screen, x runs right, y runs up. `matrix` maps frame coordinates into PDF user space.
 * `width`/`height` are the box dimensions as seen on screen (swapped for 90/270).
 */
export interface Frame {
  matrix: Matrix
  width: number
  height: number
}

export function screenFrame(rect: Rect, rotation: Rotation): Frame {
  const { x, y, width: w, height: h } = rect
  switch (rotation) {
    case 0: return { matrix: [1, 0, 0, 1, x, y], width: w, height: h }
    case 90: return { matrix: [0, 1, -1, 0, x + w, y], width: h, height: w }
    case 180: return { matrix: [-1, 0, 0, -1, x + w, y + h], width: w, height: h }
    case 270: return { matrix: [0, -1, 1, 0, x, y + h], width: h, height: w }
  }
}

export function applyMatrix(m: Matrix, p: Point): Point {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] }
}
