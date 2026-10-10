import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'
import { rectToViewport, userToViewport, viewportSize, viewportToUser, type PageGeometry } from '../coords/page-space'
import type { AnnotationStore } from '../model/store'
import { isRectAnnotation, type Annotation, type Point, type TextAnnotation } from '../model/types'
import { AnnotationView } from './AnnotationView'
import { TextEditor } from './TextEditor'
import { beginDraft, draftToAnnotation, extendDraft, type Draft, type Tool, type ToolStyles } from './tools'
import {
  HANDLES, handlePoint, moveEndpoint, resizeRectAnnotation, translateAnnotation, viewportBounds, type Handle,
} from './transform'
import { useStoreState } from './useStoreState'

interface Props {
  pageIndex: number
  geometry: PageGeometry
  scale: number
  tool: Tool
  styles: ToolStyles
  store: AnnotationStore
}

interface Drag {
  mode: 'move' | 'resize' | 'endpoint'
  original: Annotation
  current: Annotation
  startV: Point
  handle?: Handle
  which?: 'from' | 'to'
}
interface TextEdit { annotation: TextAnnotation; isNew: boolean }

const CURSORS: Record<Handle, string> = {
  nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize',
  n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize',
}
const BLUE = '#2f7de1'
const HANDLE_STYLE = { pointerEvents: 'auto', touchAction: 'none' } as const

