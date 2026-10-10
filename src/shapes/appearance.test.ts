import { beforeAll, describe, expect, it } from 'vitest'
import type { Annotation } from '../model/types'
import { loadHelvetica } from '../text/helvetica'
import { buildAppearance } from './appearance'

beforeAll(loadHelvetica)

const base = { id: 'a', page: 0, pageRotation: 0 as const, color: { r: 1, g: 0, b: 0 }, opacity: 1 }
const rect = { x: 10, y: 20, width: 100, height: 50 }

describe('buildAppearance', () => {
  it('draws a highlight as a filled rect with a multiply blend', () => {
    const ap = buildAppearance({ ...base, type: 'highlight', color: { r: 1, g: 1, b: 0 }, rect })
    expect(ap.blendMultiply).toBe(true)
    expect(ap.bbox).toEqual([10, 20, 110, 70])
    expect(ap.content).toBe('/GS0 gs\n1 1 0 rg\n10 20 100 50 re\nf')
  })

  it('insets rectangle strokes so they stay inside the bbox', () => {
    const ap = buildAppearance({ ...base, type: 'rectangle', strokeWidth: 2, rect })
    expect(ap.bbox).toEqual([10, 20, 110, 70])
    expect(ap.content).toBe('/GS0 gs\n1 0 0 RG\n2 w\n11 21 98 48 re\nS')
    expect(ap.blendMultiply).toBe(false)
  })

  it('draws an ellipse with four Bezier segments', () => {
    const ap = buildAppearance({ ...base, type: 'ellipse', strokeWidth: 2, rect })
    expect(ap.content.match(/ c$/gm)).toHaveLength(4)
    expect(ap.content.endsWith('h\nS')).toBe(true)
  })

  it('draws underline along the bottom and strikeout through the middle of the screen frame', () => {
    const under = buildAppearance({ ...base, type: 'underline', strokeWidth: 2, rect })
    expect(under.content).toBe('/GS0 gs\n1 0 0 RG\n2 w\n1 0 0 1 10 20 cm\n0 1 m\n100 1 l\nS')
    const strike = buildAppearance({ ...base, type: 'strikeout', strokeWidth: 2, rect })
    expect(strike.content).toContain('0 25 m\n100 25 l')
  })

  it('rotates the underline frame on a rotated page', () => {
    const ap = buildAppearance({ ...base, pageRotation: 90, type: 'underline', strokeWidth: 2, rect })
    expect(ap.content).toContain('0 1 -1 0 110 20 cm\n0 1 m\n50 1 l')
  })

  it('pads a line bbox by the stroke width and grows it for an arrowhead', () => {
    const from = { x: 0, y: 0 }
    const to = { x: 100, y: 0 }
    const line = buildAppearance({ ...base, type: 'line', strokeWidth: 2, from, to })
    expect(line.bbox).toEqual([-2, -2, 102, 2])
    const arrow = buildAppearance({ ...base, type: 'arrow', strokeWidth: 2, from, to })
    expect(arrow.bbox[3] - arrow.bbox[1]).toBeGreaterThan(4)
  })

  it('draws a pen stroke as a polyline and a single point as a dot', () => {
    const pen = buildAppearance({ ...base, type: 'pen', strokeWidth: 3, points: [{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 10, y: 0 }] })
    expect(pen.content).toBe('/GS0 gs\n1 0 0 RG\n3 w\n1 J\n1 j\n0 0 m\n5 5 l\n10 0 l\nS')
    const dot = buildAppearance({ ...base, type: 'pen', strokeWidth: 3, points: [{ x: 4, y: 4 }] })
    expect(dot.content).toContain('4 4 m\n4 4 l')
  })

  it('lays text out in the screen frame and escapes the string', () => {
    const ap = buildAppearance({ ...base, pageRotation: 90, type: 'text', color: { r: 0, g: 0, b: 0 }, rect: { x: 100, y: 200, width: 50, height: 30 }, text: 'a(b)', fontSize: 10 })
    expect(ap.usesFont).toBe(true)
    expect(ap.content).toContain('0 1 -1 0 150 200 cm')
    expect(ap.content).toContain('/F1 10 Tf')
    expect(ap.content).toContain('(a\\(b\\)) Tj')
  })

  it('emits a valid stream for empty text', () => {
    const ap = buildAppearance({ ...base, type: 'text', rect, text: '', fontSize: 12 })
    expect(ap.content).not.toContain('Tj')
  })
})
