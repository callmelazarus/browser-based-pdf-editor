import { screenFrame } from '../coords/frame'
import type { Annotation, Point, Rect, Rgb } from '../model/types'
import { layoutTextBox, TEXT_PADDING } from '../text/layout'
import { toPdfLiteral } from '../text/winansi'
import { arrowHeadLength, arrowHeadPoints, boundsOfPoints, padBounds, type BBox } from './geometry'

export type { BBox }

export interface Appearance {
  bbox: BBox
  /** Page-content operators. Refers to graphics state /GS0 and, if usesFont, font /F1. */
  content: string
  opacity: number
  blendMultiply: boolean
  usesFont: boolean
}

const n = (v: number) => (Number.isFinite(v) ? String(Math.round(v * 10000) / 10000) : '0')
const rgb = (c: Rgb, stroke: boolean) => `${n(c.r)} ${n(c.g)} ${n(c.b)} ${stroke ? 'RG' : 'rg'}`
const rectBBox = (r: Rect): BBox => [r.x, r.y, r.x + r.width, r.y + r.height]
const pt = (p: Point) => `${n(p.x)} ${n(p.y)}`

const K = 0.5522847498

export function buildAppearance(a: Annotation): Appearance {
  const base = { opacity: a.opacity, blendMultiply: false, usesFont: false }
  switch (a.type) {
    case 'highlight': {
      const r = a.rect
      return {
        ...base, blendMultiply: true, bbox: rectBBox(r),
        content: ['/GS0 gs', rgb(a.color, false), `${n(r.x)} ${n(r.y)} ${n(r.width)} ${n(r.height)} re`, 'f'].join('\n'),
      }
    }
    case 'underline':
    case 'strikeout': {
      const f = screenFrame(a.rect, a.pageRotation)
      const v = a.type === 'underline' ? a.strokeWidth / 2 : f.height / 2
      return {
        ...base, bbox: rectBBox(a.rect),
        content: [
          '/GS0 gs', rgb(a.color, true), `${n(a.strokeWidth)} w`, `${f.matrix.map(n).join(' ')} cm`,
          `0 ${n(v)} m`, `${n(f.width)} ${n(v)} l`, 'S',
        ].join('\n'),
      }
    }
    case 'rectangle': {
      const { x, y, width, height } = a.rect
      const i = a.strokeWidth / 2
      return {
        ...base, bbox: rectBBox(a.rect),
        content: [
          '/GS0 gs', rgb(a.color, true), `${n(a.strokeWidth)} w`,
          `${n(x + i)} ${n(y + i)} ${n(Math.max(0, width - a.strokeWidth))} ${n(Math.max(0, height - a.strokeWidth))} re`, 'S',
        ].join('\n'),
      }
    }
    case 'ellipse': {
      const { x, y, width, height } = a.rect
      const cx = x + width / 2, cy = y + height / 2
      const rx = Math.max(0, (width - a.strokeWidth) / 2), ry = Math.max(0, (height - a.strokeWidth) / 2)
      const c = (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) =>
        `${n(x1)} ${n(y1)} ${n(x2)} ${n(y2)} ${n(x3)} ${n(y3)} c`
      return {
        ...base, bbox: rectBBox(a.rect),
        content: [
          '/GS0 gs', rgb(a.color, true), `${n(a.strokeWidth)} w`, `${n(cx + rx)} ${n(cy)} m`,
          c(cx + rx, cy + K * ry, cx + K * rx, cy + ry, cx, cy + ry),
          c(cx - K * rx, cy + ry, cx - rx, cy + K * ry, cx - rx, cy),
          c(cx - rx, cy - K * ry, cx - K * rx, cy - ry, cx, cy - ry),
          c(cx + K * rx, cy - ry, cx + rx, cy - K * ry, cx + rx, cy),
          'h', 'S',
        ].join('\n'),
      }
    }
    case 'line':
    case 'arrow': {
      const pts: Point[] = [a.from, a.to]
      const ops = ['/GS0 gs', rgb(a.color, true), `${n(a.strokeWidth)} w`, '1 J', '1 j', `${pt(a.from)} m`, `${pt(a.to)} l`, 'S']
      if (a.type === 'arrow') {
        const [p1, p2] = arrowHeadPoints(a.from, a.to, arrowHeadLength(a.strokeWidth))
        pts.push(p1, p2)
        ops.push(`${pt(p1)} m`, `${pt(a.to)} l`, `${pt(p2)} l`, 'S')
      }
      return { ...base, bbox: padBounds(boundsOfPoints(pts), a.strokeWidth), content: ops.join('\n') }
    }
    case 'pen': {
      const pts = a.points.length ? a.points : [{ x: 0, y: 0 }]
      const ops = ['/GS0 gs', rgb(a.color, true), `${n(a.strokeWidth)} w`, '1 J', '1 j', `${pt(pts[0])} m`]
      if (pts.length === 1) ops.push(`${pt(pts[0])} l`)
      for (const p of pts.slice(1)) ops.push(`${pt(p)} l`)
      ops.push('S')
      return { ...base, bbox: padBounds(boundsOfPoints(pts), a.strokeWidth), content: ops.join('\n') }
    }
    case 'text': {
      const f = screenFrame(a.rect, a.pageRotation)
      const { lines, baselines } = layoutTextBox(a.text, a.fontSize, f.width, f.height)
      const ops = ['/GS0 gs', `${f.matrix.map(n).join(' ')} cm`]
      if (lines.some((l) => l !== '')) {
        ops.push('BT', `/F1 ${n(a.fontSize)} Tf`, rgb(a.color, false))
        lines.forEach((line, i) => {
          if (line === '') return
          ops.push(`1 0 0 1 ${n(TEXT_PADDING)} ${n(f.height - baselines[i])} Tm`, `${toPdfLiteral(line)} Tj`)
        })
        ops.push('ET')
      }
      return { ...base, usesFont: true, bbox: rectBBox(a.rect), content: ops.join('\n') }
    }
  }
}
