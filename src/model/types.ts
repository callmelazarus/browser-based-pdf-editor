export type Rotation = 0 | 90 | 180 | 270
export interface Point { x: number; y: number }
/** x,y is the lower-left corner in PDF user space. */
export interface Rect { x: number; y: number; width: number; height: number }
/** Components in 0..1. */
export interface Rgb { r: number; g: number; b: number }

interface Base {
  id: string
  /** zero-based page index */
  page: number
  /** the page's /Rotate when the annotation was created; keeps text upright on screen */
  pageRotation: Rotation
  color: Rgb
  opacity: number
}

export interface HighlightAnnotation extends Base { type: 'highlight'; rect: Rect }
export interface UnderlineAnnotation extends Base { type: 'underline'; rect: Rect; strokeWidth: number }
export interface StrikeoutAnnotation extends Base { type: 'strikeout'; rect: Rect; strokeWidth: number }
export interface RectangleAnnotation extends Base { type: 'rectangle'; rect: Rect; strokeWidth: number }
export interface EllipseAnnotation extends Base { type: 'ellipse'; rect: Rect; strokeWidth: number }
export interface LineAnnotation extends Base { type: 'line' | 'arrow'; from: Point; to: Point; strokeWidth: number }
export interface PenAnnotation extends Base { type: 'pen'; points: Point[]; strokeWidth: number }
export interface TextAnnotation extends Base { type: 'text'; rect: Rect; text: string; fontSize: number }

export type Annotation =
  | HighlightAnnotation
  | UnderlineAnnotation
  | StrikeoutAnnotation
  | RectangleAnnotation
  | EllipseAnnotation
  | LineAnnotation
  | PenAnnotation
  | TextAnnotation

export type AnnotationType = Annotation['type']
export type RectAnnotation = Extract<Annotation, { rect: Rect }>

export function isRectAnnotation(a: Annotation): a is RectAnnotation {
  return 'rect' in a
}
