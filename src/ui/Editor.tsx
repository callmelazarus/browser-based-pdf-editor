import { useCallback, useRef, useState } from 'react'
import { viewportSize } from '../coords/page-space'
import type { OpenFile } from './open-file'
import { PageView } from './PageView'
import { nextZoom } from './zoom'

export function Editor({ file, onClose }: { file: OpenFile; onClose: () => void }) {
  const [scale, setScale] = useState(1)
  const pagesRef = useRef<HTMLDivElement | null>(null)
  // State (not just a ref) so pages create their observers once the scroller exists.
  const [pagesEl, setPagesEl] = useState<HTMLDivElement | null>(null)
  const setPagesRef = useCallback((el: HTMLDivElement | null) => {
    pagesRef.current = el
    setPagesEl(el)
  }, [])

  function fitWidth() {
    const el = pagesRef.current
    if (!el) return
    const available = el.clientWidth - 48
    const pageWidth = viewportSize(file.doc.pages[0].geometry, 1).width
    setScale(Math.min(4, Math.max(0.25, available / pageWidth)))
  }

  return (
    <div className="editor">
      <header className="topbar">
        <button className="button" onClick={onClose}>Open another file</button>
        <strong className="filename">{file.name}</strong>
        <span className="spacer" />
        <div className="zoom">
          <button className="button" data-testid="zoom-out" onClick={() => setScale((s) => nextZoom(s, -1))}>−</button>
          <span>{Math.round(scale * 100)}%</span>
          <button className="button" data-testid="zoom-in" onClick={() => setScale((s) => nextZoom(s, 1))}>+</button>
          <button className="button" data-testid="fit-width" onClick={fitWidth}>Fit width</button>
        </div>
      </header>
      <div
        className="pages"
        ref={setPagesRef}
      >
        {file.doc.pages.map((p) => (
          <PageView key={p.index} page={p} scale={scale} root={pagesEl} />
        ))}
      </div>
    </div>
  )
}
