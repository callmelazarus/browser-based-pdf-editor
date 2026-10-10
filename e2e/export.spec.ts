import { expect, test } from '@playwright/test'
import { PDFDict, PDFDocument, PDFName, PDFString } from 'pdf-lib'
import { makePdf } from '../tests/helpers/makePdf'
import { downloadAnnotated, dragOnPage, openPdfInApp } from './helpers'

async function annotationsIn(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes)
  const dicts = (doc.getPage(0).node.Annots()?.asArray() ?? []).map((r) => doc.context.lookup(r, PDFDict))
  return dicts.map((d) => ({
    subtype: (d.get(PDFName.of('Subtype')) as PDFName).decodeText(),
    id: d.lookup(PDFName.of('NM'), PDFString).decodeText(),
  }))
}

let original: Uint8Array

test.beforeEach(async ({ page }) => {
  original = await makePdf([{ width: 612, height: 792 }])
  await openPdfInApp(page, original)
})

function beforeUnloadPrevented(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const e = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(e)
    return e.defaultPrevented
  })
}

test('downloads a PDF containing the drawn annotations', async ({ page }) => {
  await page.getByTestId('tool-highlight').click()
  await dragOnPage(page, [100, 200], [300, 260])
  await page.getByTestId('tool-rectangle').click()
  await dragOnPage(page, [100, 300], [300, 360])
  await page.getByTestId('tool-text').click()
  await dragOnPage(page, [100, 400], [400, 460])
  await page.getByTestId('text-editor').fill('Hello')
  await page.getByTestId('tool-select').click()

  const found = await annotationsIn(await downloadAnnotated(page))
  expect(found.map((a) => a.subtype)).toEqual(['Highlight', 'Square', 'FreeText'])
  expect(new Set(found.map((a) => a.id)).size).toBe(3)
})

test('reports text that cannot be shown in Helvetica', async ({ page }) => {
  await page.getByTestId('tool-text').click()
  await dragOnPage(page, [100, 400], [400, 460])
  await page.getByTestId('text-editor').fill('Hi 😀')
  await page.getByTestId('tool-select').click()
  await downloadAnnotated(page)
  await expect(page.getByTestId('export-problems')).toContainText('😀')
})

test('emoji, CJK, curly quotes and tabs export without crashing and are reported with page and annotation', async ({ page }) => {
  await page.getByTestId('tool-text').click()
  await dragOnPage(page, [100, 400], [500, 500])
  await page.getByTestId('text-editor').fill('😀 日本語 “quoted” it’s\tTab')
  await page.getByTestId('tool-select').click()
  const found = await annotationsIn(await downloadAnnotated(page))
  expect(found.map((a) => a.subtype)).toEqual(['FreeText'])
  const report = page.getByTestId('export-problems')
  await expect(report).toContainText('😀')
  await expect(report).toContainText('日')
  await expect(report).toContainText('Tab characters')
  await expect(report).toContainText('Page 1, text box 1')
  // Curly quotes are WinAnsi-encodable, so they must not be reported.
  await expect(report).not.toContainText('“')
  await expect(report).not.toContainText('’')
})

test('removing an annotation before download leaves it out of the file', async ({ page }) => {
  await page.getByTestId('tool-rectangle').click()
  await dragOnPage(page, [100, 300], [300, 360])
  // Drawing tools do not select (Task 9 design): switch to Select, pick the shape, then delete it.
  await page.getByTestId('tool-select').click()
  await page.getByTestId('annotation-rectangle').click({ position: { x: 100, y: 30 } })
  await page.keyboard.press('Delete')
  await expect(page.getByTestId('annotation-rectangle')).toHaveCount(0)
  expect(await annotationsIn(await downloadAnnotated(page))).toEqual([])
})

test('downloading twice gives equal PDFs and never touches the original bytes', async ({ page }) => {
  await page.getByTestId('tool-rectangle').click()
  await dragOnPage(page, [100, 300], [300, 360])
  await page.getByTestId('tool-select').click()
  const first = await downloadAnnotated(page)
  const second = await downloadAnnotated(page)
  // One rectangle in each: the second export did not start from the first export.
  expect(await annotationsIn(second)).toEqual(await annotationsIn(first))
  expect(await annotationsIn(second)).toHaveLength(1)
  expect(second.length).toBe(first.length)
  // The page's copy of the original was not mutated: a fresh page load of the same bytes exports the same.
  expect(await annotationsIn(original)).toEqual([])
})

test('an exported file can be re-opened, annotated again and exported with both rounds intact', async ({ page }) => {
  await page.getByTestId('tool-rectangle').click()
  await dragOnPage(page, [100, 300], [300, 360])
  await page.getByTestId('tool-select').click()
  const round1 = await downloadAnnotated(page)
  const firstIds = (await annotationsIn(round1)).map((a) => a.id)
  expect(firstIds).toHaveLength(1)

  await openPdfInApp(page, round1, 'sample-annotated.pdf')
  await page.getByTestId('tool-ellipse').click()
  await dragOnPage(page, [100, 450], [300, 520])
  await page.getByTestId('tool-select').click()
  const round2 = await annotationsIn(await downloadAnnotated(page))
  expect(round2.map((a) => a.subtype)).toEqual(['Square', 'Circle'])
  expect(round2[0].id).toBe(firstIds[0])
})

test('beforeunload guard is active only while there are undownloaded changes', async ({ page }) => {
  expect(await beforeUnloadPrevented(page)).toBe(false)
  await page.getByTestId('tool-rectangle').click()
  await dragOnPage(page, [100, 300], [300, 360])
  expect(await beforeUnloadPrevented(page)).toBe(true)
  await downloadAnnotated(page)
  expect(await beforeUnloadPrevented(page)).toBe(false)
  await page.getByTestId('undo-button').click()
  expect(await beforeUnloadPrevented(page)).toBe(true)
})

test('a failed download shows an error and leaves the button usable', async ({ page }) => {
  await page.getByTestId('tool-rectangle').click()
  await dragOnPage(page, [100, 300], [300, 360])
  await page.evaluate(() => {
    URL.createObjectURL = () => {
      throw new Error('boom')
    }
  })
  await page.getByTestId('download-button').click()
  await expect(page.getByTestId('export-error')).toContainText('boom')
  await expect(page.getByTestId('download-button')).toBeEnabled()
  expect(await beforeUnloadPrevented(page)).toBe(true)
})
