import { PDFDocument, PDFHexString, PDFName, PDFPage, PDFRef, PDFString, StandardFonts } from 'pdf-lib'
import { screenFrame } from '../coords/frame'
import type { Annotation } from '../model/types'
import { buildAppearance } from '../shapes/appearance'
import { loadHelvetica } from '../text/helvetica'
import { layoutTextBox } from '../text/layout'
import { findUnsupportedChars, sanitizeText } from '../text/winansi'

export interface ExportProblem {
  annotationId: string
  /** zero-based page index */
  page: number
  severity: 'warning' | 'error'
  message: string
}

export interface ExportResult {
  bytes: Uint8Array
  problems: ExportProblem[]
}

const SUBTYPES = {
  highlight: 'Highlight', underline: 'Underline', strikeout: 'StrikeOut', rectangle: 'Square',
  ellipse: 'Circle', line: 'Line', arrow: 'Line', pen: 'Ink', text: 'FreeText',
} as const

/** Never mutates `original`. Per-annotation failures are reported in `problems`; the rest are still written. */
export async function exportPdf(original: Uint8Array, annotations: readonly Annotation[]): Promise<ExportResult> {
  await loadHelvetica()
  const doc = await PDFDocument.load(original)
  const pages = doc.getPages()
  const problems: ExportProblem[] = []
  const font = annotations.some((a) => a.type === 'text') ? await doc.embedFont(StandardFonts.Helvetica) : null
  const getFontRef = (): PDFRef => {
    if (!font) throw new Error('Helvetica was not embedded')
    return font.ref
  }

  for (const ann of annotations) {
    try {
      const page = pages[ann.page]
      if (!page) throw new Error(`Page ${ann.page + 1} does not exist in this document.`)
      // A pen stroke with no points has nothing to draw; writing it would leave a degenerate annotation.
      if (ann.type === 'pen' && ann.points.length === 0) continue
      problems.push(...textProblems(ann))
      addAnnotation(doc, page, ann, getFontRef)
    } catch (e) {
      problems.push({
        annotationId: ann.id, page: ann.page, severity: 'error',
        message: e instanceof Error ? e.message : 'Could not be exported.',
      })
    }
  }
  return { bytes: await doc.save(), problems }
}

function textProblems(a: Annotation): ExportProblem[] {
  if (a.type !== 'text') return []
  const out: ExportProblem[] = []
  const bad = findUnsupportedChars(a.text)
  if (bad.length) {
    out.push({
      annotationId: a.id, page: a.page, severity: 'warning',
      message: `Characters Helvetica cannot show were replaced with "?": ${bad.join(' ')}`,
    })
  }
  if (a.text.includes('\t')) {
    out.push({ annotationId: a.id, page: a.page, severity: 'warning', message: 'Tab characters were replaced with spaces.' })
  }
  const f = screenFrame(a.rect, a.pageRotation)
  if (layoutTextBox(a.text, a.fontSize, f.width, f.height).overflows) {
    out.push({ annotationId: a.id, page: a.page, severity: 'warning', message: 'Text does not fit in its box and is clipped.' })
  }
  return out
}

function addAnnotation(doc: PDFDocument, page: PDFPage, a: Annotation, getFontRef: () => PDFRef) {
  const ctx = doc.context
  const ap = buildAppearance(a)

  const gs: Record<string, string | number> = { Type: 'ExtGState', CA: ap.opacity, ca: ap.opacity }
  if (ap.blendMultiply) gs.BM = 'Multiply'
  const resourceDict = ctx.obj({ ExtGState: { GS0: gs } })
  if (ap.usesFont) resourceDict.set(PDFName.of('Font'), ctx.obj({ F1: getFontRef() }))
  const resources = resourceDict
  const stream = ctx.stream(ap.content, { Type: 'XObject', Subtype: 'Form', BBox: ap.bbox, Resources: resources })
  const apRef = ctx.register(stream)

  const dict = ctx.obj({
    Type: 'Annot',
    Subtype: SUBTYPES[a.type],
    Rect: ap.bbox,
    F: 4,
    NM: PDFString.of(a.id),
    CA: a.opacity,
    AP: { N: apRef },
    ...typeFields(a),
  })
  page.node.addAnnot(ctx.register(dict))
}

function typeFields(a: Annotation): Record<string, unknown> {
  const color = [a.color.r, a.color.g, a.color.b]
  switch (a.type) {
    case 'highlight':
    case 'underline':
    case 'strikeout': {
      const { x, y, width, height } = a.rect
      // Top-left, top-right, bottom-left, bottom-right: the order Acrobat and Preview expect.
      return { C: color, QuadPoints: [x, y + height, x + width, y + height, x, y, x + width, y] }
    }
    case 'rectangle':
    case 'ellipse':
      return { C: color, BS: { W: a.strokeWidth, S: 'S' } }
    case 'line':
    case 'arrow':
      return {
        C: color,
        L: [a.from.x, a.from.y, a.to.x, a.to.y],
        LE: ['None', a.type === 'arrow' ? 'OpenArrow' : 'None'],
        BS: { W: a.strokeWidth, S: 'S' },
      }
    case 'pen':
      return { C: color, InkList: [a.points.flatMap((p) => [p.x, p.y])], BS: { W: a.strokeWidth, S: 'S' } }
    case 'text':
      // No /C: in FreeText it means background fill, and we do not want a fill.
      return {
        Contents: PDFHexString.fromText(sanitizeText(a.text)),
        DA: PDFString.of(`/Helv ${a.fontSize} Tf ${a.color.r} ${a.color.g} ${a.color.b} rg`),
        Q: 0,
      }
  }
}
