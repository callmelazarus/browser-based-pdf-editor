import { useEffect, useRef, useState, type ReactNode } from 'react'
import { viewportSize } from '../coords/page-space'
import type { PdfPageHandle } from '../render/pdf-document'

/** Reserves the page's full size, but only holds canvas memory while near the viewport. */
export function PageView({ page, scale, children }: { page: PdfPageHandle; scale: number; children?: ReactNode }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [near, setNear] = useState(false)
  const size = viewportSize(page.geometry, scale)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const io = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), { rootMargin: '800px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (!near) {
      canvas.width = 0
      canvas.height = 0
      return
    }
    const task = page.render(canvas, scale)
    task.promise.catch((e) => console.error('Page render failed', e))
    return () => task.cancel()
  }, [near, page, scale])

  return (
    <div ref={wrapRef} className="page" data-testid={`page-${page.index}`} style={{ width: size.width, height: size.height }}>
      <canvas ref={canvasRef} width={0} height={0} data-testid={`page-canvas-${page.index}`} />
      {children}
    </div>
  )
}
