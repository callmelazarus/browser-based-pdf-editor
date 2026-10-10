import { PDFDocument, StandardFonts, type PDFFont } from 'pdf-lib'

let font: PDFFont | null = null

/** Must be awaited once before measureText is used. Safe to call repeatedly. */
export async function loadHelvetica(): Promise<void> {
  if (font) return
  const doc = await PDFDocument.create()
  font = await doc.embedFont(StandardFonts.Helvetica)
}

/** `text` must be sanitized (WinAnsi characters only). */
export function measureText(text: string, size: number): number {
  if (!font) throw new Error('Helvetica is not loaded; await loadHelvetica() first')
  return font.widthOfTextAtSize(text, size)
}
