import { describe, expect, it } from 'vitest'
import type { PageGeometry } from '../coords/page-space'
import type { Point } from '../model/types'
import { MAX_PEN_POINTS, simplifyStroke } from './pen'
import { beginDraft, DEFAULT_STYLES, draftToAnnotation, extendDraft } from './tools'

const g0: PageGeometry = { view: [0, 0, 612, 792], rotate: 0 }

function distToSegment(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}
function maxDeviation(orig: Point[], simp: Point[]) {
  let worst = 0
  for (const p of orig) {
    let best = Infinity
    for (let i = 1; i < simp.length; i++) best = Math.min(best, distToSegment(p, simp[i - 1], simp[i]))
    worst = Math.max(worst, best)
  }
  return worst
}

describe('simplifyStroke', () => {
  it('keeps end points and drops collinear points', () => {
    const pts = Array.from({ length: 50 }, (_, i) => ({ x: i * 2, y: i }))
    expect(simplifyStroke(pts, 0.5, 100)).toEqual([pts[0], pts[49]])
  })
  it('keeps real corners', () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 20, y: 20 }]
    expect(simplifyStroke(pts, 0.5, 100)).toEqual([pts[0], pts[2], pts[4]])
  })
  it('returns short input unchanged', () => {
    const pts = [{ x: 0, y: 0 }, { x: 5, y: 5 }]
    expect(simplifyStroke(pts, 0.5, 100)).toEqual(pts)
  })
  it('never exceeds the cap, even for a noisy stroke', () => {
    let s = 7
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647
    const pts = Array.from({ length: 20000 }, () => ({ x: rnd() * 600, y: rnd() * 700 }))
    expect(simplifyStroke(pts, 0.5, 300).length).toBeLessThanOrEqual(300)
  })
})

describe('pen commit', () => {
  const sine = Array.from({ length: 20000 }, (_, i) => ({ x: 20 + i * 0.025, y: 300 + 100 * Math.sin(i / 400) }))

  it('commits a bounded, faithful point list for a 20,000-point stroke', () => {
    let d = beginDraft('pen', sine[0])
    for (const p of sine.slice(1)) d = extendDraft(d, p)
    const a = draftToAnnotation(d, DEFAULT_STYLES.pen, 'p', 0, g0, 1)
    expect(a?.type).toBe('pen')
    if (a?.type !== 'pen') return
    expect(a.points.length).toBeLessThanOrEqual(MAX_PEN_POINTS)
    // back to viewport space (page height 792) to compare with the raw (decimated) stroke
    const back = a.points.map((p) => ({ x: p.x, y: 792 - p.y }))
    expect(maxDeviation(d.points, back)).toBeLessThanOrEqual(0.6)
    expect(back[0]).toEqual(sine[0])
  })

  it('appends to the gesture buffer in place instead of copying it', () => {
    const d = beginDraft('pen', { x: 0, y: 0 })
    const buffer = d.points
    const d2 = extendDraft(d, { x: 10, y: 0 })
    expect(d2.points).toBe(buffer)
    expect(buffer).toHaveLength(2)
  })
})
