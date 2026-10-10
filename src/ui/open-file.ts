import type { PdfDocumentHandle } from '../render/pdf-document'

export interface OpenFile {
  id: string
  name: string
  /** The untouched uploaded bytes; export always starts from these. */
  bytes: Uint8Array
  doc: PdfDocumentHandle
}
