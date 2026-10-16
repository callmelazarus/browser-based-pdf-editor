import {
  viewportRectToUser, viewportToUser, type PageGeometry,
} from '../coords/page-space'
import type { Annotation, AnnotationType, Point, Rect, Rgb } from '../model/types'
import { simplifyStroke } from './pen'

export type DrawTool = AnnotationType
export type Tool = 'select' | DrawTool

export interface StyleDefaults { color: Rgb; opacity: number; strokeWidth: number; fontSize: number; fill: Rgb | null }
export type ToolStyles = Record<DrawTool, StyleDefaults>

const RED: Rgb = { r: 0.85, g: 0.1, b: 0.1 }
const stroke = (color: Rgb, strokeWidth = 2): StyleDefaults => ({ color, opacity: 1, strokeWidth, fontSize: 14, fill: null })

export const DEFAULT_STYLES: ToolStyles = {
  highlight: { color: { r: 1, g: 0.92, b: 0 }, opacity: 0.5, strokeWidth: 0, fontSize: 14, fill: null },
  underline: stroke(RED),
  strikeout: stroke(RED),
  rectangle: stroke(RED),
  ellipse: stroke(RED),
  line: stroke(RED),
  arrow: stroke(RED),
  pen: stroke(RED, 2.5),
  text: { color: { r: 0, g: 0, b: 0 }, opacity: 1, strokeWidth: 0, fontSize: 14, fill: null },
}

export const MIN_DRAG_PX = 4
export const DEFAULT_TEXT_SIZE = { width: 160, height: 48 }

/**
 * A gesture in progress. All coordinates are viewport pixels (top-left origin).
 * For the pen, `points` is a mutable per-gesture buffer shared across the drafts of one gesture.
 */
export interface Draft { tool: DrawTool; start: Point; current: Point; points: Point[] }

export const beginDraft = (tool: DrawTool, p: Point): Draft => ({ tool, start: p, current: p, points: [p] })

export function extendDraft(d: Draft, p: Point): Draft {
  if (d.tool !== 'pen') return { ...d, current: p }
  const last = d.points[d.points.length - 1]
  if (Math.hypot(p.x - last.x, p.y - last.y) >= 1.5) d.points.push(p)
  return { ...d, current: p }
}

function normalizedRect(a: Point, b: Point): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) }
}

export function draftToAnnotation(
  d: Draft, style: StyleDefaults, id: string, page: number, g: PageGeometry, scale: number,
  /** Simplify pen strokes to a bounded point list. Off for the cheap live preview. */
  simplify = true,
): Annotation | null {
  const base = { id, page, pageRotation: g.rotate, color: style.color, opacity: style.opacity }
  const dx = Math.abs(d.current.x - d.start.x)
  const dy = Math.abs(d.current.y - d.start.y)
  const toUser = (p: Point) => viewportToUser(g, scale, p)

  switch (d.tool) {
    case 'text': {
      const dragged = dx >= MIN_DRAG_PX && dy >= MIN_DRAG_PX
      const box = dragged
        ? normalizedRect(d.start, d.current)
        : { x: d.start.x, y: d.start.y, width: DEFAULT_TEXT_SIZE.width * scale, height: DEFAULT_TEXT_SIZE.height * scale }
      return { ...base, type: 'text', rect: viewportRectToUser(g, scale, box), text: '', fontSize: style.fontSize }
    }
    case 'pen':
      if (d.points.length < 2) return null
      return {
        ...base, type: 'pen', strokeWidth: style.strokeWidth,
        points: (simplify ? simplifyStroke(d.points) : d.points).map(toUser),
      }
    case 'line':
    case 'arrow':
      if (Math.hypot(dx, dy) < MIN_DRAG_PX) return null
      return { ...base, type: d.tool, from: toUser(d.start), to: toUser(d.current), strokeWidth: style.strokeWidth }
    case 'highlight':
    case 'underline':
    case 'strikeout':
    case 'rectangle':
    case 'ellipse': {
      if (dx < MIN_DRAG_PX || dy < MIN_DRAG_PX) return null
      const rect = viewportRectToUser(g, scale, normalizedRect(d.start, d.current))
      return d.tool === 'highlight'
        ? { ...base, type: 'highlight', rect }
        : d.tool === 'rectangle' && style.fill
          ? { ...base, type: 'rectangle', rect, strokeWidth: style.strokeWidth, fill: style.fill }
          : { ...base, type: d.tool, rect, strokeWidth: style.strokeWidth }
    }
  }
}
