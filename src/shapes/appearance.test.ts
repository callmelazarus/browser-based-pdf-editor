import { beforeAll, describe, expect, it } from 'vitest'
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

  it('paints the fill under the stroke when a rectangle has one', () => {
    const ap = buildAppearance({ ...base, type: 'rectangle', strokeWidth: 2, rect, fill: { r: 0, g: 0, b: 1 } })
    expect(ap.content).toBe('/GS0 gs\n0 0 1 rg\n1 0 0 RG\n2 w\n11 21 98 48 re\nB')
  })

  it('draws an ellipse with four Bezier segments', () => {
    const ap = buildAppearance({ ...base, type: 'ellipse', strokeWidth: 2, rect })
    expect(ap.content.match(/ c$/gm)).toHaveLength(4)
    expect(ap.content.endsWith('h\nS')).toBe(true)
  })

  it('paints an ellipse fill under its stroke', () => {
    const ap = buildAppearance({ ...base, type: 'ellipse', strokeWidth: 2, rect, fill: { r: 0, g: 0, b: 1 } })
    expect(ap.content.startsWith('/GS0 gs\n0 0 1 rg\n1 0 0 RG\n2 w\n')).toBe(true)
    expect(ap.content.endsWith('h\nB')).toBe(true)
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

  it('draws the exact ellipse path on a non-square rect with a non-zero origin', () => {
    // rect 10,20 100x40, w=2: c=(60,40), rx=(100-2)/2=49, ry=(40-2)/2=19
    // K*rx=27.0619527 -> 27.062; K*ry=10.4934102 -> 10.4934
    const ap = buildAppearance({ ...base, type: 'ellipse', strokeWidth: 2, rect: { x: 10, y: 20, width: 100, height: 40 } })
    expect(ap.content).toBe([
      '/GS0 gs', '1 0 0 RG', '2 w',
      '109 40 m',
      '109 50.4934 87.062 59 60 59 c',
      '32.938 59 11 50.4934 11 40 c',
      '11 29.5066 32.938 21 60 21 c',
      '87.062 21 109 29.5066 109 40 c',
      'h', 'S',
    ].join('\n'))
  })

  it('does not produce NaN or throw for a degenerate ellipse', () => {
    for (const r of [{ x: 5, y: 5, width: 0, height: 0 }, { x: 5, y: 5, width: 1, height: 1 }]) {
      const ap = buildAppearance({ ...base, type: 'ellipse', strokeWidth: 2, rect: r })
      expect(ap.content).not.toMatch(/NaN|Infinity/)
      expect(ap.content.match(/ c$/gm)).toHaveLength(4)
    }
  })

  it('wraps text onto lines whose Tm baselines are 1.2 * size apart', () => {
    // frame 50x60 (rot 0), size 10: baseline0 = 2 + 8.5 = 10.5, then +12; y = 60 - baseline
    const ap = buildAppearance({ ...base, type: 'text', rect: { x: 100, y: 200, width: 50, height: 60 }, text: 'hello world', fontSize: 10 })
    expect(ap.content).toContain('1 0 0 1 100 200 cm')
    expect(ap.content).toContain('1 0 0 1 2 49.5 Tm\n(hello) Tj')
    expect(ap.content).toContain('1 0 0 1 2 37.5 Tm\n(world) Tj')
  })

  it.each([
    // rect 100,200 50x30, size 10; Tm y = frame.height - 10.5
    [0, '1 0 0 1 100 200 cm', '1 0 0 1 2 19.5 Tm'],
    [90, '0 1 -1 0 150 200 cm', '1 0 0 1 2 39.5 Tm'],
    [180, '-1 0 0 -1 150 230 cm', '1 0 0 1 2 19.5 Tm'],
    [270, '0 -1 1 0 100 230 cm', '1 0 0 1 2 39.5 Tm'],
  ] as const)('places text for page rotation %i', (rot, cm, tm) => {
    const ap = buildAppearance({ ...base, pageRotation: rot, type: 'text', rect: { x: 100, y: 200, width: 50, height: 30 }, text: 'ab', fontSize: 10 })
    expect(ap.content).toContain(`${cm}\nBT`)
    expect(ap.content).toContain(`${tm}\n(ab) Tj`)
  })

  it('emits empty content and a zero bbox for a pen with no points', () => {
    const ap = buildAppearance({ ...base, type: 'pen', strokeWidth: 3, points: [] })
    expect(ap.content).toBe('')
    expect(ap.bbox).toEqual([0, 0, 0, 0])
  })
})
