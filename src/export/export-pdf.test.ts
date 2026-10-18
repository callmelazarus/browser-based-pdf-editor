import { describe, expect, it } from 'vitest'
import { PDFDict, PDFDocument, PDFName, PDFStream, PDFString } from 'pdf-lib'
import { makePdf } from '../../tests/helpers/makePdf'
import type { Annotation } from '../model/types'
import { makeEncryptedPdf } from '../../tests/helpers/makeEncryptedPdf'
import { exportPdf } from './export-pdf'

const base = { page: 0, pageRotation: 0 as const, color: { r: 1, g: 0, b: 0 }, opacity: 0.5 }
const rect = { x: 10, y: 20, width: 100, height: 50 }

async function readAnnots(bytes: Uint8Array, pageIndex = 0) {
  const doc = await PDFDocument.load(bytes)
  const arr = doc.getPage(pageIndex).node.Annots()
  const dicts = (arr?.asArray() ?? []).map((ref) => doc.context.lookup(ref, PDFDict))
  return { doc, dicts }
}
const subtype = (d: PDFDict) => (d.get(PDFName.of('Subtype')) as PDFName).decodeText()
const nm = (d: PDFDict) => d.lookup(PDFName.of('NM'), PDFString).decodeText()
function apText(d: PDFDict): string {
  const ap = d.lookup(PDFName.of('AP'), PDFDict)
  const stream = ap.lookup(PDFName.of('N'), PDFStream)
  return new TextDecoder().decode(stream.getContents())
}

const one = (a: Annotation) => [a]

