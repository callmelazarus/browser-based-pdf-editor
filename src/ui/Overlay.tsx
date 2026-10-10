import { useRef, useState, type PointerEvent } from 'react'
import { rectToViewport, viewportSize, type PageGeometry } from '../coords/page-space'
import type { AnnotationStore } from '../model/store'
import type { Point, TextAnnotation } from '../model/types'
import { AnnotationView } from './AnnotationView'
import { TextEditor } from './TextEditor'
import { beginDraft, draftToAnnotation, extendDraft, type Draft, type Tool, type ToolStyles } from './tools'
import { useStoreState } from './useStoreState'

interface Props {
  pageIndex: number
  geometry: PageGeometry
  scale: number
  tool: Tool
  styles: ToolStyles
  store: AnnotationStore
}

export function Overlay({ pageIndex, geometry, scale, tool, styles, store }: Props) {
  const { annotations } = useStoreState(store)
  const svgRef = useRef<SVGSVGElement>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [textEdit, setTextEdit] = useState<TextAnnotation | null>(null)
  const size = viewportSize(geometry, scale)
  const mine = annotations.filter((a) => a.page === pageIndex)

  const pointOf = (e: PointerEvent): Point => {
    const box = svgRef.current!.getBoundingClientRect()
    return { x: e.clientX - box.left, y: e.clientY - box.top }
  }
  const toAnnotation = (d: Draft, id: string) => draftToAnnotation(d, styles[d.tool], id, pageIndex, geometry, scale)

  function onPointerDown(e: PointerEvent<SVGSVGElement>) {
    if (tool === 'select' || e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setDraft(beginDraft(tool, pointOf(e)))
  }
  function onPointerMove(e: PointerEvent) {
    if (draft) setDraft(extendDraft(draft, pointOf(e)))
  }
  function onPointerUp(e: PointerEvent) {
    if (!draft) return
    const done = extendDraft(draft, pointOf(e))
    setDraft(null)
    const ann = toAnnotation(done, crypto.randomUUID())
    if (!ann) return
    if (ann.type === 'text') setTextEdit(ann)
    else store.add(ann)
  }

  const preview = draft ? toAnnotation(draft, 'draft') : null
  const previewRect = preview?.type === 'text' ? rectToViewport(geometry, scale, preview.rect) : null

  return (
    <div className="overlay" style={size}>
      <svg
        ref={svgRef}
        width={size.width}
        height={size.height}
        data-testid={`page-overlay-${pageIndex}`}
        style={{ cursor: tool === 'select' ? 'default' : 'crosshair' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setDraft(null)}
      >
        {mine.map((a) => (
          <AnnotationView key={a.id} annotation={a} geometry={geometry} scale={scale} />
        ))}
        {preview && <AnnotationView annotation={preview} geometry={geometry} scale={scale} />}
        {previewRect && <rect {...previewRect} fill="none" stroke="#2f7de1" strokeDasharray="4 3" />}
      </svg>
      {textEdit && (
        <TextEditor
          annotation={textEdit}
          geometry={geometry}
          scale={scale}
          onCancel={() => setTextEdit(null)}
          onCommit={(text) => {
            setTextEdit(null)
            if (text.trim()) store.add({ ...textEdit, text })
          }}
        />
      )}
    </div>
  )
}
