import { useRef, useState } from 'react'
import { rectToViewport, type PageGeometry } from '../coords/page-space'
import type { TextAnnotation } from '../model/types'
import { LINE_HEIGHT, TEXT_PADDING } from '../text/layout'
import { css } from './color'

interface Props {
  annotation: TextAnnotation
  geometry: PageGeometry
  scale: number
  onCommit: (text: string) => void
  onCancel: () => void
}

/** An in-place editor. The page's text is always upright on screen, so a plain textarea over the viewport rect lines up at any page rotation. */
export function TextEditor({ annotation, geometry, scale, onCommit, onCancel }: Props) {
  const r = rectToViewport(geometry, scale, annotation.rect)
  const [value, setValue] = useState(annotation.text)
  const done = useRef(false)
  const finish = (commit: boolean) => {
    if (done.current) return
    done.current = true
    if (commit) onCommit(value)
    else onCancel()
  }
  return (
    <textarea
      data-testid="text-editor"
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !e.nativeEvent.isComposing) {
          e.stopPropagation()
          finish(false)
        }
      }}
      style={{
        position: 'absolute', left: r.x, top: r.y, width: r.width, height: r.height, boxSizing: 'border-box',
        padding: TEXT_PADDING * scale, fontFamily: 'Helvetica, Arial, sans-serif', fontSize: annotation.fontSize * scale,
        lineHeight: LINE_HEIGHT, color: css(annotation.color), border: '1px dashed #2f7de1',
        background: 'rgba(255,255,255,0.7)', pointerEvents: 'auto', resize: 'none', outline: 'none', overflow: 'hidden', margin: 0,
      }}
    />
  )
}
