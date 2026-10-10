import { expect, test, type Page } from '@playwright/test'
import { makePdf } from '../tests/helpers/makePdf'
import { dragOnPage, openPdfInApp, storedAnnotations } from './helpers'

const rectangle = (page: Page) => page.getByTestId('annotation-rectangle')

async function drawRectangle(page: Page) {
  await page.getByTestId('tool-rectangle').click()
  await dragOnPage(page, [100, 200], [300, 260])
  await page.getByTestId('tool-select').click()
}

test.beforeEach(async ({ page }) => {
  await openPdfInApp(page, await makePdf([{ width: 612, height: 792 }]))
})

test('moves a selected annotation by dragging', async ({ page }) => {
  await drawRectangle(page)
  const before = (await rectangle(page).boundingBox())!
  await dragOnPage(page, [200, 230], [250, 280])
  const after = (await rectangle(page).boundingBox())!
  expect(after.x - before.x).toBeCloseTo(50, 0)
  expect(after.y - before.y).toBeCloseTo(50, 0)
})

test('resizes with a corner handle', async ({ page }) => {
  await drawRectangle(page)
  await rectangle(page).click({ position: { x: 100, y: 30 } })
  const before = (await rectangle(page).boundingBox())!
  const handle = (await page.getByTestId('handle-se').boundingBox())!
  await page.mouse.move(handle.x + 4, handle.y + 4)
  await page.mouse.down()
  await page.mouse.move(handle.x + 44, handle.y + 24, { steps: 4 })
  await page.mouse.up()
  const after = (await rectangle(page).boundingBox())!
  expect(after.width - before.width).toBeCloseTo(40, 0)
  expect(after.height - before.height).toBeCloseTo(20, 0)
})

test('deletes with the Delete key and restores with undo', async ({ page }) => {
  await drawRectangle(page)
  await rectangle(page).click({ position: { x: 100, y: 30 } })
  await page.keyboard.press('Delete')
  await expect(rectangle(page)).toHaveCount(0)
  await page.keyboard.press('ControlOrMeta+z')
  await expect(rectangle(page)).toHaveCount(1)
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect(rectangle(page)).toHaveCount(0)
})

test('clicking empty space deselects', async ({ page }) => {
  await drawRectangle(page)
  await rectangle(page).click({ position: { x: 100, y: 30 } })
  await expect(page.getByTestId('handle-se')).toBeVisible()
  const box = (await page.getByTestId('page-overlay-0').boundingBox())!
  await page.mouse.click(box.x + 500, box.y + 600)
  await expect(page.getByTestId('handle-se')).toHaveCount(0)
})

test('changes the colour of the selected annotation', async ({ page }) => {
  await drawRectangle(page)
  await rectangle(page).click({ position: { x: 100, y: 30 } })
  await page.getByTestId('swatch-1e88e5').click()
  await expect(rectangle(page).locator('rect').first()).toHaveAttribute('stroke', 'rgb(30, 136, 229)')
})

test('consecutive property edits of one kind undo as a single step', async ({ page }) => {
  await drawRectangle(page)
  await rectangle(page).click({ position: { x: 100, y: 30 } })
  const body = rectangle(page).locator('rect').first()
  await page.getByTestId('swatch-1e88e5').click()
  await page.getByTestId('swatch-43a047').click()
  await expect(body).toHaveAttribute('stroke', 'rgb(67, 160, 71)')
  await page.getByTestId('prop-opacity').fill('40')
  await page.getByTestId('prop-opacity').fill('30')
  await expect(body).toHaveAttribute('stroke-opacity', '0.3')
  await page.getByTestId('undo-button').click()
  await expect(body).toHaveAttribute('stroke-opacity', '1')
  await expect(body).toHaveAttribute('stroke', 'rgb(67, 160, 71)')
  await page.getByTestId('undo-button').click()
  await expect(body).toHaveAttribute('stroke', 'rgb(217, 26, 26)')
  await page.getByTestId('redo-button').click()
  await expect(body).toHaveAttribute('stroke', 'rgb(67, 160, 71)')
})

test('edits an existing text box by double-clicking it', async ({ page }) => {
  await page.getByTestId('tool-text').click()
  await dragOnPage(page, [100, 400], [300, 460])
  await page.getByTestId('text-editor').fill('Hello')
  await page.getByTestId('tool-select').click()
  const box = (await page.getByTestId('page-overlay-0').boundingBox())!
  await page.mouse.dblclick(box.x + 200, box.y + 430)
  await page.getByTestId('text-editor').fill('Changed')
  await page.getByTestId('tool-select').click()
  await expect(page.getByTestId('annotation-text')).toContainText('Changed')
})

test('Escape while editing text cancels without saving the change', async ({ page }) => {
  await page.getByTestId('tool-text').click()
  await dragOnPage(page, [100, 400], [300, 460])
  await page.getByTestId('text-editor').fill('Keep')
  await page.getByTestId('tool-select').click()
  const box = (await page.getByTestId('page-overlay-0').boundingBox())!
  await page.mouse.dblclick(box.x + 200, box.y + 430)
  await page.getByTestId('text-editor').fill('Discarded')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('annotation-text')).toContainText('Keep')
  expect((await storedAnnotations(page))[0].text).toBe('Keep')
})

test('the overlay lets touch gestures through in select mode and captures them for drawing tools', async ({ page }) => {
  const style = () =>
    page.getByTestId('page-overlay-0').evaluate((el) => {
      const cs = getComputedStyle(el)
      return { pointerEvents: cs.pointerEvents, touchAction: cs.touchAction }
    })
  expect(await style()).toEqual({ pointerEvents: 'none', touchAction: 'auto' })
  await page.getByTestId('tool-rectangle').click()
  expect(await style()).toEqual({ pointerEvents: 'auto', touchAction: 'none' })
  await page.getByTestId('tool-select').click()
  expect(await style()).toEqual({ pointerEvents: 'none', touchAction: 'auto' })
})

test('annotation shapes stay interactive while the overlay itself is pass-through', async ({ page }) => {
  await drawRectangle(page)
  const hit = await page.evaluate(() => {
    const svg = document.querySelector('[data-testid="page-overlay-0"]')!.getBoundingClientRect()
    const el = document.elementFromPoint(svg.x + 200, svg.y + 230)
    const empty = document.elementFromPoint(svg.x + 500, svg.y + 600)
    return { onShape: !!el?.closest('[data-annotation-id]'), emptyIsSvg: !!empty?.closest('svg') }
  })
  expect(hit).toEqual({ onShape: true, emptyIsSvg: false })
})
