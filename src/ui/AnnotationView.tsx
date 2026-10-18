import type { PointerEvent, ReactNode } from 'react'
import { rectToViewport, userToViewport, type PageGeometry } from '../coords/page-space'
import type { Annotation, Rect } from '../model/types'
import { arrowHeadLength, arrowHeadPoints } from '../shapes/geometry'
import { layoutTextBox, TEXT_PADDING } from '../text/layout'
import { css } from './color'

interface Props {
  annotation: Annotation
  geometry: PageGeometry
  scale: number
  hidden?: boolean
  /** The in-progress draft: rendered with a distinct test id so it never counts as an annotation. */
  preview?: boolean
  /** In the select tool, annotations capture pointer events and show a generous hit area. */
  interactive?: boolean
  onPointerDown?: (e: PointerEvent<SVGGElement>) => void
}

export function AnnotationView({ annotation, geometry, scale, hidden, preview, interactive, onPointerDown }: Props) {
  if (hidden) return null
  return (
    <g
      data-annotation-id={preview ? undefined : annotation.id}
      data-testid={`${preview ? 'draft' : 'annotation'}-${annotation.type}`}
      style={{
        pointerEvents: interactive ? 'auto' : 'none',
        cursor: interactive ? 'move' : undefined,
        touchAction: interactive ? 'none' : undefined,
      }}
      onPointerDown={onPointerDown}
    >
      {renderBody(annotation, geometry, scale)}
      {interactive && renderHit(annotation, geometry, scale)}
    </g>
  )
}

/** Invisible shapes that make thin strokes easy to click. */
function renderHit(a: Annotation, g: PageGeometry, s: number): ReactNode {
  const hitWidth = (sw: number) => Math.max(12, sw * s)
  switch (a.type) {
    case 'line':
    case 'arrow': {
      const f = userToViewport(g, s, a.from)
      const t = userToViewport(g, s, a.to)
      return <line x1={f.x} y1={f.y} x2={t.x} y2={t.y} stroke="transparent" strokeWidth={hitWidth(a.strokeWidth)} strokeLinecap="round" />
    }
    case 'pen':
      return (
        <polyline
          points={a.points.map((p) => userToViewport(g, s, p)).map((p) => `${p.x},${p.y}`).join(' ')}
          fill="none" stroke="transparent" strokeWidth={hitWidth(a.strokeWidth)} strokeLinecap="round" strokeLinejoin="round"
        />
      )
    default:
      return <rect {...rectToViewport(g, s, a.rect)} fill="transparent" />
  }
}

function renderBody(a: Annotation, g: PageGeometry, s: number): ReactNode {
  const color = css(a.color)
  const vp = (r: Rect) => rectToViewport(g, s, r)
  const toV = (p: { x: number; y: number }) => userToViewport(g, s, p)

  switch (a.type) {
    case 'highlight': {
      const r = vp(a.rect)
      return <rect {...r} fill={color} fillOpacity={a.opacity} style={{ mixBlendMode: 'multiply' }} />
    }
    case 'underline':
    case 'strikeout': {
      const r = vp(a.rect)
      const sw = a.strokeWidth * s
      const y = a.type === 'underline' ? r.y + r.height - sw / 2 : r.y + r.height / 2
      return <line x1={r.x} x2={r.x + r.width} y1={y} y2={y} stroke={color} strokeWidth={sw} strokeOpacity={a.opacity} />
    }
    case 'rectangle': {
      const r = vp(a.rect)
      const sw = a.strokeWidth * s
      return (
        <rect
          x={r.x + sw / 2} y={r.y + sw / 2}
          width={Math.max(0, r.width - sw)} height={Math.max(0, r.height - sw)}
          fill={a.fill ? css(a.fill) : 'none'} fillOpacity={a.opacity} stroke={color} strokeWidth={sw} strokeOpacity={a.opacity}
        />
      )
    }
    case 'ellipse': {
      const r = vp(a.rect)
      const sw = a.strokeWidth * s
      return (
        <ellipse
          cx={r.x + r.width / 2} cy={r.y + r.height / 2}
          rx={Math.max(0, (r.width - sw) / 2)} ry={Math.max(0, (r.height - sw) / 2)}
          fill={a.fill ? css(a.fill) : 'none'} fillOpacity={a.opacity} stroke={color} strokeWidth={sw} strokeOpacity={a.opacity}
        />
      )
    }
    case 'line':
    case 'arrow': {
      const from = toV(a.from)
      const to = toV(a.to)
      const sw = a.strokeWidth * s
      const [p1, p2] = arrowHeadPoints(from, to, arrowHeadLength(a.strokeWidth) * s)
      return (
        <g fill="none" stroke={color} strokeWidth={sw} strokeOpacity={a.opacity} strokeLinecap="round" strokeLinejoin="round">
          <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} />
          {a.type === 'arrow' && <polyline points={`${p1.x},${p1.y} ${to.x},${to.y} ${p2.x},${p2.y}`} />}
        </g>
      )
    }
    case 'pen':
      return (
        <polyline
          points={a.points.map(toV).map((p) => `${p.x},${p.y}`).join(' ')}
          fill="none" stroke={color} strokeWidth={a.strokeWidth * s} strokeOpacity={a.opacity}
          strokeLinecap="round" strokeLinejoin="round"
        />
      )
    case 'text': {
      const r = vp(a.rect)
      const { lines, baselines } = layoutTextBox(a.text, a.fontSize, r.width / s, r.height / s)
      return (
        <svg x={r.x} y={r.y} width={r.width} height={r.height} overflow="hidden">
          {lines.map((line, i) => (
            <text
              key={i} x={TEXT_PADDING * s} y={baselines[i] * s} fontSize={a.fontSize * s}
              fontFamily="Helvetica, Arial, sans-serif" fill={color} style={{ whiteSpace: 'pre' }}
            >
              {line}
            </text>
          ))}
        </svg>
      )
    }
  }
}
