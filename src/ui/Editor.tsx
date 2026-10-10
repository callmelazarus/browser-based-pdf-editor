import { useCallback, useEffect, useRef, useState } from 'react'
import { viewportSize } from '../coords/page-space'
import { createStore } from '../model/store'
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
  const { annotations, selectedId, canUndo, canRedo } = useStoreState(store)
  const [tool, setTool] = useState<Tool>('select')
  const [styles, setStyles] = useState<ToolStyles>(DEFAULT_STYLES)
  const [scale, setScale] = useState(1)
  const pagesRef = useRef<HTMLDivElement | null>(null)
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
        <button className="button" onClick={onClose}>Open another file</button>
        <strong className="filename">{file.name}</strong>
        <Toolbar tool={tool} onTool={chooseTool} />
        <button className="button" data-testid="undo-button" disabled={!canUndo} onClick={() => store.undo()}>Undo</button>
        <button className="button" data-testid="redo-button" disabled={!canRedo} onClick={() => store.redo()}>Redo</button>
        <span className="spacer" />
        <div className="zoom">
          <button className="button" data-testid="zoom-out" onClick={() => setScale((s) => nextZoom(s, -1))}>−</button>
          <span>{Math.round(scale * 100)}%</span>
          <button className="button" data-testid="zoom-in" onClick={() => setScale((s) => nextZoom(s, 1))}>+</button>
          <button className="button" data-testid="fit-width" onClick={fitWidth}>Fit width</button>
        </div>
      </header>
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
