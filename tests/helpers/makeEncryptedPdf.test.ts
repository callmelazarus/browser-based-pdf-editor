import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { makeEncryptedPdf } from './makeEncryptedPdf'

// Guards the fixture itself: it must be a genuinely encrypted PDF that pdf.js
// rejects without the password and opens with it.
describe('makeEncryptedPdf', () => {
  it('requires the password in pdf.js', async () => {
    const without = getDocument({ data: makeEncryptedPdf().slice() })
    await expect(without.promise).rejects.toMatchObject({ name: 'PasswordException' })
    await without.destroy()

    const withPw = getDocument({ data: makeEncryptedPdf().slice(), password: 'secret' })
    const doc = await withPw.promise
    expect(doc.numPages).toBe(1)
    await withPw.destroy()
  })
})
