import { expect, test, type Page } from '@playwright/test'
import { rectToViewport } from '../src/coords/page-space'
import { makePdf } from '../tests/helpers/makePdf'
import { dragOnPage, openPdfInApp, overlayBox, storedAnnotations } from './helpers'

const rectangle = (page: Page) => page.getByTestId('annotation-rectangle')

test.beforeEach(async ({ page }) => {
  await openPdfInApp(page, await makePdf([{ width: 612, height: 792 }]))
})

test('Escape mid-draw discards the draft', async ({ page }) => {
  await page.getByTestId('tool-rectangle').click()
  const box = await overlayBox(page)
  await page.mouse.move(box.x + 100, box.y + 200)
  await page.mouse.down()
  await page.mouse.move(box.x + 200, box.y + 250, { steps: 3 })
  await expect(page.getByTestId('draft-rectangle')).toHaveCount(1)
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('draft-rectangle')).toHaveCount(0)
  // cancelling the gesture is not the same as leaving the tool
  await expect(page.getByTestId('tool-rectangle')).toHaveAttribute('aria-pressed', 'true')
  await page.mouse.move(box.x + 300, box.y + 300, { steps: 3 })
  await page.mouse.up()
  await expect(rectangle(page)).toHaveCount(0)
  expect(await storedAnnotations(page)).toHaveLength(0)
})

test('the draft preview does not count as an annotation', async ({ page }) => {
  await page.getByTestId('tool-rectangle').click()
  const box = await overlayBox(page)
  await page.mouse.move(box.x + 100, box.y + 200)
  await page.mouse.down()
  await page.mouse.move(box.x + 200, box.y + 250, { steps: 3 })
  await expect(page.getByTestId('draft-rectangle')).toHaveCount(1)
  await expect(rectangle(page)).toHaveCount(0)
  await page.mouse.up()
  await expect(page.getByTestId('draft-rectangle')).toHaveCount(0)
  await expect(rectangle(page)).toHaveCount(1)
})

test('Escape mid-move puts the annotation back and adds no undo step', async ({ page }) => {
  await page.getByTestId('tool-rectangle').click()
  await dragOnPage(page, [100, 200], [300, 260])
  await page.getByTestId('tool-select').click()
  const before = (await rectangle(page).boundingBox())!
  const box = await overlayBox(page)
  await page.mouse.move(box.x + 200, box.y + 230)
  await page.mouse.down()
  await page.mouse.move(box.x + 260, box.y + 290, { steps: 4 })
  expect((await rectangle(page).boundingBox())!.x).toBeCloseTo(before.x + 60, 0)
  await page.keyboard.press('Escape')
  await page.mouse.move(box.x + 300, box.y + 330, { steps: 3 })
  await page.mouse.up()
  const after = (await rectangle(page).boundingBox())!
  expect(after.x).toBeCloseTo(before.x, 0)
  expect(after.y).toBeCloseTo(before.y, 0)
  // only the creation is undoable
  await page.getByTestId('undo-button').click()
  await expect(page.getByTestId('undo-button')).toBeDisabled()
  await expect(rectangle(page)).toHaveCount(0)
})

test('a pointermove with no button held cannot extend a stale draft', async ({ page }) => {
  await page.getByTestId('tool-rectangle').click()
  const box = await overlayBox(page)
  await page.mouse.move(box.x + 100, box.y + 200)
  await page.mouse.down()
  await page.mouse.move(box.x + 150, box.y + 230, { steps: 3 })
  // a move that claims no button is down (e.g. the release happened outside the window)
  await page.getByTestId('page-overlay-0').dispatchEvent('pointermove', {
    pointerId: 1, pointerType: 'mouse', isPrimary: true, buttons: 0, bubbles: true,
    clientX: box.x + 400, clientY: box.y + 400,
  })
  await expect(page.getByTestId('draft-rectangle')).toHaveCount(0)
  await page.mouse.up()
  await expect(rectangle(page)).toHaveCount(0)
})

test('non-primary pointers are ignored mid-draw', async ({ page }) => {
  await page.getByTestId('tool-rectangle').click()
  const box = await overlayBox(page)
  await page.mouse.move(box.x + 100, box.y + 200)
  await page.mouse.down()
  await page.mouse.move(box.x + 150, box.y + 230, { steps: 3 })
  const draft = page.getByTestId('draft-rectangle').locator('rect').first()
  const widthBefore = Number(await draft.getAttribute('width'))
  await page.getByTestId('page-overlay-0').dispatchEvent('pointermove', {
    pointerId: 7, pointerType: 'touch', isPrimary: false, buttons: 1, bubbles: true,
    clientX: box.x + 400, clientY: box.y + 400,
  })
  await expect.poll(async () => Number(await draft.getAttribute('width'))).toBe(widthBefore)
  await page.mouse.up()
})

test('switching tool mid-draw drops the draft', async ({ page }) => {
  await page.getByTestId('tool-rectangle').click()
  const box = await overlayBox(page)
  await page.mouse.move(box.x + 100, box.y + 200)
  await page.mouse.down()
  await page.mouse.move(box.x + 200, box.y + 250, { steps: 3 })
  await expect(page.getByTestId('draft-rectangle')).toHaveCount(1)
  // switch with the keyboard-free route: dispatch a click on the toolbar button without releasing the mouse
  await page.getByTestId('tool-select').dispatchEvent('click')
  await expect(page.getByTestId('draft-rectangle')).toHaveCount(0)
  await page.mouse.up()
  await expect(rectangle(page)).toHaveCount(0)
})

test('a very long pen stroke is committed as a bounded point list', async ({ page }) => {
  await page.getByTestId('tool-pen').click()
  const box = await overlayBox(page)
  await page.mouse.move(box.x + 50, box.y + 300)
  await page.mouse.down()
  // 400 moves, each one is a real pointer event; stays well inside the page
  for (let i = 1; i <= 400; i++) {
    await page.mouse.move(box.x + 50 + i * 1.2, box.y + 300 + 80 * Math.sin(i / 20))
  }
  await page.mouse.up()
  const [a] = await storedAnnotations(page)
  expect(a.type).toBe('pen')
  expect(a.points.length).toBeGreaterThan(10)
  expect(a.points.length).toBeLessThanOrEqual(1000)
})

test('drawing on a rotated page stores the rotation and a rect that maps back to the dragged one', async ({ page }) => {
  await openPdfInApp(page, await makePdf([{ width: 612, height: 792, rotate: 90 }]))
  await page.getByTestId('tool-rectangle').click()
  await dragOnPage(page, [100, 200], [300, 260])
  const [a] = await storedAnnotations(page)
  expect(a.type).toBe('rectangle')
  expect(a.pageRotation).toBe(90)
  const back = rectToViewport({ view: [0, 0, 612, 792], rotate: 90 }, 1, a.rect)
  expect(Math.abs(back.x - 100)).toBeLessThanOrEqual(1)
  expect(Math.abs(back.y - 200)).toBeLessThanOrEqual(1)
  expect(Math.abs(back.width - 200)).toBeLessThanOrEqual(1)
  expect(Math.abs(back.height - 60)).toBeLessThanOrEqual(1)
})
