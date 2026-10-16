import type { Annotation } from '../model/types'
import type { PdfDocumentHandle } from '../render/pdf-document'

export interface OpenFile {
  id: string
  name: string
  /** The untouched uploaded bytes; export always starts from these. */
  bytes: Uint8Array
  /** Annotations from an earlier download of this app, loaded for editing. */
  annotations: Annotation[]
  doc: PdfDocumentHandle
}
