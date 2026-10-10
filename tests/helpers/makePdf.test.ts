import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { makePdf } from './makePdf'

describe('makePdf', () => {
  it('builds pages with the requested size, rotation and crop box', async () => {
    const bytes = await makePdf([
      { width: 612, height: 792 },
      { width: 300, height: 400, rotate: 90, cropBox: [10, 20, 200, 300] },
    ])
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(2)
    const second = doc.getPage(1)
    expect(second.getRotation().angle).toBe(90)
    expect(second.getCropBox()).toEqual({ x: 10, y: 20, width: 200, height: 300 })
  })
})
