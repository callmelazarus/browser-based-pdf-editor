import { describe, expect, it } from 'vitest'
import type { PageGeometry } from '../coords/page-space'
import type { Annotation, LineAnnotation, RectangleAnnotation } from '../model/types'
import {
  handlePoint, moveEndpoint, resizeRectAnnotation, resizeViewportRect, translateAnnotation, viewportBounds,
} from './transform'

const g: PageGeometry = { view: [0, 0, 612, 792], rotate: 0 }
const base = { id: 'a', page: 0, pageRotation: 0 as const, color: { r: 1, g: 0, b: 0 }, opacity: 1 }
const rectangle: RectangleAnnotation = { ...base, type: 'rectangle', strokeWidth: 2, rect: { x: 100, y: 600, width: 100, height: 50 } }
const line: LineAnnotation = { ...base, type: 'line', strokeWidth: 2, from: { x: 10, y: 10 }, to: { x: 60, y: 40 } }

describe('translateAnnotation', () => {
  it('moves rect, line and pen annotations in user space', () => {
    expect(translateAnnotation(rectangle, 5, -5)).toMatchObject({ rect: { x: 105, y: 595, width: 100, height: 50 } })
    expect(translateAnnotation(line, 1, 2)).toMatchObject({ from: { x: 11, y: 12 }, to: { x: 61, y: 42 } })
    const pen: Annotation = { ...base, type: 'pen', strokeWidth: 2, points: [{ x: 0, y: 0 }, { x: 3, y: 4 }] }
    expect(translateAnnotation(pen, 10, 10)).toMatchObject({ points: [{ x: 10, y: 10 }, { x: 13, y: 14 }] })
  })
})

describe('resizeViewportRect', () => {
  const r = { x: 100, y: 100, width: 100, height: 50 }
  it('moves only the edges the handle touches', () => {
    expect(resizeViewportRect(r, 'se', 20, 10)).toEqual({ x: 100, y: 100, width: 120, height: 60 })
    expect(resizeViewportRect(r, 'nw', 20, 10)).toEqual({ x: 120, y: 110, width: 80, height: 40 })
    expect(resizeViewportRect(r, 'e', 20, 99)).toEqual({ x: 100, y: 100, width: 120, height: 50 })
    expect(resizeViewportRect(r, 'n', 99, -10)).toEqual({ x: 100, y: 90, width: 100, height: 60 })
  })
  it('never shrinks below the minimum size', () => {
    expect(resizeViewportRect(r, 'e', -500, 0)).toEqual({ x: 100, y: 100, width: 8, height: 50 })
    expect(resizeViewportRect(r, 'nw', 500, 500)).toEqual({ x: 192, y: 142, width: 8, height: 8 })
  })
})

describe('resizeRectAnnotation / moveEndpoint', () => {
  it('resizes in viewport space and converts back to user space', () => {
    const next = resizeRectAnnotation(rectangle, 'se', { x: 200, y: 192 }, { x: 220, y: 202 }, g, 1)
    expect(next.rect).toEqual({ x: 100, y: 590, width: 120, height: 60 })
  })
  it('moves one end of a line', () => {
    const next = moveEndpoint(line, 'to', { x: 100, y: 692 }, g, 1)
    expect(next.to).toEqual({ x: 100, y: 100 })
    expect(next.from).toEqual(line.from)
  })
})

describe('viewportBounds / handlePoint', () => {
  it('bounds a line by its end points in viewport space', () => {
    expect(viewportBounds(line, g, 1)).toEqual({ x: 10, y: 752, width: 50, height: 30 })
  })
  it('places handles on the bounds', () => {
    const b = { x: 100, y: 200, width: 40, height: 20 }
    expect(handlePoint(b, 'nw')).toEqual({ x: 100, y: 200 })
    expect(handlePoint(b, 'e')).toEqual({ x: 140, y: 210 })
    expect(handlePoint(b, 's')).toEqual({ x: 120, y: 220 })
  })
})