export function Overlay({ pageIndex, geometry, scale, tool, styles, store }: Props) {
  const { annotations, selectedId } = useStoreState(store)
  const svgRef = useRef<SVGSVGElement>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [textEdit, setTextEdit] = useState<TextEdit | null>(null)
  const size = viewportSize(geometry, scale)
  const selecting = tool === 'select'
  const gesturing = !!draft || !!drag

  const mine = annotations
    .filter((a) => a.page === pageIndex)
    .map((a) => (drag && drag.original.id === a.id ? drag.current : a))
  const selected = selecting && !textEdit ? mine.find((a) => a.id === selectedId) : undefined

  const pointOf = (e: { clientX: number; clientY: number }): Point => {
    const box = svgRef.current!.getBoundingClientRect()
    return { x: e.clientX - box.left, y: e.clientY - box.top }
  }
  const toAnnotation = (d: Draft, id: string, simplify = true) =>
    draftToAnnotation(d, styles[d.tool], id, pageIndex, geometry, scale, simplify)

  /** Throws for pointers that are not active (e.g. synthetic events); the gesture simply goes uncaptured. */
  const capture = (e: PointerEvent) => {
    try {
      svgRef.current?.setPointerCapture(e.pointerId)
    } catch {
      /* not capturable */
    }
  }

  /** Drops any in-flight draw or move/resize without committing anything. */
  const cancelGesture = useCallback(() => {
    setDraft(null)
    setDrag(null)
  }, [])

  // Switching tool mid-gesture abandons it.
  useEffect(() => cancelGesture(), [tool, cancelGesture])

  // Escape cancels the gesture. Capture phase + stopPropagation keeps the editor-level Escape
  // (which switches tool and deselects) from also firing.
  useEffect(() => {
    if (!gesturing) return
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      e.preventDefault()
      cancelGesture()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [gesturing, cancelGesture])

  // In select mode the svg is pass-through, so a press on empty page area reaches the page element.
  useEffect(() => {
    if (!selecting) return
    const page = svgRef.current?.closest('.page')
    if (!page) return
    function onDown(e: Event) {
      const t = e.target as Element
      if (t.closest('[data-annotation-id], [data-handle], textarea')) return
      store.select(null)
    }
    page.addEventListener('pointerdown', onDown)
    return () => page.removeEventListener('pointerdown', onDown)
  }, [selecting, store])

  function startDrag(e: PointerEvent, init: Pick<Drag, 'mode' | 'original' | 'handle' | 'which'>) {
    if (!e.isPrimary || e.button !== 0) return
    e.stopPropagation()
    capture(e)
    setDrag({ ...init, current: init.original, startV: pointOf(e) })
  }

  function computeDrag(d: Drag, p: Point): Annotation {
    if (d.mode === 'move') {
      const a = viewportToUser(geometry, scale, d.startV)
      const b = viewportToUser(geometry, scale, p)
      return translateAnnotation(d.original, b.x - a.x, b.y - a.y)
    }
    if (d.mode === 'resize' && isRectAnnotation(d.original) && d.handle) {
      return resizeRectAnnotation(d.original, d.handle, d.startV, p, geometry, scale)
    }
    if (d.mode === 'endpoint' && (d.original.type === 'line' || d.original.type === 'arrow') && d.which) {
      return moveEndpoint(d.original, d.which, p, geometry, scale)
    }
    return d.original
  }

  function onPointerDown(e: PointerEvent<SVGSVGElement>) {
    if (selecting || !e.isPrimary || e.button !== 0) return
    capture(e)
    setDraft(beginDraft(tool as Exclude<Tool, 'select'>, pointOf(e)))
  }
  function onPointerMove(e: PointerEvent) {
    if (!e.isPrimary || (!draft && !drag)) return
    // A move with no button held means we missed the release: never extend a stale gesture.
    if (e.buttons === 0) {
      cancelGesture()
      return
    }
    if (drag) setDrag({ ...drag, current: computeDrag(drag, pointOf(e)) })
    else if (draft) setDraft(extendDraft(draft, pointOf(e)))
  }
  function onPointerUp(e: PointerEvent) {
    if (!e.isPrimary) return
    if (drag) {
      const p = pointOf(e)
      setDrag(null)
      if (Math.hypot(p.x - drag.startV.x, p.y - drag.startV.y) > 0) {
        store.update(drag.original.id, computeDrag(drag, p))
      }
      return
    }
    if (!draft) return
    const done = extendDraft(draft, pointOf(e))
    setDraft(null)
    const ann = toAnnotation(done, crypto.randomUUID())
    if (!ann) return
    if (ann.type === 'text') setTextEdit({ annotation: ann, isNew: true })
    else store.add(ann)
  }

  /** Handled here, not on the annotation, because the svg holds pointer capture after a press. */
  function onDoubleClick(e: { clientX: number; clientY: number }) {
    if (!selecting) return
    const p = pointOf(e)
    const hit = [...mine].reverse().find((a): a is TextAnnotation => {
      if (a.type !== 'text') return false
      const r = rectToViewport(geometry, scale, a.rect)
      return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height
    })
    if (hit) {
      store.select(hit.id)
      setTextEdit({ annotation: hit, isNew: false })
    }
  }

  const preview = draft ? toAnnotation(draft, 'draft', false) : null
  const previewRect = preview?.type === 'text' ? rectToViewport(geometry, scale, preview.rect) : null
  const bounds = selected ? viewportBounds(selected, geometry, scale) : null

  return (
    <div className="overlay" style={size}>
      <svg
        ref={svgRef}
        width={size.width}
        height={size.height}
        data-testid={`page-overlay-${pageIndex}`}
        // Select mode: the svg itself is pass-through so touch scroll/pinch and text selection reach
        // the page; only annotations and handles opt back in. Drawing tools own every gesture.
        style={{
          cursor: selecting ? 'default' : 'crosshair',
          pointerEvents: selecting ? 'none' : 'auto',
          touchAction: selecting ? 'auto' : 'none',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={cancelGesture}
        onLostPointerCapture={cancelGesture}
        onDoubleClick={onDoubleClick}
      >
        {mine.map((a) => (
          <AnnotationView
            key={a.id}
            annotation={a}
            geometry={geometry}
            scale={scale}
            hidden={!!textEdit && !textEdit.isNew && textEdit.annotation.id === a.id}
            interactive={selecting}
            onPointerDown={(e) => {
              if (e.button !== 0 || !e.isPrimary) return
              store.select(a.id)
              startDrag(e, { mode: 'move', original: a })
            }}
          />
        ))}
        {preview && <AnnotationView annotation={preview} geometry={geometry} scale={scale} preview />}
        {previewRect && <rect {...previewRect} fill="none" stroke={BLUE} strokeDasharray="4 3" />}

        {selected && bounds && (
          <g>
            <rect {...bounds} fill="none" stroke={BLUE} strokeDasharray="4 3" pointerEvents="none" />
            {isRectAnnotation(selected) &&
              HANDLES.map((h) => {
                const c = handlePoint(bounds, h)
                return (
                  <rect
                    key={h} data-testid={`handle-${h}`} data-handle x={c.x - 4} y={c.y - 4} width={8} height={8}
                    fill="#fff" stroke={BLUE} style={{ ...HANDLE_STYLE, cursor: CURSORS[h] }}
                    onPointerDown={(e) => startDrag(e, { mode: 'resize', original: selected, handle: h })}
                  />
                )
              })}
            {(selected.type === 'line' || selected.type === 'arrow') &&
              (['from', 'to'] as const).map((which) => {
                const c = userToViewport(geometry, scale, selected[which])
                return (
                  <circle
                    key={which} data-testid={`handle-${which}`} data-handle cx={c.x} cy={c.y} r={5}
                    fill="#fff" stroke={BLUE} style={{ ...HANDLE_STYLE, cursor: 'crosshair' }}
                    onPointerDown={(e) => startDrag(e, { mode: 'endpoint', original: selected, which })}
                  />
                )
              })}
          </g>
        )}
      </svg>
      {textEdit && (
        <TextEditor
          annotation={textEdit.annotation}
          geometry={geometry}
          scale={scale}
          onCancel={() => setTextEdit(null)}
          onCommit={(text) => {
            const { annotation, isNew } = textEdit
            setTextEdit(null)
            if (isNew) {
              if (text.trim()) store.add({ ...annotation, text })
            } else if (!text.trim()) {
              store.remove(annotation.id)
            } else if (text !== annotation.text) {
              store.update(annotation.id, { text })
            }
          }}
        />
      )}
    </div>
  )
}
