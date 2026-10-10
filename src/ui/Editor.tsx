import { useCallback, useEffect, useRef, useState } from 'react'
import { viewportSize } from '../coords/page-space'
import { exportPdf, type ExportProblem } from '../export/export-pdf'
import { createStore } from '../model/store'
import type { Annotation } from '../model/types'
import { annotatedFileName, downloadBytes } from './download'
import type { OpenFile } from './open-file'
import { Overlay } from './Overlay'
import { PageView } from './PageView'
import { PropertiesPanel } from './PropertiesPanel'
import { styleOf, stylePatchFor } from './style'
import { DEFAULT_STYLES, type StyleDefaults, type Tool, type ToolStyles } from './tools'
import { Toolbar } from './Toolbar'
import { useStoreState } from './useStoreState'
import { nextZoom } from './zoom'

export function Editor({ file, onClose }: { file: OpenFile; onClose: () => void }) {
  const [store] = useState(() => createStore())
  const { annotations, selectedId, canUndo, canRedo, revision } = useStoreState(store)
  const [tool, setTool] = useState<Tool>('select')
  const [styles, setStyles] = useState<ToolStyles>(DEFAULT_STYLES)
  const [scale, setScale] = useState(1)
  const pagesRef = useRef<HTMLDivElement | null>(null)
  const [savedRevision, setSavedRevision] = useState(0)
  const [problems, setProblems] = useState<string[]>([])
  const [exportError, setExportError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const dirty = revision !== savedRevision

  async function handleDownload() {
    setExporting(true)
    setExportError(null)
    setProblems([])
    try {
      // Always from the original upload, never a previous export.
      const result = await exportPdf(file.bytes, annotations)
      setProblems(result.problems.map((p) => describeProblem(p, annotations)))
      downloadBytes(result.bytes, annotatedFileName(file.name))
      setSavedRevision(revision)
    } catch (e) {
      setExportError(`Could not create the PDF: ${e instanceof Error && e.message ? e.message : 'unknown error.'}`)
    } finally {
      setExporting(false)
    }
  }

  function handleClose() {
    if (dirty && !window.confirm('You have annotations that have not been downloaded. Open another file anyway?')) return
    onClose()
  }

  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  // State (not just a ref) so pages create their observers once the scroller exists.
  const [pagesEl, setPagesEl] = useState<HTMLDivElement | null>(null)
  const setPagesRef = useCallback((el: HTMLDivElement | null) => {
    pagesRef.current = el
    setPagesEl(el)
  }, [])

  // Only the select tool edits an existing annotation; with a drawing tool the panel sets that tool's defaults.
  const selected = tool === 'select' ? (annotations.find((a) => a.id === selectedId) ?? null) : null
  const panelType = selected?.type ?? (tool === 'select' ? null : tool)
  const panelStyle = selected ? styleOf(selected) : panelType ? styles[panelType] : null

  function chooseTool(t: Tool) {
    setTool(t)
    if (t !== 'select') store.select(null)
  }

  function applyStyle(patch: Partial<StyleDefaults>, key: string) {
    if (!panelType) return
    setStyles((s) => ({ ...s, [panelType]: { ...s[panelType], ...patch } }))
    if (selected) store.update(selected.id, stylePatchFor(selected, patch), key)
  }

  function fitWidth() {
    const el = pagesRef.current
    if (!el) return
    const available = el.clientWidth - 48
    const pageWidth = viewportSize(file.doc.pages[0].geometry, 1).width
    setScale(Math.min(4, Math.max(0.25, available / pageWidth)))
  }

  // Test hook: lets end-to-end tests read the committed annotations. Dev builds only.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as { __annotationStore?: typeof store }
    w.__annotationStore = store
    return () => {
      delete w.__annotationStore
    }
  }, [store])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLElement && e.target.closest('textarea, input')) return
      const mod = e.metaKey || e.ctrlKey
      const key = e.key.toLowerCase()
      if (mod && key === 'z') {
        e.preventDefault()
        if (e.shiftKey) store.redo()
        else store.undo()
      } else if (mod && key === 'y') {
        e.preventDefault()
        store.redo()
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        const id = store.getState().selectedId
        if (id && tool === 'select') {
          e.preventDefault()
          store.remove(id)
        }
      } else if (e.key === 'Escape') {
        store.select(null)
        setTool('select')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [store, tool])

  return (
    <div className="editor">
      <header className="topbar">
        <button className="button" onClick={handleClose}>Open another file</button>
        <strong className="filename">{file.name}</strong>
        <Toolbar tool={tool} onTool={chooseTool} />
        <button className="button" data-testid="undo-button" disabled={!canUndo} onClick={() => store.undo()}>Undo</button>
        <button className="button" data-testid="redo-button" disabled={!canRedo} onClick={() => store.redo()}>Redo</button>
        <button className="button primary" data-testid="download-button" disabled={exporting} onClick={() => void handleDownload()}>
          {exporting ? 'Preparing…' : 'Download PDF'}
        </button>
        <span className="spacer" />
        <div className="zoom">
          <button className="button" data-testid="zoom-out" onClick={() => setScale((s) => nextZoom(s, -1))}>−</button>
          <span>{Math.round(scale * 100)}%</span>
          <button className="button" data-testid="zoom-in" onClick={() => setScale((s) => nextZoom(s, 1))}>+</button>
          <button className="button" data-testid="fit-width" onClick={fitWidth}>Fit width</button>
        </div>
      </header>
      {(problems.length > 0 || exportError) && (
        <div className="banner" role={exportError ? 'alert' : 'status'} data-testid="export-report">
          {exportError ? (
            <p data-testid="export-error">{exportError}</p>
          ) : (
            <>
              <p>Downloaded, with {problems.length} {problems.length === 1 ? 'issue' : 'issues'}:</p>
              <ul data-testid="export-problems">
                {problems.map((text, i) => (
                  <li key={i}>{text}</li>
                ))}
              </ul>
            </>
          )}
          <button className="button" onClick={() => { setProblems([]); setExportError(null) }}>Dismiss</button>
        </div>
      )}
      <div className="workspace">
        <div className="pages" ref={setPagesRef}>
          {file.doc.pages.map((p) => (
            <PageView key={p.index} page={p} scale={scale} root={pagesEl}>
              <Overlay pageIndex={p.index} geometry={p.geometry} scale={scale} tool={tool} styles={styles} store={store} />
            </PageView>
          ))}
        </div>
        {panelType && panelStyle ? (
          <PropertiesPanel
            key={selected?.id ?? panelType}
            type={panelType}
            style={panelStyle}
            hasSelection={!!selected}
            onChange={applyStyle}
            onBringToFront={() => selected && store.bringToFront(selected.id)}
          />
        ) : (
          <aside className="panel hint">Pick a tool, or select an annotation to change its style.</aside>
        )}
      </div>
    </div>
  )
}

/** "Page 2, text box 3: message" - the ordinal counts same-type annotations on that page in drawing order. */
function describeProblem(p: ExportProblem, annotations: readonly Annotation[]): string {
  const ann = annotations.find((a) => a.id === p.annotationId)
  const sameKind = annotations.filter((a) => a.page === p.page && a.type === ann?.type)
  const who = ann ? `${ann.type === 'text' ? 'text box' : ann.type} ${sameKind.indexOf(ann) + 1}` : 'annotation'
  return `Page ${p.page + 1}, ${who}: ${p.message}`
}
