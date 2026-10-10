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
    return (store?.getState().annotations ?? []) as Array<Record<string, any>>
  })
}

export async function downloadAnnotated(page: Page): Promise<Uint8Array> {
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('download-button').click()])
  return new Uint8Array(await readFile((await download.path())!))
}
