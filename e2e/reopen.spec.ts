import { expect, test } from '@playwright/test'
import { makePdf } from '../tests/helpers/makePdf'
import { downloadAnnotated, dragOnPage, openPdfInApp, pixelAt, storedAnnotations } from './helpers'

for (const rotate of [0, 90] as const) {
  test(`annotations from a download are editable again on a page rotated ${rotate}`, async ({ page }) => {
    await openPdfInApp(page, await makePdf([{ width: 612, height: 792, rotate }]))
    await page.getByTestId('tool-rectangle').click()
    await page.getByTestId('fill-swatch-1e88e5').click()
    await dragOnPage(page, [60, 200], [260, 260])
    await page.getByTestId('tool-ellipse').click()
    await dragOnPage(page, [60, 400], [260, 460])
    const first = await downloadAnnotated(page)

    const again = await page.context().newPage()
    await openPdfInApp(again, first, 'annotated.pdf')
    await expect(again.getByTestId('annotation-rectangle')).toHaveCount(1)
    await expect(again.getByTestId('annotation-ellipse')).toHaveCount(1)
    expect(await storedAnnotations(again)).toHaveLength(2)

    // opening is not an unsaved change: undo has nothing to undo
    await expect(again.getByTestId('undo-button')).toBeDisabled()

    // select, recolour the fill, move it
    await again.getByTestId('annotation-rectangle').click({ position: { x: 100, y: 30 } })
    await again.getByTestId('fill-swatch-43a047').click()
    await dragOnPage(again, [150, 230], [150, 330])

    const second = await downloadAnnotated(again)
    const check = await page.context().newPage()
    await openPdfInApp(check, second, 'annotated2.pdf')
    await expect(check.getByTestId('annotation-rectangle')).toHaveCount(1)
    await expect(check.getByTestId('annotation-ellipse')).toHaveCount(1)
    expect((await storedAnnotations(check)).filter((a) => a.type === 'rectangle')).toHaveLength(1)
    const [rect] = (await storedAnnotations(check)).filter((a) => a.type === 'rectangle')
    expect(rect.fill.g).toBeGreaterThan(rect.fill.b) // the green chosen after reopening, not the original blue
    const before = (await storedAnnotations(again)).find((a) => a.type === 'rectangle')!
    expect(rect.rect).toEqual(before.rect) // the move survived the second download
    // the page canvas no longer paints the lifted annotations
    expect((await pixelAt(check, 0, 160, 230)).slice(0, 3)).toEqual([255, 255, 255])
  })
}
