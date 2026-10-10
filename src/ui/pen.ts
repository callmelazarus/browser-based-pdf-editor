import type { Point } from '../model/types'

/** Tolerance (viewport px) for the Ramer-Douglas-Peucker pass applied when a stroke is committed. */
export const PEN_TOLERANCE_PX = 0.5
/** Hard upper bound on the number of points a committed pen stroke may keep. */
export const MAX_PEN_POINTS = 1000

function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/** Iterative Ramer-Douglas-Peucker (no recursion, so very long strokes cannot overflow the stack). */
function rdp(points: readonly Point[], tolerance: number): Point[] {
  const n = points.length
  const keep = new Uint8Array(n)
  keep[0] = 1
  keep[n - 1] = 1
  const stack: [number, number][] = [[0, n - 1]]
  while (stack.length) {
    const [lo, hi] = stack.pop()!
    let worst = -1
    let worstDist = tolerance
    for (let i = lo + 1; i < hi; i++) {
      const d = distToSegment(points[i], points[lo], points[hi])
      if (d > worstDist) {
        worstDist = d
        worst = i
      }
    }
    if (worst >= 0) {
      keep[worst] = 1
      stack.push([lo, worst], [worst, hi])
    }
  }
  return points.filter((_, i) => keep[i] === 1)
}

/**
 * Simplifies a stroke to at most `maxPoints` points. Starts at `tolerance` and doubles it until the
 * result fits; as a last resort it samples evenly. The first and last points are always kept.
 */
export function simplifyStroke(points: readonly Point[], tolerance = PEN_TOLERANCE_PX, maxPoints = MAX_PEN_POINTS): Point[] {
  if (points.length <= 2) return [...points]
  let tol = tolerance
  for (let i = 0; i < 12; i++, tol *= 2) {
    const out = rdp(points, tol)
    if (out.length <= maxPoints) return out
  }
  const step = (points.length - 1) / (maxPoints - 1)
  return Array.from({ length: maxPoints }, (_, i) => points[Math.round(i * step)])
}
