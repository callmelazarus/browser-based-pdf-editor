import { PDFDict, PDFDocument, PDFHexString, PDFName, PDFString } from 'pdf-lib'
import type { Annotation } from '../model/types'
import { ANNOT_KEY, decodeAnnotation } from './annot-data'

export interface ExtractResult {
  /** The file without this app's annotations; the original bytes, untouched, when there were none. */
  bytes: Uint8Array
  annotations: Annotation[]
}

/**
 * Lifts the annotations this app wrote on an earlier download out of the file so they can be edited
 * again. Annotations from other apps, and entries that fail validation, stay in the page.
 * Never throws: a file pdf-lib cannot read is returned as is, and opening it reports the problem.
 */
export async function extractOwnAnnotations(original: Uint8Array): Promise<ExtractResult> {
  const untouched = { bytes: original, annotations: [] }
  try {
    const doc = await PDFDocument.load(original)
    const found: Annotation[] = []
    const key = PDFName.of(ANNOT_KEY)
    doc.getPages().forEach((page, index) => {
      const arr = page.node.Annots()
      if (!arr) return
      const keep = arr.asArray().filter((entry) => {
        const dict = doc.context.lookup(entry)
        if (!(dict instanceof PDFDict)) return true
        const data = dict.lookup(key)
        if (!(data instanceof PDFHexString || data instanceof PDFString)) return true
        const ann = decodeAnnotation(data.decodeText(), crypto.randomUUID(), index)
        if (!ann) return true
        found.push(ann)
        return false
      })
      if (keep.length !== arr.size()) page.node.set(PDFName.of('Annots'), doc.context.obj(keep))
    })
    if (found.length === 0) return untouched
    return { bytes: await doc.save(), annotations: found }
  } catch {
    return untouched
  }
}
