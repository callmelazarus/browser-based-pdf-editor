import { readFile } from 'node:fs/promises'
import { expect, type Page } from '@playwright/test'

export async function uploadFile(page: Page, name: string, bytes: Uint8Array | Buffer) {
  await page.goto('/')
  await page.getByTestId('upload-input').setInputFiles({ name, mimeType: 'application/pdf', buffer: Buffer.from(bytes) })
}

export async function openPdfInApp(page: Page, bytes: Uint8Array, name = 'sample.pdf') {
  await uploadFile(page, name, bytes)
  await expect(page.getByTestId('page-canvas-0')).toBeVisible()
  await expect.poll(() => canvasWidth(page, 0)).toBeGreaterThan(0)
}

export function canvasWidth(page: Page, index: number) {
  return page.evaluate(
    (i) => document.querySelector<HTMLCanvasElement>(`[data-testid="page-canvas-${i}"]`)?.width ?? 0,
    index,
  )
}

export function renderedCanvasCount(page: Page) {
  return page.evaluate(() => [...document.querySelectorAll('canvas')].filter((c) => c.width > 0).length)
}

export async function overlayBox(page: Page, index = 0) {
  return (await page.getByTestId(`page-overlay-${index}`).boundingBox())!
}

/** Coordinates are CSS pixels relative to the page's top-left at 100% zoom. */
export async function dragOnPage(page: Page, from: [number, number], to: [number, number], index = 0) {
  const box = await overlayBox(page, index)
  await page.mouse.move(box.x + from[0], box.y + from[1])
  await page.mouse.down()
  await page.mouse.move(box.x + (from[0] + to[0]) / 2, box.y + (from[1] + to[1]) / 2, { steps: 3 })
  await page.mouse.move(box.x + to[0], box.y + to[1], { steps: 3 })
  await page.mouse.up()
}

/** The annotations in the editor's store (exposed on window in dev builds only). */
export function storedAnnotations(page: Page) {
  return page.evaluate(() => {
    const store = (window as unknown as { __annotationStore?: { getState(): { annotations: unknown[] } } }).__annotationStore
    if (!store) throw new Error('window.__annotationStore is missing (dev build only); refusing to return [] vacuously')
    return store.getState().annotations as Array<Record<string, any>>
  })
}

export async function downloadAnnotated(page: Page): Promise<Uint8Array> {
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('download-button').click()])
  return new Uint8Array(await readFile((await download.path())!))
}

export type Pixel = [number, number, number, number]

/** Reads one pixel of a page canvas. x and y are CSS pixels from the page's top-left. */
export function pixelAt(page: Page, index: number, x: number, y: number): Promise<Pixel> {
  return page.evaluate(
    ({ index, x, y }) => {
      const canvas = document.querySelector<HTMLCanvasElement>(`[data-testid="page-canvas-${index}"]`)!
      const dpr = window.devicePixelRatio || 1
      const d = canvas.getContext('2d')!.getImageData(Math.round(x * dpr), Math.round(y * dpr), 1, 1).data
      return [d[0], d[1], d[2], d[3]] as Pixel
    },
    { index, x, y },
  )
}

/** Bounding box (CSS px) of dark pixels inside a region of a page canvas, with x/y relative to the region's top-left, or null if there are none. */
export function darkBounds(
  page: Page, index: number, region: { x: number; y: number; width: number; height: number },
): Promise<{ x: number; y: number; width: number; height: number } | null> {
  return page.evaluate(
    ({ index, region }) => {
      const canvas = document.querySelector<HTMLCanvasElement>(`[data-testid="page-canvas-${index}"]`)!
      const dpr = window.devicePixelRatio || 1
      const { x, y, width, height } = region
      const img = canvas.getContext('2d')!.getImageData(Math.round(x * dpr), Math.round(y * dpr), Math.round(width * dpr), Math.round(height * dpr))
      let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1
      for (let py = 0; py < img.height; py++) {
        for (let px = 0; px < img.width; px++) {
          const i = (py * img.width + px) * 4
          if (img.data[i + 3] > 0 && img.data[i] + img.data[i + 1] + img.data[i + 2] < 300) {
            x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py)
          }
        }
      }
      return x1 < 0 ? null : { x: x0 / dpr, y: y0 / dpr, width: (x1 - x0 + 1) / dpr, height: (y1 - y0 + 1) / dpr }
    },
    { index, region },
  )
}

/** Rows (CSS px, whole numbers) within [y0, y1] at column x whose pixel satisfies `test`. Runs in the page, so `test` is given as a source string. */
export function rowsMatching(page: Page, index: number, x: number, y0: number, y1: number, testSrc: string): Promise<number[]> {
  return page.evaluate(
    ({ index, x, y0, y1, testSrc }) => {
      const canvas = document.querySelector<HTMLCanvasElement>(`[data-testid="page-canvas-${index}"]`)!
      const dpr = window.devicePixelRatio || 1
      const fn = new Function('r', 'g', 'b', `return (${testSrc})`) as (r: number, g: number, b: number) => boolean
      const rows: number[] = []
      for (let y = y0; y <= y1; y++) {
        const d = canvas.getContext('2d')!.getImageData(Math.round(x * dpr), Math.round(y * dpr), 1, 1).data
        if (fn(d[0], d[1], d[2])) rows.push(y)
      }
      return rows
    },
    { index, x, y0, y1, testSrc },
  )
}

/** Waits until a page canvas has painted something and has stopped changing (pdf.js draws asynchronously after sizing the canvas). */
export async function waitForPaint(page: Page, index = 0) {
  const checksum = () =>
    page.evaluate((i) => {
      const c = document.querySelector<HTMLCanvasElement>(`[data-testid="page-canvas-${i}"]`)!
      if (!c.width) return ''
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data
      let sum = 0, ink = 0
      for (let k = 0; k < d.length; k += 4) {
        const v = d[k] + d[k + 1] + d[k + 2]
        sum = (sum * 31 + v + k) | 0
        if (v < 750) ink++
      }
      return ink ? `${sum}:${ink}` : ''
    }, index)
  let last = ''
  await expect
    .poll(async () => {
      const now = await checksum()
      const stable = now !== '' && now === last
      last = now
      return stable
    }, { intervals: [150], timeout: 15_000 })
    .toBe(true)
}
