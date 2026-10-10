import { expect, test } from '@playwright/test'
import { makePdf } from '../tests/helpers/makePdf'
import { makeEncryptedPdf } from '../tests/helpers/makeEncryptedPdf'
import { canvasWidth, openPdfInApp, renderedCanvasCount, uploadFile } from './helpers'

test('opens a PDF and renders its pages', async ({ page }) => {
  await openPdfInApp(page, await makePdf([{ width: 612, height: 792 }, { width: 612, height: 792 }]))
  await expect(page.getByTestId('page-1')).toBeVisible()
})

test('zoom changes the page size', async ({ page }) => {
  await openPdfInApp(page, await makePdf([{ width: 612, height: 792 }]))
  const before = (await page.getByTestId('page-0').boundingBox())!.width
  await page.getByTestId('zoom-in').click()
  await expect.poll(async () => (await page.getByTestId('page-0').boundingBox())!.width).toBeGreaterThan(before)
})

test('renders only pages near the viewport in a long document', async ({ page }) => {
  const pdf = await makePdf(Array.from({ length: 120 }, () => ({ width: 612, height: 792 })))
  await openPdfInApp(page, pdf)
  expect(await renderedCanvasCount(page)).toBeLessThan(12)

  // Scrolling far down must release the canvases left behind, not accumulate them.
  await page.locator('.pages').evaluate((el) => (el.scrollTop = el.scrollHeight))
  await expect.poll(() => canvasWidth(page, 119)).toBeGreaterThan(0)
  await expect.poll(() => canvasWidth(page, 0)).toBe(0)
  expect(await renderedCanvasCount(page)).toBeLessThan(12)
})

test('prefetches pages just below the visible scroller but not far ones', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 400 })
  const pdf = await makePdf(Array.from({ length: 120 }, () => ({ width: 612, height: 792 })))
  await openPdfInApp(page, pdf)
  // Distance of each page's top edge below the scroller's bottom edge (no scrolling).
  const gaps = await page.evaluate(() => {
    const bottom = document.querySelector('.pages')!.getBoundingClientRect().bottom
    return [...Array(6).keys()].map(
      (i) => document.querySelector(`[data-testid="page-${i}"]`)!.getBoundingClientRect().top - bottom,
    )
  })
  const near = gaps.findIndex((g) => g >= 400 && g <= 700)
  const far = gaps.findIndex((g) => g > 1500)
  expect(near, `gaps ${gaps}`).toBeGreaterThan(0)
  expect(far).toBeGreaterThan(near)
  await expect.poll(() => canvasWidth(page, near)).toBeGreaterThan(0)
  expect(await canvasWidth(page, far)).toBe(0)
})

test.describe('bad uploads', () => {
  test('rejects a file that is not a PDF', async ({ page }) => {
    await uploadFile(page, 'notes.pdf', Buffer.from('hello, I am not a pdf'))
    await expect(page.getByRole('alert')).toContainText('valid PDF')
    await expect(page.getByTestId('upload-input')).toBeAttached()
  })

  test('rejects an empty file', async ({ page }) => {
    await uploadFile(page, 'empty.pdf', Buffer.alloc(0))
    await expect(page.getByRole('alert')).toContainText('valid PDF')
    await expect(page.getByTestId('upload-input')).toBeAttached()
  })

  test('rejects a permissions-only encrypted PDF (empty user password) up front', async ({ page }) => {
    await uploadFile(page, 'restricted.pdf', makeEncryptedPdf('', 'owner'))
    await expect(page.getByRole('alert')).toContainText(/protected/i)
    await expect(page.getByTestId('upload-input')).toBeAttached()
    await expect(page.getByTestId('page-0')).toHaveCount(0)
  })

  test('rejects a password-protected PDF with a clear message', async ({ page }) => {
    await uploadFile(page, 'locked.pdf', makeEncryptedPdf())
    await expect(page.getByRole('alert')).toContainText(/password/i)
    await expect(page.getByTestId('upload-input')).toBeAttached()
    await expect(page.getByTestId('page-0')).toHaveCount(0)
  })
})
