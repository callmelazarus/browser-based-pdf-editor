import { expect, test, type Page } from '@playwright/test'
import { TEXT_PADDING } from '../src/text/layout'
import { makePdf, type PageSpec } from '../tests/helpers/makePdf'
import { darkBounds, downloadAnnotated, dragOnPage, openPdfInApp, pixelAt, rowsMatching, waitForPaint } from './helpers'

/** Annotate in the app, download, then open the downloaded file in a fresh tab so pdf.js renders the real annotations. */
async function annotateAndReopen(page: Page, spec: PageSpec, draw: (p: Page) => Promise<void>): Promise<Page> {
  await openPdfInApp(page, await makePdf([spec]))
  await draw(page)
  const exported = await downloadAnnotated(page)
  const reopened = await page.context().newPage()
  await openPdfInApp(reopened, exported, 'annotated.pdf')
  await waitForPaint(reopened)
  return reopened
}

const isYellowish = ([r, g, b]: number[]) => r > 230 && g > 200 && b < 200
const isRed = ([r, g, b]: number[]) => r > 150 && g < 100 && b < 100

async function drawHighlightAndRectangle(page: Page) {
  await page.getByTestId('tool-highlight').click()
  await dragOnPage(page, [60, 100], [260, 160])
  await page.getByTestId('tool-rectangle').click()
  await dragOnPage(page, [60, 200], [260, 260])
}

const cases: { name: string; spec: PageSpec }[] = [
  { name: 'an unrotated page', spec: { width: 612, height: 792 } },
  { name: 'a page rotated 90', spec: { width: 612, height: 792, rotate: 90 } },
  { name: 'a page rotated 180', spec: { width: 612, height: 792, rotate: 180 } },
  { name: 'a page rotated 270', spec: { width: 612, height: 792, rotate: 270 } },
  { name: 'a page with an offset crop box', spec: { width: 612, height: 792, cropBox: [50, 50, 400, 500] } },
  { name: 'a rotated page with an offset crop box', spec: { width: 612, height: 792, rotate: 90, cropBox: [50, 50, 400, 500] } },
]

for (const { name, spec } of cases) {
  test(`annotations land where they were drawn on ${name}`, async ({ page }) => {
    const reopened = await annotateAndReopen(page, spec, drawHighlightAndRectangle)
    expect(isYellowish(await pixelAt(reopened, 0, 160, 130))).toBe(true)
    expect(isRed(await pixelAt(reopened, 0, 61, 230))).toBe(true)
    expect(isRed(await pixelAt(reopened, 0, 160, 201))).toBe(true)
    // nothing drawn here
    const blank = await pixelAt(reopened, 0, 160, 330)
    expect(blank.slice(0, 3)).toEqual([255, 255, 255])
  })
}

test('underline and strikethrough lie along the dragged rectangle on a page rotated 90', async ({ page }) => {
  const reopened = await annotateAndReopen(page, { width: 612, height: 792, rotate: 90 }, async (p) => {
    await p.getByTestId('tool-underline').click()
    await dragOnPage(p, [60, 100], [260, 160])
    await p.getByTestId('tool-strikeout').click()
    await dragOnPage(p, [60, 300], [260, 360])
  })
  const red = 'r > 150 && g < 100 && b < 100'
  // underline: along the bottom edge (y = 160) of the dragged rectangle, nothing through its middle or top
  const under = await rowsMatching(reopened, 0, 160, 95, 165, red)
  expect(under.length).toBeGreaterThan(0)
  for (const y of under) expect(y).toBeGreaterThanOrEqual(155)
  // strikethrough: through the middle (y = 330), not along either edge
  const strike = await rowsMatching(reopened, 0, 160, 295, 365, red)
  expect(strike.length).toBeGreaterThan(0)
  for (const y of strike) {
    expect(y).toBeGreaterThanOrEqual(325)
    expect(y).toBeLessThanOrEqual(335)
  }
  // the lines span the dragged width and stop at its ends
  expect(isRed(await pixelAt(reopened, 0, 70, under[0]))).toBe(true)
  expect(isRed(await pixelAt(reopened, 0, 250, under[0]))).toBe(true)
  expect(isRed(await pixelAt(reopened, 0, 30, under[0]))).toBe(false)
  expect(isRed(await pixelAt(reopened, 0, 290, under[0]))).toBe(false)
})

for (const rotate of [90, 180, 270] as const) {
  test(`text starts at the top-left of its box and reads upright on a page rotated ${rotate}`, async ({ page }) => {
    const box = { x: 100, y: 400, width: 300, height: 60 }
    const fontSize = 14 // the default text size
    const reopened = await annotateAndReopen(page, { width: 612, height: 792, rotate }, async (p) => {
      await p.getByTestId('tool-text').click()
      await dragOnPage(p, [box.x, box.y], [box.x + box.width, box.y + box.height])
      await p.getByTestId('text-editor').fill('HELLO')
      await p.getByTestId('tool-select').click()
    })
    const ink = await darkBounds(reopened, 0, box)
    expect(ink).not.toBeNull()
    expect(ink!.width).toBeGreaterThan(ink!.height)
    // Upright, unmirrored text on one line starts in the top-left corner of the box: the first
    // glyph is at the left padding and the ink sits in the top half. Upside-down text would put
    // it at the bottom-right, mirrored text at the right edge.
    expect(ink!.x).toBeLessThanOrEqual(TEXT_PADDING + 4)
    expect(ink!.y).toBeLessThanOrEqual(TEXT_PADDING + fontSize)
    expect(ink!.y + ink!.height).toBeLessThanOrEqual(box.height / 2)
    expect(ink!.x + ink!.width).toBeLessThan(box.width / 2)
  })
}

test('annotating an already annotated PDF keeps the earlier annotations', async ({ page }) => {
  // `first` is the app showing the first export; annotate it again and export a second generation.
  const first = await annotateAndReopen(page, { width: 612, height: 792 }, drawHighlightAndRectangle)
  await first.getByTestId('tool-ellipse').click()
  await dragOnPage(first, [60, 400], [260, 460])
  const second = await first.context().newPage()
  await openPdfInApp(second, await downloadAnnotated(first), 'twice.pdf')
  await waitForPaint(second)
  expect(isYellowish(await pixelAt(second, 0, 160, 130))).toBe(true)
  expect(isRed(await pixelAt(second, 0, 61, 230))).toBe(true)
  expect(isRed(await pixelAt(second, 0, 61, 430))).toBe(true)
})
