import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { PROTECTED_MESSAGE } from '../protected-message'
import { normalizeRotation, type PageGeometry } from '../coords/page-space'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export type LoadErrorKind = 'password' | 'protected' | 'invalid' | 'unknown'

export class PdfLoadError extends Error {
  constructor(readonly kind: LoadErrorKind, message: string) {
    super(message)
  }
}

export function toLoadError(e: unknown): PdfLoadError {
  const name = e instanceof Error ? e.name : ''
  if (name === 'PasswordException') {
    return new PdfLoadError('password', "This PDF is password-protected, which isn't supported yet.")
  }
  if (name === 'InvalidPDFException' || name === 'FormatError' || name === 'MissingPDFException') {
    return new PdfLoadError('invalid', "This file isn't a valid PDF.")
  }
  return new PdfLoadError('unknown', 'Could not open this file.')
}

/**
 * pdf.js opens PDFs that have an owner password but an empty user password, yet pdf-lib cannot
 * write them, so the user would annotate and then never be able to download. Reject them up front.
 */
export async function assertNotProtected(doc: { getPermissions(): Promise<unknown> }): Promise<void> {
  if ((await doc.getPermissions()) !== null) throw new PdfLoadError('protected', PROTECTED_MESSAGE)
}

/** Browsers silently blank canvases past a size limit (iOS Safari is ~16.7M pixels). */
export const MAX_CANVAS_PIXELS = 16_777_216

/**
 * The scale to rasterize at: `scale * dpr`, capped so the backing store stays within
 * MAX_CANVAS_PIXELS. Since the cap only ever lowers the product, the dpr factor shrinks first
 * and `scale` itself only when even dpr 1 would be too big. `pageWidth`/`pageHeight` are the
 * page's size at scale 1.
 */
export function effectiveRenderScale(pageWidth: number, pageHeight: number, scale: number, dpr: number): number {
  const wanted = (Number.isFinite(scale) && scale > 0 ? scale : 1) * (Number.isFinite(dpr) && dpr > 0 ? dpr : 1)
  const area = pageWidth * pageHeight
  if (!(Number.isFinite(area) && area > 0)) return wanted
  // Shave a hair so flooring the dimensions can never land above the cap.
  const cap = Math.sqrt(MAX_CANVAS_PIXELS / area) * 0.9999
  return Math.min(wanted, cap)
}

export interface PdfPageHandle {
  index: number
  geometry: PageGeometry
  render(canvas: HTMLCanvasElement, scale: number): { promise: Promise<void>; cancel(): void }
}

export interface PdfDocumentHandle {
  pageCount: number
  pages: PdfPageHandle[]
  destroy(): void
}

/**
 * pdf.js loads its decoders (CCITT/JBIG2/JPX wasm), CMaps, standard fonts and ICC profiles by URL.
 * They are copied into public/pdfjs/ at build time (scripts/copy-pdfjs-assets.mjs) and served
 * same-origin: the PDF and the app must never reach a third-party host.
 */
export function pdfjsAssetOptions(base: string = import.meta.env.BASE_URL) {
  const root = `${base.endsWith('/') ? base : `${base}/`}pdfjs/`
  return {
    wasmUrl: `${root}wasm/`,
    cMapUrl: `${root}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${root}standard_fonts/`,
    iccUrl: `${root}iccs/`,
  }
}

export async function openPdf(bytes: Uint8Array): Promise<PdfDocumentHandle> {
  // pdf.js transfers the buffer to its worker, so hand it a copy.
  // pdfjs-dist v6 has no PDFDocumentProxy.destroy(); the loading task owns teardown.
  const task = pdfjs.getDocument({ data: bytes.slice(), ...pdfjsAssetOptions() })
  let doc: pdfjs.PDFDocumentProxy
  try {
    doc = await task.promise
  } catch (e) {
    void task.destroy()
    throw toLoadError(e)
  }
  try {
    await assertNotProtected(doc)
  } catch (e) {
    void task.destroy()
    throw e
  }
  const pages: PdfPageHandle[] = []
  for (let i = 0; i < doc.numPages; i++) {
    const page = await doc.getPage(i + 1)
    const [x0, y0, x1, y1] = page.view
    pages.push({
      index: i,
      geometry: { view: [x0, y0, x1, y1], rotate: normalizeRotation(page.rotate) },
      render(canvas, scale) {
        const dpr = window.devicePixelRatio || 1
        const base = page.getViewport({ scale: 1 })
        const viewport = page.getViewport({ scale: effectiveRenderScale(base.width, base.height, scale, dpr) })
        canvas.width = Math.floor(viewport.width)
        canvas.height = Math.floor(viewport.height)
        // CSS size always follows the requested scale, even if the backing store was capped.
        canvas.style.width = `${base.width * scale}px`
        canvas.style.height = `${base.height * scale}px`
        const task = page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport })
        return {
          promise: task.promise.catch((e: unknown) => {
            if (e instanceof Error && e.name === 'RenderingCancelledException') return
            throw e
          }),
          cancel: () => task.cancel(),
        }
      },
    })
  }
  return { pageCount: doc.numPages, pages, destroy: () => void task.destroy() }
}
