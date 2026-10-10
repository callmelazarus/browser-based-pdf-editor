import type { Annotation, AnnotationType } from '../model/types'
import { DEFAULT_STYLES, type StyleDefaults } from './tools'

export function styleOf(a: Annotation): StyleDefaults {
  return {
    color: a.color,
    opacity: a.opacity,
    strokeWidth: 'strokeWidth' in a ? a.strokeWidth : DEFAULT_STYLES[a.type].strokeWidth,
    fontSize: a.type === 'text' ? a.fontSize : DEFAULT_STYLES[a.type].fontSize,
  }
}

export function stylePatchFor(a: Annotation, patch: Partial<StyleDefaults>): Partial<Annotation> {
  const out: Record<string, unknown> = {}
  if (patch.color) out.color = patch.color
  if (patch.opacity !== undefined) out.opacity = patch.opacity
  if (patch.strokeWidth !== undefined && 'strokeWidth' in a) out.strokeWidth = patch.strokeWidth
  if (patch.fontSize !== undefined && a.type === 'text') out.fontSize = patch.fontSize
  return out as Partial<Annotation>
}

export function controlsFor(type: AnnotationType) {
  return {
    opacity: type !== 'text',
    strokeWidth: type !== 'highlight' && type !== 'text',
    fontSize: type === 'text',
  }
}
