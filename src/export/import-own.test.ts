import { PDFDict, PDFDocument, PDFName } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { makePdf } from '../../tests/helpers/makePdf'
import type { Annotation } from '../model/types'
import { decodeAnnotation, encodeAnnotation } from './annot-data'
import { exportPdf } from './export-pdf'
import { extractOwnAnnotations } from './import-own'

const base = { page: 0, pageRotation: 90 as const, color: { r: 1, g: 0, b: 0 }, opacity: 0.5 }
const rect = { x: 10, y: 20, width: 100, height: 50 }
const all: Annotation[] = [
  { ...base, id: 'h', type: 'highlight', rect },
  { ...base, id: 'u', type: 'underline', strokeWidth: 2, rect },
  { ...base, id: 's', type: 'strikeout', strokeWidth: 2, rect },
  { ...base, id: 'r', type: 'rectangle', strokeWidth: 3, rect, fill: { r: 0, g: 0, b: 1 } },
  { ...base, id: 'e', type: 'ellipse', strokeWidth: 2, rect, fill: { r: 0, g: 1, b: 0 } },
  { ...base, id: 'l', type: 'line', strokeWidth: 2, from: { x: 0, y: 0 }, to: { x: 50, y: 50 } },
  { ...base, id: 'a', type: 'arrow', strokeWidth: 2, from: { x: 0, y: 0 }, to: { x: 50, y: 50 } },
  { ...base, id: 'p', type: 'pen', strokeWidth: 2.5, points: [{ x: 1, y: 2 }, { x: 3, y: 4 }] },
  { ...base, id: 't', type: 'text', rect, text: 'héllo 日本 😀', fontSize: 14 },
]
const annotsOn = async (bytes: Uint8Array, page = 0) =>
  (await PDFDocument.load(bytes)).getPage(page).node.Annots()?.size() ?? 0

describe('extractOwnAnnotations', () => {
  it('returns every annotation the app exported, exactly, and removes them from the file', async () => {
    const src = await makePdf([{ width: 612, height: 792 }, { width: 612, height: 792 }])
    const two = all.map((a, i) => ({ ...a, page: i % 2 }) as Annotation)
    const { bytes } = await exportPdf(src, two)
    const out = await extractOwnAnnotations(bytes)
    expect(out.annotations).toHaveLength(all.length)
    const strip = (list: readonly Annotation[]) => list.map(({ id: _id, ...rest }) => rest).sort((a, b) => a.type.localeCompare(b.type))
    expect(strip(out.annotations)).toEqual(strip(two))
    expect(await annotsOn(out.bytes, 0)).toBe(0)
    expect(await annotsOn(out.bytes, 1)).toBe(0)
  })

  it('returns the original bytes when the file has none of the app\'s annotations', async () => {
    const src = await makePdf([{ width: 200, height: 200 }])
    const out = await extractOwnAnnotations(src)
    expect(out.bytes).toBe(src)
    expect(out.annotations).toEqual([])
  })

  it('leaves other apps\' annotations and unreadable files alone', async () => {
    const src = await makePdf([{ width: 200, height: 200 }])
    const doc = await PDFDocument.load(src)
    const foreign = doc.context.register(doc.context.obj({ Type: 'Annot', Subtype: 'Square', Rect: [0, 0, 10, 10] }))
    doc.getPage(0).node.addAnnot(foreign)
    const withForeign = await doc.save()
    const { bytes } = await exportPdf(withForeign, [all[3]])
    const out = await extractOwnAnnotations(bytes)
    expect(out.annotations).toHaveLength(1)
    expect(await annotsOn(out.bytes)).toBe(1)
    const junk = new TextEncoder().encode('not a pdf')
    expect((await extractOwnAnnotations(junk)).bytes).toBe(junk)
  })

  it('keeps entries whose stored data is malformed in the page', async () => {
    const src = await makePdf([{ width: 200, height: 200 }])
    const { bytes } = await exportPdf(src, [all[3]])
    const doc = await PDFDocument.load(bytes)
    const arr = doc.getPage(0).node.Annots()!
    const dict = doc.context.lookup(arr.get(0), PDFDict)
    dict.set(PDFName.of('PdfAnnotatorData'), doc.context.obj('{"v":1,"type":"rectangle"}'))
    const out = await extractOwnAnnotations(await doc.save())
    expect(out.annotations).toEqual([])
  })
})

describe('decodeAnnotation', () => {
  const good = encodeAnnotation(all[3])
  it('round-trips and takes id and page from the caller', () => {
    expect(decodeAnnotation(good, 'new', 4)).toEqual({ ...all[3], id: 'new', page: 4 })
  })
  it('rejects bad versions, shapes and values', () => {
    const mutate = (f: (o: Record<string, unknown>) => void) => {
      const o = JSON.parse(good) as Record<string, unknown>
      f(o)
      return decodeAnnotation(JSON.stringify(o), 'x', 0)
    }
    expect(decodeAnnotation('nope', 'x', 0)).toBeNull()
    expect(decodeAnnotation('[]', 'x', 0)).toBeNull()
    expect(mutate((o) => { o.v = 2 })).toBeNull()
    expect(mutate((o) => { o.type = 'stamp' })).toBeNull()
    expect(mutate((o) => { o.opacity = 5 })).toBeNull()
    expect(mutate((o) => { o.pageRotation = 45 })).toBeNull()
    expect(mutate((o) => { o.color = { r: 2, g: 0, b: 0 } })).toBeNull()
    expect(mutate((o) => { o.rect = { x: 0, y: 0, width: -1, height: 1 } })).toBeNull()
    expect(mutate((o) => { o.strokeWidth = 'wide' })).toBeNull()
    expect(mutate((o) => { o.fill = { r: 0 } })).toBeNull()
  })
  it('drops unknown fields', () => {
    const o = { ...JSON.parse(good), evil: 'x' }
    expect(decodeAnnotation(JSON.stringify(o), 'x', 0)).not.toHaveProperty('evil')
  })
})