describe('exportPdf', () => {
  it('writes the interior colour of a filled rectangle and omits it otherwise', async () => {
    const src = await makePdf([{ width: 200, height: 200 }])
    const filled = await exportPdf(src, [
      { ...base, id: 'f', type: 'rectangle', strokeWidth: 2, rect, fill: { r: 0, g: 0, b: 1 } },
      { ...base, id: 'g', type: 'ellipse', strokeWidth: 2, rect, fill: { r: 0, g: 0, b: 1 } },
    ])
    const plain = await exportPdf(src, one({ ...base, id: 'p', type: 'rectangle', strokeWidth: 2, rect }))
    const ic = async (bytes: Uint8Array) => (await readAnnots(bytes)).dicts[0].get(PDFName.of('IC'))
    expect((await ic(filled.bytes))?.toString()).toBe('[ 0 0 1 ]')
    expect((await readAnnots(filled.bytes)).dicts[1].get(PDFName.of('IC'))?.toString()).toBe('[ 0 0 1 ]')
    expect(await ic(plain.bytes)).toBeUndefined()
    expect(apText((await readAnnots(filled.bytes)).dicts[0])).toContain('0 0 1 rg')
  })

  it('writes a native annotation with an appearance stream for each type', async () => {
    const source = await makePdf([{ width: 612, height: 792 }])
    const annotations: Annotation[] = [
      { ...base, id: 'h', type: 'highlight', rect },
      { ...base, id: 'u', type: 'underline', strokeWidth: 2, rect },
      { ...base, id: 's', type: 'strikeout', strokeWidth: 2, rect },
      { ...base, id: 'r', type: 'rectangle', strokeWidth: 2, rect },
      { ...base, id: 'e', type: 'ellipse', strokeWidth: 2, rect },
      { ...base, id: 'l', type: 'line', strokeWidth: 2, from: { x: 0, y: 0 }, to: { x: 50, y: 50 } },
      { ...base, id: 'a', type: 'arrow', strokeWidth: 2, from: { x: 0, y: 0 }, to: { x: 50, y: 50 } },
      { ...base, id: 'p', type: 'pen', strokeWidth: 2, points: [{ x: 1, y: 1 }, { x: 9, y: 9 }] },
      { ...base, id: 't', type: 'text', rect, text: 'Hello', fontSize: 12 },
    ]
    const { bytes, problems } = await exportPdf(source, annotations)
    expect(problems).toEqual([])
    const { dicts } = await readAnnots(bytes)
    expect(dicts.map(subtype)).toEqual([
      'Highlight', 'Underline', 'StrikeOut', 'Square', 'Circle', 'Line', 'Line', 'Ink', 'FreeText',
    ])
    expect(dicts.map(nm)).toEqual(['h', 'u', 's', 'r', 'e', 'l', 'a', 'p', 't'])
    for (const d of dicts) expect(apText(d).length).toBeGreaterThan(0)
  })

  it('writes type-specific fields', async () => {
    const source = await makePdf([{ width: 612, height: 792 }])
    const { bytes } = await exportPdf(source, [
      { ...base, id: 'h', type: 'highlight', rect },
      { ...base, id: 't', type: 'text', rect, text: 'Hi', fontSize: 12 },
    ])
    const { dicts } = await readAnnots(bytes)
    const quad = dicts[0]!.lookup(PDFName.of('QuadPoints'))!.toString()
    expect(quad).toBe('[ 10 70 110 70 10 20 110 20 ]')
    expect(dicts[1].has(PDFName.of('DA'))).toBe(true)
    expect(dicts[1].has(PDFName.of('C'))).toBe(false)
  })

  it('puts a multiply blend in the highlight appearance resources', async () => {
    const source = await makePdf([{ width: 612, height: 792 }])
    const { bytes } = await exportPdf(source, one({ ...base, id: 'h', type: 'highlight', rect }))
    const { dicts } = await readAnnots(bytes)
    const stream = dicts[0].lookup(PDFName.of('AP'), PDFDict).lookup(PDFName.of('N'), PDFStream)
    expect(stream.dict.toString()).toContain('/BM /Multiply')
  })

  it('places each annotation on its own page', async () => {
    const source = await makePdf([{ width: 612, height: 792 }, { width: 612, height: 792 }])
    const { bytes } = await exportPdf(source, one({ ...base, id: 'x', page: 1, type: 'highlight', rect }))
    expect((await readAnnots(bytes, 0)).dicts).toHaveLength(0)
    expect((await readAnnots(bytes, 1)).dicts).toHaveLength(1)
  })

  it('never modifies the original bytes', async () => {
    const source = await makePdf([{ width: 612, height: 792 }])
    const copy = source.slice()
    await exportPdf(source, one({ ...base, id: 'h', type: 'highlight', rect }))
    expect(source).toEqual(copy)
  })

  it('keeps existing annotations, including those from a previous export', async () => {
    const source = await makePdf([{ width: 612, height: 792 }])
    const first = await exportPdf(source, one({ ...base, id: 'a', type: 'highlight', rect }))
    const second = await exportPdf(first.bytes, one({ ...base, id: 'b', type: 'rectangle', strokeWidth: 2, rect }))
    const { dicts } = await readAnnots(second.bytes)
    expect(dicts.map(nm)).toEqual(['a', 'b'])
  })

  it('reports an error for a bad page but still writes the others', async () => {
    const source = await makePdf([{ width: 612, height: 792 }])
    const { bytes, problems } = await exportPdf(source, [
      { ...base, id: 'bad', page: 5, type: 'highlight', rect },
      { ...base, id: 'ok', type: 'highlight', rect },
    ])
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatchObject({ annotationId: 'bad', severity: 'error' })
    expect((await readAnnots(bytes)).dicts.map(nm)).toEqual(['ok'])
  })

  it('warns about unsupported characters and clipped text, but still exports', async () => {
    const source = await makePdf([{ width: 612, height: 792 }])
    const { bytes, problems } = await exportPdf(source, [
      { ...base, id: 'emoji', type: 'text', rect, text: 'Hi 😀', fontSize: 12 },
      { ...base, id: 'long', type: 'text', rect: { x: 0, y: 0, width: 60, height: 20 }, text: 'one two three four five six seven', fontSize: 12 },
    ])
    expect(problems.map((p) => [p.annotationId, p.severity])).toEqual([['emoji', 'warning'], ['long', 'warning']])
    expect(problems[0].message).toContain('😀')
    expect((await readAnnots(bytes)).dicts).toHaveLength(2)
  })

  it('keeps text upright on a rotated page', async () => {
    const source = await makePdf([{ width: 612, height: 792, rotate: 90 }])
    const { bytes } = await exportPdf(source, one({ ...base, id: 't', pageRotation: 90, type: 'text', rect: { x: 100, y: 200, width: 50, height: 30 }, text: 'Hi', fontSize: 10 }))
    const { dicts } = await readAnnots(bytes)
    expect(apText(dicts[0])).toContain('0 1 -1 0 150 200 cm')
  })
})

