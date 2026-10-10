import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { normalizeRotation, type PageGeometry } from '../coords/page-space'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export type LoadErrorKind = 'password' | 'invalid' | 'unknown'

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

export async function openPdf(bytes: Uint8Array): Promise<PdfDocumentHandle> {
  // pdf.js transfers the buffer to its worker, so hand it a copy.
  // pdfjs-dist v6 has no PDFDocumentProxy.destroy(); the loading task owns teardown.
  const task = pdfjs.getDocument({ data: bytes.slice() })
  let doc: pdfjs.PDFDocumentProxy
  try {
    doc = await task.promise
  } catch (e) {
    void task.destroy()
    throw toLoadError(e)
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
        const viewport = page.getViewport({ scale: scale * dpr })
        canvas.width = Math.floor(viewport.width)
        canvas.height = Math.floor(viewport.height)
        canvas.style.width = `${viewport.width / dpr}px`
        canvas.style.height = `${viewport.height / dpr}px`
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
