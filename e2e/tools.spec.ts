import { expect, test } from '@playwright/test'
import { makePdf } from '../tests/helpers/makePdf'
import { dragOnPage, openPdfInApp, overlayBox, storedAnnotations } from './helpers'

test.beforeEach(async ({ page }) => {
  await openPdfInApp(page, await makePdf([{ width: 612, height: 792 }]))
})

for (const tool of ['highlight', 'underline', 'strikeout', 'rectangle', 'ellipse', 'line', 'arrow'] as const) {
  test(`draws a ${tool}`, async ({ page }) => {
    await page.getByTestId(`tool-${tool}`).click()
    await dragOnPage(page, [100, 200], [300, 260])
    await expect(page.getByTestId(`annotation-${tool}`)).toHaveCount(1)
    // dragged (100,200)->(300,260) on a 792pt-tall page: user-space y is flipped
    const [a] = await storedAnnotations(page)
    expect(a.type).toBe(tool)
    expect(a.pageRotation).toBe(0)
    if (tool === 'line' || tool === 'arrow') {
      expect(a.from.x).toBeCloseTo(100, 0)
      expect(a.from.y).toBeCloseTo(592, 0)
      expect(a.to.x).toBeCloseTo(300, 0)
      expect(a.to.y).toBeCloseTo(532, 0)
    } else {
      expect(a.rect.x).toBeCloseTo(100, 0)
      expect(a.rect.y).toBeCloseTo(532, 0)
      expect(a.rect.width).toBeCloseTo(200, 0)
      expect(a.rect.height).toBeCloseTo(60, 0)
    }
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
  const [a] = await storedAnnotations(page)
  expect(a.type).toBe('pen')
  const xs = a.points.map((p: { x: number }) => p.x)
  expect(Math.min(...xs)).toBeCloseTo(100, 0)
  expect(Math.max(...xs)).toBeCloseTo(190, 0)
  expect(a.points[0].y).toBeCloseTo(792 - 300, 0)
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
