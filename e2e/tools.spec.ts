import { expect, test, type Page } from '@playwright/test'
import { makePdf } from '../tests/helpers/makePdf'
import { openPdfInApp } from './helpers'

async function overlayBox(page: Page) {
  return (await page.getByTestId('page-overlay-0').boundingBox())!
}

async function dragOnPage(page: Page, from: [number, number], to: [number, number]) {
  const box = await overlayBox(page)
  await page.mouse.move(box.x + from[0], box.y + from[1])
  await page.mouse.down()
  await page.mouse.move(box.x + (from[0] + to[0]) / 2, box.y + (from[1] + to[1]) / 2, { steps: 3 })
  await page.mouse.move(box.x + to[0], box.y + to[1], { steps: 3 })
  await page.mouse.up()
}

test.beforeEach(async ({ page }) => {
  await openPdfInApp(page, await makePdf([{ width: 612, height: 792 }]))
})

for (const tool of ['highlight', 'underline', 'strikeout', 'rectangle', 'ellipse', 'line', 'arrow'] as const) {
  test(`draws a ${tool}`, async ({ page }) => {
    await page.getByTestId(`tool-${tool}`).click()
    await dragOnPage(page, [100, 200], [300, 260])
    await expect(page.getByTestId(`annotation-${tool}`)).toHaveCount(1)
  })
}

test('draws a pen stroke', async ({ page }) => {
  await page.getByTestId('tool-pen').click()
  const box = await overlayBox(page)
  await page.mouse.move(box.x + 100, box.y + 300)
  await page.mouse.down()
  for (const [x, y] of [[130, 320], [160, 300], [190, 330]]) await page.mouse.move(box.x + x, box.y + y, { steps: 4 })
  await page.mouse.up()
  await expect(page.getByTestId('annotation-pen')).toHaveCount(1)
})

test('adds a text box by dragging and typing', async ({ page }) => {
  await page.getByTestId('tool-text').click()
  await dragOnPage(page, [100, 400], [300, 460])
  await page.getByTestId('text-editor').fill('Hello world')
  await page.getByTestId('tool-select').click()
  await expect(page.getByTestId('annotation-text')).toHaveCount(1)
  await expect(page.getByTestId('annotation-text')).toContainText('Hello world')
})

test('discards an empty text box', async ({ page }) => {
  await page.getByTestId('tool-text').click()
  await dragOnPage(page, [100, 400], [300, 460])
  await page.getByTestId('tool-select').click()
  await expect(page.getByTestId('annotation-text')).toHaveCount(0)
})

test('a click without a drag creates no shape', async ({ page }) => {
  await page.getByTestId('tool-rectangle').click()
  const box = await overlayBox(page)
  await page.mouse.click(box.x + 100, box.y + 100)
  await expect(page.getByTestId('annotation-rectangle')).toHaveCount(0)
})