describe('exportPdf edge cases', () => {
  it('skips a pen annotation with no points without error or annotation object', async () => {
    const source = await makePdf([{ width: 612, height: 792 }])
    const { bytes, problems } = await exportPdf(source, [
      { ...base, id: 'empty', type: 'pen', strokeWidth: 2, points: [] },
      { ...base, id: 'ok', type: 'highlight', rect },
    ])
    expect(problems).toEqual([])
    expect((await readAnnots(bytes)).dicts.map(nm)).toEqual(['ok'])
  })

  it('does not crash on emoji, CJK, curly quotes and tabs, and reports what was replaced', async () => {
    const source = await makePdf([{ width: 612, height: 792 }])
    const big = { x: 0, y: 0, width: 400, height: 200 }
    const { bytes, problems } = await exportPdf(source, [
      { ...base, id: 'cjk', type: 'text', rect: big, text: '日本語 \u{1F600}', fontSize: 12 },
      { ...base, id: 'quotes', type: 'text', rect: big, text: '\u201Cquoted\u201D \u2019s', fontSize: 12 },
      { ...base, id: 'tab', type: 'text', rect: big, text: 'a\tb', fontSize: 12 },
    ])
    expect(problems.map((p) => [p.annotationId, p.severity])).toEqual([['cjk', 'warning'], ['tab', 'warning']])
    expect(problems[0].message).toContain('日')
    const { dicts } = await readAnnots(bytes)
    expect(dicts).toHaveLength(3)
    expect(apText(dicts[1])).toContain('\\223quoted\\224')
    expect(apText(dicts[2])).toContain('(a b)')
  })

  it('appends to a page whose original file already has annotations', async () => {
    const doc = await PDFDocument.create()
    const page = doc.addPage([612, 792])
    const link = doc.context.register(doc.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [0, 0, 10, 10] }))
    page.node.set(PDFName.of('Annots'), doc.context.obj([link]))
    const source = await doc.save()
    const { bytes } = await exportPdf(source, one({ ...base, id: 'n', type: 'highlight', rect }))
    const { dicts } = await readAnnots(bytes)
    expect(dicts.map(subtype)).toEqual(['Link', 'Highlight'])
  })
})

describe('QuadPoints on rotated pages', () => {
  const r = { x: 10, y: 20, width: 100, height: 50 }
  const cases: [0 | 90 | 180 | 270, string][] = [
    [0, '[ 10 70 110 70 10 20 110 20 ]'],
    [90, '[ 10 20 10 70 110 20 110 70 ]'],
    [180, '[ 110 20 10 20 110 70 10 70 ]'],
    [270, '[ 110 70 110 20 10 70 10 20 ]'],
  ]
  for (const [rot, expected] of cases) {
    it(`derives QuadPoints from the screen frame at rotation ${rot}`, async () => {
      const source = await makePdf([{ width: 612, height: 792, rotate: rot }])
      const types = ['highlight', 'underline', 'strikeout'] as const
      const anns: Annotation[] = types.map((type) =>
        type === 'highlight'
          ? { ...base, id: type, pageRotation: rot, type, rect: r }
          : { ...base, id: type, pageRotation: rot, type, strokeWidth: 2, rect: r })
      const { bytes } = await exportPdf(source, anns)
      const { dicts } = await readAnnots(bytes)
      for (const d of dicts) {
        expect(d.lookup(PDFName.of('QuadPoints'))!.toString()).toBe(expected)
        expect(d.lookup(PDFName.of('Rect'))!.toString()).toBe('[ 10 20 110 70 ]')
      }
    })
  }

  it('puts the underline edge on the QuadPoints bottom edge at rotation 90', async () => {
    const source = await makePdf([{ width: 612, height: 792, rotate: 90 }])
    const { bytes } = await exportPdf(source, one({ ...base, id: 'u', pageRotation: 90, type: 'underline', strokeWidth: 2, rect: r }))
    const { dicts } = await readAnnots(bytes)
    // AP matrix 0 1 -1 0 110 20; line at local y=1 -> page x = 110 - 1 = 109, running along page y.
    // QuadPoints bottom edge (BL,BR) is page x=110, the same edge.
    expect(apText(dicts[0]!)).toContain('0 1 -1 0 110 20 cm')
    expect(apText(dicts[0]!)).toContain('0 1 m')
    expect(dicts[0]!.lookup(PDFName.of('QuadPoints'))!.toString()).toContain('110 20 110 70 ]')
  })

  it('does not leak an annotation onto another page that shares the same indirect /Annots array', async () => {
    const src = await PDFDocument.create()
    const p1 = src.addPage([200, 200])
    const p2 = src.addPage([200, 200])
    const existing = src.context.register(src.context.obj({ Type: 'Annot', Subtype: 'Square', Rect: [0, 0, 10, 10], NM: PDFString.of('old') }))
    const shared = src.context.register(src.context.obj([existing]))
    p1.node.set(PDFName.of('Annots'), shared)
    p2.node.set(PDFName.of('Annots'), shared)
    const source = await src.save()

    const { bytes } = await exportPdf(source, one({ ...base, id: 'new', type: 'rectangle', strokeWidth: 2, rect }))
    const first = (await readAnnots(bytes, 0)).dicts.map(nm)
    const second = (await readAnnots(bytes, 1)).dicts.map(nm)
    expect(first).toEqual(['old', 'new'])
    expect(second).toEqual(['old'])
  })

  it('explains in plain words why an encrypted PDF cannot be exported', async () => {
    const source = makeEncryptedPdf('', 'owner')
    await expect(exportPdf(source, one({ ...base, id: 'a', type: 'rectangle', strokeWidth: 2, rect }))).rejects.toThrow(
      'This PDF is protected and cannot be annotated here.',
    )
  })
})
