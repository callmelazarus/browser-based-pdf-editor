import { expect, test } from '@playwright/test'
import { makePdf } from '../tests/helpers/makePdf'
import { dragOnPage, openPdfInApp, storedAnnotations } from './helpers'

test.beforeEach(async ({ page }) => {
  await openPdfInApp(page, await makePdf([{ width: 612, height: 792 }]))
})

test('a new line is selected right after drawing, so its colour and length can be edited', async ({ page }) => {
  await page.getByTestId('tool-line').click()
  await dragOnPage(page, [100, 200], [300, 200])

  await expect(page.getByTestId('tool-select')).toHaveAttribute('aria-pressed', 'true')
  expect((await storedAnnotations(page))[0].type).toBe('line')
  await expect(page.getByTestId('handle-to')).toBeVisible()

  await page.getByTestId('swatch-1e88e5').click()
  expect((await storedAnnotations(page))[0].color.b).toBeGreaterThan(0.8)

  const before = (await storedAnnotations(page))[0]
  const handle = (await page.getByTestId('handle-to').boundingBox())!
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
  await page.mouse.down()
  await page.mouse.move(handle.x + handle.width / 2 + 60, handle.y + handle.height / 2, { steps: 4 })
  await page.mouse.up()
  const after = (await storedAnnotations(page))[0]
  expect(after.to.x - before.to.x).toBeCloseTo(60, 0)
  expect(after.from).toEqual(before.from)
})

test('a new rectangle and a new text box are selected after they are placed', async ({ page }) => {
  await page.getByTestId('tool-rectangle').click()
  await dragOnPage(page, [100, 200], [300, 260])
  await expect(page.getByTestId('tool-select')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('handle-se')).toBeVisible()

  await page.getByTestId('tool-text').click()
  await dragOnPage(page, [100, 400], [300, 460])
  await page.keyboard.type('hello')
  await page.getByTestId('page-overlay-0').click({ position: { x: 500, y: 700 } })
  await expect(page.getByTestId('tool-select')).toHaveAttribute('aria-pressed', 'true')
  const all = await storedAnnotations(page)
  expect(all.map((a) => a.type)).toEqual(['rectangle', 'text'])
  const selectedId = await page.evaluate(() =>
    (window as unknown as { __annotationStore: { getState(): { selectedId: string | null } } }).__annotationStore.getState().selectedId)
  expect(selectedId).toBe(all[1].id)
})
