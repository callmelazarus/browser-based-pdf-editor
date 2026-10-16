import { expect, test } from '@playwright/test'
import { makePdf } from '../tests/helpers/makePdf'
import { downloadAnnotated, dragOnPage, openPdfInApp, pixelAt, storedAnnotations, waitForPaint } from './helpers'


for (const rotate of [0, 90] as const) {
  test(`a rectangle's fill survives download on a page rotated ${rotate}`, async ({ page }) => {
    await openPdfInApp(page, await makePdf([{ width: 612, height: 792, rotate }]))
    await page.getByTestId('tool-rectangle').click()
    await page.getByTestId('fill-swatch-1e88e5').click()
    await page.getByTestId('swatch-e53935').click()
    await dragOnPage(page, [60, 200], [260, 260])
    expect((await storedAnnotations(page))[0].fill).toMatchObject({ b: expect.any(Number) })

    const reopened = await page.context().newPage()
    await openPdfInApp(reopened, await downloadAnnotated(page), 'annotated.pdf')
    await waitForPaint(reopened)
    const [r, g, b] = await pixelAt(reopened, 0, 160, 230)
    expect(r).toBeLessThan(80)
    expect(g).toBeGreaterThan(100)
    expect(b).toBeGreaterThan(180)
    // stroke stays red, and outside stays blank
    const edge = await pixelAt(reopened, 0, 61, 230)
    expect(edge[0]).toBeGreaterThan(150)
    expect(edge[2]).toBeLessThan(100)
    expect((await pixelAt(reopened, 0, 160, 330)).slice(0, 3)).toEqual([255, 255, 255])
  })
}

test('fill can be set, cleared and undone on a selected rectangle, and defaults to none', async ({ page }) => {
  await openPdfInApp(page, await makePdf([{ width: 612, height: 792 }]))
  await page.getByTestId('tool-rectangle').click()
  await dragOnPage(page, [100, 200], [300, 260])
  expect((await storedAnnotations(page))[0].fill ?? null).toBeNull()
  await page.getByTestId('tool-select').click()
  await page.getByTestId('annotation-rectangle').click({ position: { x: 100, y: 30 } })

  await page.getByTestId('fill-swatch-43a047').click()
  expect((await storedAnnotations(page))[0].fill).toMatchObject({ g: expect.any(Number) })
  await page.getByTestId('fill-none').click()
  expect((await storedAnnotations(page))[0].fill).toBeNull()
  await page.keyboard.press('ControlOrMeta+z')
  expect((await storedAnnotations(page))[0].fill).not.toBeNull()
})
