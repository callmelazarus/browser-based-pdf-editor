import { PDFDocument, StandardFonts, degrees } from 'pdf-lib'

export interface PageSpec {
  width: number
  height: number
  rotate?: 0 | 90 | 180 | 270
  /** [x, y, width, height] in user space */
  cropBox?: [number, number, number, number]
  label?: string
}

export async function makePdf(pages: PageSpec[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  pages.forEach((spec, i) => {
    const page = doc.addPage([spec.width, spec.height])
    if (spec.rotate) page.setRotation(degrees(spec.rotate))
    if (spec.cropBox) page.setCropBox(...spec.cropBox)
    page.drawText(spec.label ?? `Page ${i + 1}`, { x: 20, y: spec.height - 40, size: 20, font })
  })
  return doc.save()
}
