import { describe, expect, it } from 'vitest'
import type { PageGeometry } from '../coords/page-space'
import type { Annotation, LineAnnotation, RectangleAnnotation } from '../model/types'
import {
  handlePoint, moveByViewportDelta, moveEndpoint, resizeRectAnnotation, resizeViewportRect, translateAnnotation, viewportBounds,
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

/*
 * Rotated and cropped pages. All cases use view [10,20,310,420] (a 300x400 crop box with a non-zero
 * origin) and scale 2. Expected values are derived by hand from page-space.ts:
 *   userToViewport  (x,y) -> (screen x, screen y) / scale-less, then * scale:
 *     0:   (x-10, 420-y)     90:  (y-20, x-10)     180: (310-x, y-20)     270: (420-y, 310-x)
 *   viewportToUser  (vx,vy = screen/scale):
 *     0:   (10+vx, 420-vy)   90:  (10+vy, 20+vx)   180: (310-vx, 20+vy)   270: (310-vy, 420-vx)
 */
const view = [10, 20, 310, 420] as const
const geo = (rotate: 0 | 90 | 180 | 270): PageGeometry => ({ view, rotate })
const crop = { ...rectangle, rect: { x: 50, y: 100, width: 60, height: 40 } } // corners (50,100) and (110,140)

describe('rotated and cropped pages (scale 2)', () => {
  it('resizes with the se handle on a 90 degree page', () => {
    // corners -> screen (160,80) and (240,200): viewport rect {160,80,80,120}. Drag se by (+20,+30)
    // -> {160,80,100,150}, corners (160,80),(260,230) -> user (50,100) and (10+115, 20+130) = (125,150).
    const next = resizeRectAnnotation(crop, 'se', { x: 240, y: 200 }, { x: 260, y: 230 }, geo(90), 2)
    expect(next.rect).toEqual({ x: 50, y: 100, width: 75, height: 50 })
  })

  it('resizes with the nw handle on a 180 degree page', () => {
    // corners -> screen (520,160) and (400,240): viewport rect {400,160,120,80}. Drag nw by (-30,-20)
    // -> {370,140,150,100}, corners (370,140),(520,240) -> user (310-185, 20+70)=(125,90) and (50,140).
    const next = resizeRectAnnotation(crop, 'nw', { x: 400, y: 160 }, { x: 370, y: 140 }, geo(180), 2)
    expect(next.rect).toEqual({ x: 50, y: 90, width: 75, height: 50 })
  })

  it('resizes with the e handle on a 270 degree page', () => {
    // corners -> screen (640,520) and (560,400): viewport rect {560,400,80,120}. Drag e by +40
    // -> {560,400,120,120}, corners (560,400),(680,520) -> user (310-200, 420-280)=(110,140) and (310-260, 420-340)=(50,80).
    const next = resizeRectAnnotation(crop, 'e', { x: 640, y: 460 }, { x: 680, y: 999 }, geo(270), 2)
    expect(next.rect).toEqual({ x: 50, y: 80, width: 60, height: 60 })
  })

  it('resizes with the se handle on an unrotated cropped page', () => {
    // corners -> screen (80,640) and (200,560): viewport rect {80,560,120,80}. Drag se by (+20,-10)
    // -> {80,560,140,70}, corners (80,560),(220,630) -> user (10+40, 420-315)=(50,105) and (10+110, 420-280)=(120,140).
    const next = resizeRectAnnotation(crop, 'se', { x: 200, y: 640 }, { x: 220, y: 630 }, geo(0), 2)
    expect(next.rect).toEqual({ x: 50, y: 105, width: 70, height: 35 })
  })

  it('normalises and enforces the minimum size when a handle is dragged past the opposite edge (rotation 90)', () => {
    // viewport rect {160,80,80,120}; min 8px = 4 user units at scale 2.
    // se dragged by (-500,-500): {160,80,8,8}, corners (160,80),(168,88) -> user (50,100) and (10+44, 20+84)=(54,104).
    const se = resizeRectAnnotation(crop, 'se', { x: 240, y: 200 }, { x: -260, y: -300 }, geo(90), 2)
    expect(se.rect).toEqual({ x: 50, y: 100, width: 4, height: 4 })
    // nw dragged by (+500,+500): {232,192,8,8}, corners (232,192),(240,200) -> user (10+96, 20+116)=(106,136) and (110,140).
    const nw = resizeRectAnnotation(crop, 'nw', { x: 160, y: 80 }, { x: 660, y: 580 }, geo(90), 2)
    expect(nw.rect).toEqual({ x: 106, y: 136, width: 4, height: 4 })
  })

  it('moves by a viewport drag of (+20,+10) screen px, i.e. (10,5) page px, at every rotation', () => {
    const from = { x: 100, y: 100 }
    const to = { x: 120, y: 110 }
    // du,dv from the inverse formulas: 0 -> (10,-5); 90 -> (5,10); 180 -> (-10,5); 270 -> (-5,-10)
    expect(moveByViewportDelta(crop, from, to, geo(0), 2)).toMatchObject({ rect: { x: 60, y: 95, width: 60, height: 40 } })
    expect(moveByViewportDelta(crop, from, to, geo(90), 2)).toMatchObject({ rect: { x: 55, y: 110, width: 60, height: 40 } })
    expect(moveByViewportDelta(crop, from, to, geo(180), 2)).toMatchObject({ rect: { x: 40, y: 105, width: 60, height: 40 } })
    expect(moveByViewportDelta(crop, from, to, geo(270), 2)).toMatchObject({ rect: { x: 45, y: 90, width: 60, height: 40 } })
  })

  it('moves a line end point to the clicked screen position at every rotation', () => {
    const l: LineAnnotation = { ...line, from: { x: 20, y: 30 }, to: { x: 80, y: 90 } }
    const cur = { x: 200, y: 120 } // v = (100,60)
    expect(moveEndpoint(l, 'to', cur, geo(0), 2).to).toEqual({ x: 110, y: 360 })
    expect(moveEndpoint(l, 'to', cur, geo(90), 2).to).toEqual({ x: 70, y: 120 })
    expect(moveEndpoint(l, 'to', cur, geo(180), 2).to).toEqual({ x: 210, y: 80 })
    expect(moveEndpoint(l, 'to', cur, geo(270), 2).to).toEqual({ x: 250, y: 320 })
    expect(moveEndpoint(l, 'to', cur, geo(90), 2).from).toEqual(l.from)
  })
})
