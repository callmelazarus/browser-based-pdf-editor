import { PDFDocument, PDFName } from 'pdf-lib'

/**
 * CCITT Group 4 data for an 8x8 all-black image. Row 1 is horizontal mode (001) with a
 * zero-length white run (00110101) and an 8-pixel black run (000101); each later row matches the
 * all-black row above it with two vertical-0 codes (1 1).
 */
function blackG4Data(): Uint8Array {
  const bits = '001' + '00110101' + '000101' + '11'.repeat(7)
  const padded = bits.padEnd(Math.ceil(bits.length / 8) * 8, '0')
  const out = new Uint8Array(padded.length / 8)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(padded.slice(i * 8, i * 8 + 8), 2)
  return out
}

/**
 * A 100x100pt page whose only content is a black 8x8 CCITTFax image drawn at x 10-60, y 10-60
 * (PDF user space). pdf.js needs its wasm decoders to paint it; without them it draws nothing.
 */
export async function makeCcittPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([100, 100])
  const ctx = doc.context
  const img = ctx.stream(blackG4Data(), {
    Type: 'XObject', Subtype: 'Image', Width: 8, Height: 8, BitsPerComponent: 1, ColorSpace: 'DeviceGray',
    Filter: 'CCITTFaxDecode', DecodeParms: { K: -1, Columns: 8, Rows: 8 },
  })
  page.node.setXObject(PDFName.of('Im0'), ctx.register(img))
  page.node.set(PDFName.of('Contents'), ctx.register(ctx.stream('q 50 0 0 50 10 10 cm /Im0 Do Q')))
  return doc.save()
}
