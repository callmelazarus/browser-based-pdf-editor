import { expect, test } from '@playwright/test'
import { makeCcittPdf } from '../tests/helpers/makeCcittPdf'
import { openPdfInApp, pixelAt, waitForPaint } from './helpers'

test('renders a CCITT-compressed (scanned) image using same-origin decoder assets', async ({ page }) => {
  const foreign: string[] = []
  page.on('request', (r) => {
    const { protocol, hostname } = new URL(r.url())
    if (/^https?:$/.test(protocol) && hostname !== 'localhost' && hostname !== '127.0.0.1') foreign.push(r.url())
  })
  await openPdfInApp(page, await makeCcittPdf())
  // The image fills x 10-60, y 40-90 in screen pixels (page is 100pt tall at 100% zoom).
  await expect
    .poll(async () => {
      const [r, g, b] = await pixelAt(page, 0, 35, 65)
      return r + g + b
    }, { timeout: 15_000 })
    .toBeLessThan(60)
  await waitForPaint(page)
  const [r, g, b, a] = await pixelAt(page, 0, 35, 65)
  expect([r, g, b, a]).toEqual([0, 0, 0, 255])
  // Outside the image the page stays white.
  expect((await pixelAt(page, 0, 80, 20)).slice(0, 3)).toEqual([255, 255, 255])
  expect(foreign).toEqual([])
})
