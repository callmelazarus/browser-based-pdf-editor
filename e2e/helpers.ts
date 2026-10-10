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
