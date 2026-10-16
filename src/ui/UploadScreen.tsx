import { useState } from 'react'
import { extractOwnAnnotations } from '../export/import-own'
import { openPdf, PdfLoadError } from '../render/pdf-document'
import type { OpenFile } from './open-file'
import { Toolbar } from './Toolbar'

const noop = () => {}

/**
 * The landing screen: the editor's own chrome (top bar, tool rail, side panel) with every control
 * switched off, and the welcome text and file picker sitting where the page will appear.
 */
export function UploadScreen({ onOpen }: { onOpen: (f: OpenFile) => void }) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)

  async function handleFile(file: File) {
    setError(null)
    setBusy(true)
    try {
      const { bytes, annotations } = await extractOwnAnnotations(new Uint8Array(await file.arrayBuffer()))
      const doc = await openPdf(bytes)
      onOpen({ id: crypto.randomUUID(), name: file.name, bytes, annotations, doc })
    } catch (e) {
      setError(e instanceof PdfLoadError ? e.message : 'Could not open this file.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="editor"
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        const f = e.dataTransfer.files[0]
        if (f) void handleFile(f)
      }}
    >
      <header className="topbar">
        <span className="filename muted">No file open</span>
        <span className="spacer" />
        <div className="zoom">
          <button className="button" disabled aria-label="Zoom out">−</button>
          <span>100%</span>
          <button className="button" disabled aria-label="Zoom in">+</button>
          <button className="button" disabled>Fit width</button>
        </div>
        <button className="button primary" disabled>Download PDF</button>
      </header>
      <div className="workspace">
        <Toolbar tool={null} onTool={noop} canUndo={false} canRedo={false} onUndo={noop} onRedo={noop} disabled />
        <main className="pages landing">
          <section className={dragging ? 'landing-page dragging' : 'landing-page'}>
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
          </section>
        </main>
        <aside className="panel hint">Open a PDF to start annotating.</aside>
      </div>
    </div>
  )
}
