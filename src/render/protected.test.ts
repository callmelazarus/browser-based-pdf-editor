import { describe, expect, it } from 'vitest'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { makeEncryptedPdf } from '../../tests/helpers/makeEncryptedPdf'
import { makePdf } from '../../tests/helpers/makePdf'
import { assertNotProtected, PdfLoadError } from './pdf-document'

async function load(bytes: Uint8Array) {
  const task = pdfjs.getDocument({ data: bytes.slice() })
  return { doc: await task.promise, close: () => task.destroy() }
}

describe('assertNotProtected', () => {
  it('rejects a permissions-only encrypted PDF (empty user password) that pdf.js opens', async () => {
    const { doc, close } = await load(makeEncryptedPdf('', 'owner'))
    await expect(assertNotProtected(doc)).rejects.toMatchObject({ kind: 'protected' })
    await expect(assertNotProtected(doc)).rejects.toBeInstanceOf(PdfLoadError)
    await expect(assertNotProtected(doc)).rejects.toThrow(/protected/i)
    await close()
  })

  it('accepts an unencrypted PDF', async () => {
    const { doc, close } = await load(await makePdf([{ width: 100, height: 100 }]))
    await expect(assertNotProtected(doc)).resolves.toBeUndefined()
    await close()
  })
})
