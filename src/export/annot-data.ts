import type { Annotation, Point, Rect, Rgb, Rotation } from '../model/types'

/** Private annotation-dictionary key holding the editor's own copy of an annotation. */
export const ANNOT_KEY = 'PdfAnnotatorData'
const VERSION = 1
const MAX_JSON_CHARS = 2_000_000
const MAX_POINTS = 20_000
const MAX_TEXT_CHARS = 100_000

export const encodeAnnotation = (a: Annotation): string => JSON.stringify({ v: VERSION, ...a })

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const num = (v: unknown, min: number, max: number): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null
const BIG = 1e7

function rgb(v: unknown): Rgb | null {
  if (!isObj(v)) return null
  const r = num(v.r, 0, 1), g = num(v.g, 0, 1), b = num(v.b, 0, 1)
  return r === null || g === null || b === null ? null : { r, g, b }
}
function rect(v: unknown): Rect | null {
  if (!isObj(v)) return null
  const x = num(v.x, -BIG, BIG), y = num(v.y, -BIG, BIG), width = num(v.width, 0, BIG), height = num(v.height, 0, BIG)
  return x === null || y === null || width === null || height === null ? null : { x, y, width, height }
}
function point(v: unknown): Point | null {
  if (!isObj(v)) return null
  const x = num(v.x, -BIG, BIG), y = num(v.y, -BIG, BIG)
  return x === null || y === null ? null : { x, y }
}

/**
 * Parses the stored copy of an annotation. The text comes from an untrusted file, so every field is
 * checked and only known fields are copied; anything malformed returns null. The caller supplies the
 * id and the page, which are taken from the document rather than the stored data.
 */
export function decodeAnnotation(json: string, id: string, page: number): Annotation | null {
  if (json.length > MAX_JSON_CHARS) return null
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return null
  }
  if (!isObj(raw) || raw.v !== VERSION) return null
  const color = rgb(raw.color)
  const opacity = num(raw.opacity, 0, 1)
  const rot = raw.pageRotation
  if (!color || opacity === null || (rot !== 0 && rot !== 90 && rot !== 180 && rot !== 270)) return null
  const base = { id, page, pageRotation: rot as Rotation, color, opacity }
  const strokeWidth = num(raw.strokeWidth, 0, 1000)

  switch (raw.type) {
    case 'highlight': {
      const r = rect(raw.rect)
      return r ? { ...base, type: 'highlight', rect: r } : null
    }
    case 'underline':
    case 'strikeout':
    case 'ellipse': {
      const r = rect(raw.rect)
      return r && strokeWidth !== null ? { ...base, type: raw.type, rect: r, strokeWidth } : null
    }
    case 'rectangle': {
      const r = rect(raw.rect)
      if (!r || strokeWidth === null) return null
      if (raw.fill === undefined || raw.fill === null) return { ...base, type: 'rectangle', rect: r, strokeWidth }
      const fill = rgb(raw.fill)
      return fill ? { ...base, type: 'rectangle', rect: r, strokeWidth, fill } : null
    }
    case 'line':
    case 'arrow': {
      const from = point(raw.from), to = point(raw.to)
      return from && to && strokeWidth !== null ? { ...base, type: raw.type, from, to, strokeWidth } : null
    }
    case 'pen': {
      if (!Array.isArray(raw.points) || raw.points.length > MAX_POINTS || strokeWidth === null) return null
      const points = raw.points.map(point)
      return points.every((p): p is Point => p !== null) ? { ...base, type: 'pen', points, strokeWidth } : null
    }
    case 'text': {
      const r = rect(raw.rect)
      const fontSize = num(raw.fontSize, 1, 1000)
      if (!r || fontSize === null || typeof raw.text !== 'string' || raw.text.length > MAX_TEXT_CHARS) return null
      return { ...base, type: 'text', rect: r, text: raw.text, fontSize }
    }
    default:
      return null
  }
}
