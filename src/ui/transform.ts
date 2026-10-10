import {
  rectToViewport, userToViewport, viewportRectToUser, viewportToUser, type PageGeometry,
} from '../coords/page-space'
import { isRectAnnotation, type Annotation, type LineAnnotation, type Point, type Rect, type RectAnnotation } from '../model/types'
import { boundsOfPoints } from '../shapes/geometry'

export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
export const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
export const MIN_SIZE_PX = 8

export function translateAnnotation(a: Annotation, du: number, dv: number): Annotation {
  const shift = (p: Point): Point => ({ x: p.x + du, y: p.y + dv })
  switch (a.type) {
    case 'line':
    case 'arrow':
      return { ...a, from: shift(a.from), to: shift(a.to) }
    case 'pen':
      return { ...a, points: a.points.map(shift) }
    default:
      return { ...a, rect: { ...a.rect, x: a.rect.x + du, y: a.rect.y + dv } }
  }
}

export function resizeViewportRect(r: Rect, handle: Handle, dx: number, dy: number, min = MIN_SIZE_PX): Rect {
  let left = r.x
  let right = r.x + r.width
  let top = r.y
  let bottom = r.y + r.height
  if (handle.includes('w')) left += dx
  if (handle.includes('e')) right += dx
  if (handle.includes('n')) top += dy
  if (handle.includes('s')) bottom += dy
  if (right - left < min) {
    if (handle.includes('w')) left = right - min
    else right = left + min
  }
  if (bottom - top < min) {
    if (handle.includes('n')) top = bottom - min
    else bottom = top + min
  }
  return { x: left, y: top, width: right - left, height: bottom - top }
}

export function resizeRectAnnotation(
  a: RectAnnotation, handle: Handle, startV: Point, curV: Point, g: PageGeometry, scale: number,
): RectAnnotation {
  const next = resizeViewportRect(rectToViewport(g, scale, a.rect), handle, curV.x - startV.x, curV.y - startV.y)
  return { ...a, rect: viewportRectToUser(g, scale, next) }
}

export function moveEndpoint(
  a: LineAnnotation, which: 'from' | 'to', curV: Point, g: PageGeometry, scale: number,
): LineAnnotation {
  return { ...a, [which]: viewportToUser(g, scale, curV) } as LineAnnotation
}

/** The annotation's bounding box in viewport pixels. */
export function viewportBounds(a: Annotation, g: PageGeometry, scale: number): Rect {
  if (isRectAnnotation(a)) return rectToViewport(g, scale, a.rect)
  const pts = (a.type === 'pen' ? a.points : [a.from, a.to]).map((p) => userToViewport(g, scale, p))
  const [x0, y0, x1, y1] = boundsOfPoints(pts)
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
}

export function handlePoint(b: Rect, h: Handle): Point {
  const x = h.includes('w') ? b.x : h.includes('e') ? b.x + b.width : b.x + b.width / 2
  const y = h.includes('n') ? b.y : h.includes('s') ? b.y + b.height : b.y + b.height / 2
  return { x, y }
}

/** Moves an annotation by the viewport-space drag from `startV` to `curV`, on a page with any rotation/crop. */
export function moveByViewportDelta(a: Annotation, startV: Point, curV: Point, g: PageGeometry, scale: number): Annotation {
  const from = viewportToUser(g, scale, startV)
  const to = viewportToUser(g, scale, curV)
  return translateAnnotation(a, to.x - from.x, to.y - from.y)
}
