import { useState } from 'react'
import { openPdf, PdfLoadError } from '../render/pdf-document'
import type { OpenFile } from './open-file'

export function UploadScreen({ onOpen }: { onOpen: (f: OpenFile) => void }) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleFile(file: File) {
    setError(null)
    setBusy(true)
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const doc = await openPdf(bytes)
      onOpen({ id: crypto.randomUUID(), name: file.name, bytes, doc })
    } catch (e) {
      setError(e instanceof PdfLoadError ? e.message : 'Could not open this file.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main
      className="upload"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        const f = e.dataTransfer.files[0]
        if (f) void handleFile(f)
      }}
    >
      <h1>PDF Annotator</h1>
      <p>Open a PDF to highlight, draw and add text. Your file never leaves this browser.</p>
      <label className="button primary">
        {busy ? 'Opening…' : 'Choose a PDF'}
        <input
          data-testid="upload-input"
          type="file"
          accept="application/pdf,.pdf"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void handleFile(f)
            e.target.value = ''
          }}
        />
      </label>
      <p className="hint">or drop a file anywhere on this page</p>
      {error && <p role="alert" className="error">{error}</p>}
    </main>
  )
}
