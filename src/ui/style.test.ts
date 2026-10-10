import { describe, expect, it } from 'vitest'
import type { Annotation } from '../model/types'
import { controlsFor, styleOf, stylePatchFor } from './style'

const base = { id: 'a', page: 0, pageRotation: 0 as const, color: { r: 1, g: 0, b: 0 }, opacity: 0.7 }
const rect = { x: 0, y: 0, width: 10, height: 10 }

describe('style helpers', () => {
  it('reads the style of an annotation, falling back to defaults for fields it lacks', () => {
    const h: Annotation = { ...base, type: 'highlight', rect }
    expect(styleOf(h)).toMatchObject({ opacity: 0.7, color: { r: 1, g: 0, b: 0 } })
    const r: Annotation = { ...base, type: 'rectangle', rect, strokeWidth: 5 }
    expect(styleOf(r).strokeWidth).toBe(5)
  })

  it('only patches fields the annotation actually has', () => {
    const h: Annotation = { ...base, type: 'highlight', rect }
    expect(stylePatchFor(h, { strokeWidth: 9, fontSize: 30, opacity: 0.2 })).toEqual({ opacity: 0.2 })
    const t: Annotation = { ...base, type: 'text', rect, text: 'x', fontSize: 12 }
    expect(stylePatchFor(t, { fontSize: 30, strokeWidth: 9 })).toEqual({ fontSize: 30 })
  })

  it('shows the right controls per type', () => {
    expect(controlsFor('highlight')).toEqual({ opacity: true, strokeWidth: false, fontSize: false })
    expect(controlsFor('rectangle')).toEqual({ opacity: true, strokeWidth: true, fontSize: false })
    expect(controlsFor('text')).toEqual({ opacity: false, strokeWidth: false, fontSize: true })
  })
})
