import type { Point, Rect, Rotation } from '../model/types'

/** `view` is pdf.js `page.view` ([x0,y0,x1,y1] of the crop box); `rotate` is the page's /Rotate. */
export interface PageGeometry {
  view: readonly [number, number, number, number]
  rotate: Rotation
}

export function normalizeRotation(deg: number): Rotation {
  return ((((Math.round(deg / 90) * 90) % 360) + 360) % 360) as Rotation
}

export function viewportSize(g: PageGeometry, scale: number): { width: number; height: number } {
  const w = g.view[2] - g.view[0]
  const h = g.view[3] - g.view[1]
  const swap = g.rotate === 90 || g.rotate === 270
  return { width: (swap ? h : w) * scale, height: (swap ? w : h) * scale }
}

/** Viewport coordinates have a top-left origin, y down, and include page rotation. */
export function userToViewport(g: PageGeometry, scale: number, p: Point): Point {
  const [x0, y0, x1, y1] = g.view
  switch (g.rotate) {
    case 0: return { x: (p.x - x0) * scale, y: (y1 - p.y) * scale }
    case 90: return { x: (p.y - y0) * scale, y: (p.x - x0) * scale }
    case 180: return { x: (x1 - p.x) * scale, y: (p.y - y0) * scale }
    case 270: return { x: (y1 - p.y) * scale, y: (x1 - p.x) * scale }
  }
}

export function viewportToUser(g: PageGeometry, scale: number, p: Point): Point {
  const [x0, y0, x1, y1] = g.view
  const vx = p.x / scale
  const vy = p.y / scale
  switch (g.rotate) {
    case 0: return { x: x0 + vx, y: y1 - vy }
    case 90: return { x: x0 + vy, y: y0 + vx }
    case 180: return { x: x1 - vx, y: y0 + vy }
    case 270: return { x: x1 - vy, y: y1 - vx }
  }
}

export function rectToViewport(g: PageGeometry, scale: number, r: Rect): Rect {
  const a = userToViewport(g, scale, { x: r.x, y: r.y })
  const b = userToViewport(g, scale, { x: r.x + r.width, y: r.y + r.height })
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) }
}

export function viewportRectToUser(g: PageGeometry, scale: number, r: Rect): Rect {
  const a = viewportToUser(g, scale, { x: r.x, y: r.y })
  const b = viewportToUser(g, scale, { x: r.x + r.width, y: r.y + r.height })
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) }
}
