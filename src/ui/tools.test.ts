import { describe, expect, it } from 'vitest'
import type { PageGeometry } from '../coords/page-space'
import { beginDraft, DEFAULT_STYLES, draftToAnnotation, extendDraft } from './tools'

const g0: PageGeometry = { view: [0, 0, 612, 792], rotate: 0 }
const g90: PageGeometry = { view: [0, 0, 612, 792], rotate: 90 }
const make = (tool: Parameters<typeof beginDraft>[0], a: [number, number], b: [number, number], g = g0, scale = 1) => {
  let d = beginDraft(tool, { x: a[0], y: a[1] })
  d = extendDraft(d, { x: b[0], y: b[1] })
  return draftToAnnotation(d, DEFAULT_STYLES[tool], 'id1', 0, g, scale)
}

describe('draftToAnnotation', () => {
  it('converts a dragged rectangle to a normalized user-space rect', () => {
    const a = make('rectangle', [100, 100], [200, 150])
    expect(a).toMatchObject({ type: 'rectangle', page: 0, pageRotation: 0, rect: { x: 100, y: 642, width: 100, height: 50 } })
  })

  it('normalizes a drag made up and to the left', () => {
    const a = make('highlight', [200, 150], [100, 100])
    expect(a).toMatchObject({ rect: { x: 100, y: 642, width: 100, height: 50 } })
  })

  it('uses the page rotation when converting and records it on the annotation', () => {
    const a = make('rectangle', [100, 100], [200, 150], g90)
    expect(a).toMatchObject({ pageRotation: 90, rect: { x: 100, y: 100, width: 50, height: 100 } })
  })

  it('divides by the zoom scale', () => {
    const a = make('rectangle', [200, 200], [400, 300], g0, 2)
    expect(a).toMatchObject({ rect: { x: 100, y: 642, width: 100, height: 50 } })
  })

  it('ignores a click without a drag, and drags that are too flat or narrow', () => {
    expect(make('rectangle', [50, 50], [51, 51])).toBeNull()
    expect(make('highlight', [50, 50], [200, 51])).toBeNull()
    expect(make('ellipse', [50, 50], [52, 300])).toBeNull()
    expect(make('line', [50, 50], [51, 50])).toBeNull()
  })

  it('creates lines and arrows from the two end points', () => {
    expect(make('arrow', [10, 10], [110, 10])).toMatchObject({ type: 'arrow', from: { x: 10, y: 782 }, to: { x: 110, y: 782 } })
  })

  it('drops pen points closer than 1.5px and needs at least two points', () => {
    let d = beginDraft('pen', { x: 10, y: 10 })
    d = extendDraft(d, { x: 10.5, y: 10 })
    expect(draftToAnnotation(d, DEFAULT_STYLES.pen, 'p', 0, g0, 1)).toBeNull()
    d = extendDraft(d, { x: 20, y: 10 })
    d = extendDraft(d, { x: 30, y: 10 })
    const a = draftToAnnotation(d, DEFAULT_STYLES.pen, 'p', 0, g0, 1)
    expect(a).toMatchObject({ type: 'pen', points: [{ x: 10, y: 782 }, { x: 20, y: 782 }, { x: 30, y: 782 }] })
  })

  it('creates a default-size text box from a click and a sized one from a drag', () => {
    expect(make('text', [50, 60], [50, 60])).toMatchObject({ type: 'text', text: '', rect: { x: 50, y: 684, width: 160, height: 48 } })
    expect(make('text', [50, 60], [250, 160])).toMatchObject({ rect: { x: 50, y: 632, width: 200, height: 100 } })
  })
})
