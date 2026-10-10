# PDF Annotator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a client-side web app where a user uploads a PDF, annotates it (highlight, underline, strikethrough, rectangle, ellipse, line, arrow, pen, text box), and downloads a PDF containing native PDF annotations with explicit appearance streams.

**Architecture:** Annotations are plain data in PDF user-space units (the `model`). The editor draws them as an SVG overlay on top of pdf.js canvases and converts between screen pixels and PDF units with a pure `coords` module. Export (`pdf-export`) is one isolated function that turns the model into native annotation dictionaries plus appearance streams with `pdf-lib`, using pure `shapes` functions for the drawing instructions.

**Tech Stack:** TypeScript (strict), Vite, React, `pdfjs-dist`, `pdf-lib`, Vitest, Playwright. Deployed as static files on Vercel.

**Spec:** `docs/superpowers/specs/2026-10-09-pdf-annotator-design.md`

**Commit trailer:** every commit message in this plan ends with a blank line and `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (pass as a second `-m`).

## Global Constraints

- Fully client-side static app: no backend, no database, no environment variables; PDFs never leave the browser.
- Stack: TypeScript (`strict: true`), Vite, React, `pdfjs-dist` (rendering), `pdf-lib` (writing), Vitest (unit), Playwright (end-to-end).
- Annotation geometry is stored in PDF units (points, origin bottom-left) in the page's default user space, never screen pixels.
- Export uses native PDF annotation objects, each with an explicit appearance stream (`/AP`), and writes the model ID into `/NM`.
- Export always starts from the original uploaded bytes; the original is never modified.
- Text boxes: Helvetica only, chosen size and color, left-aligned; wrapping computed from measured glyph widths; characters outside the supported set are reported at export, not silently dropped.
- Page `/Rotate` and crop box are honoured when converting between screen and PDF coordinates.
- Highlight, underline and strikethrough are dragged rectangles (no text reading).
- Out of scope for v1: text reading/selection, form-filling, images/signatures, custom fonts, password-protected PDFs, reopening and editing a downloaded PDF's annotations, saving work-in-progress.
- Deployment: Vite static build served by Vercel.

## Review Focus

Inputs the spec implies but a happy-path test would not exercise, most likely first. Each line is pinned by a test in the task named.

1. A page with `/Rotate` 90/180/270 or a crop box that does not start at (0,0): an annotation must land exactly where it was drawn, and text must stay upright on screen. (Task 3 coordinate tests, Task 5 text matrix test, Task 11 end-to-end pixel checks.)
2. Pasted text with curly quotes, em-dashes, tabs, emoji or CJK: no crash; WinAnsi-representable characters are preserved; others become `?` and are listed in the export report. (Task 4, Task 6.)
3. A PDF with hundreds of pages: only pages near the viewport hold canvas memory. (Task 7 end-to-end.)
4. A non-PDF, a 0-byte file or a password-protected PDF: a clear message appears and the app stays on the upload screen. (Task 7.)
5. A PDF that already has annotations, including one produced by this app's own export: existing annotations are preserved and new ones appended. (Task 6.)

## File Structure

```
package.json, tsconfig.json, vite.config.ts, playwright.config.ts, index.html, .gitignore, README.md
src/main.tsx, src/App.tsx, src/styles.css
src/model/types.ts            annotation types (Rect, Point, Annotation union)
src/model/store.ts            immutable store: add/update/remove/select/undo/redo
src/coords/page-space.ts      PDF user space <-> viewport pixels (rotation, crop box, scale)
src/coords/frame.ts           screen-oriented frame matrix for text/underline/strikeout
src/text/winansi.ts           WinAnsi support, sanitising, PDF string literals
src/text/helvetica.ts         Helvetica width measurement via pdf-lib
src/text/layout.ts            word wrap and baselines for text boxes
src/shapes/geometry.ts        arrowheads, bounds helpers
src/shapes/appearance.ts      annotation -> appearance-stream content + bbox
src/export/export-pdf.ts      exportPdf(originalBytes, annotations) -> {bytes, problems}
src/render/pdf-document.ts    pdf.js loading, page geometry, canvas rendering, load errors
src/ui/                       React components, tools, transforms, styles (see tasks)
tests/helpers/makePdf.ts      fixture PDF generator used by unit and e2e tests
e2e/                          Playwright specs and helpers
```

---

### Task 1: Project scaffold and fixture generator

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `.gitignore`, `src/main.tsx`, `src/App.tsx`, `src/styles.css`, `tests/helpers/makePdf.ts`
- Test: `tests/helpers/makePdf.test.ts`

**Interfaces:**
- Produces: `makePdf(pages: PageSpec[]): Promise<Uint8Array>` where `PageSpec = { width: number; height: number; rotate?: 0|90|180|270; cropBox?: [x: number, y: number, width: number, height: number]; label?: string }`.

- [ ] **Step 1: Install tooling**

```bash
npm init -y
npm pkg delete main
npm pkg set name=pdf-annotator private=true type=module
npm install react react-dom pdfjs-dist pdf-lib
npm install -D typescript vite @vitejs/plugin-react @types/react @types/react-dom vitest @playwright/test
npm pkg set scripts.dev=vite scripts.build="tsc --noEmit && vite build" scripts.preview="vite preview" scripts.test="vitest run" scripts.test:watch=vitest scripts.test:e2e="playwright test"
npx playwright install chromium
```

- [ ] **Step 2: Write config files**

`.gitignore`:
```
node_modules
dist
test-results
playwright-report
.DS_Store
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noImplicitReturns": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["vite/client"]
  },
  "include": ["src", "tests", "e2e", "vite.config.ts", "playwright.config.ts"]
}
```

`vite.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: { include: ['src/**/*.test.ts', 'tests/**/*.test.ts'], environment: 'node' },
})
```

`index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>PDF Annotator</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/main.tsx`:
```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

`src/App.tsx`:
```tsx
export function App() {
  return <h1>PDF Annotator</h1>
}
```

`src/styles.css`:
```css
html, body, #root { height: 100%; margin: 0; }
body { font-family: system-ui, sans-serif; background: #e9ecef; color: #212529; }
```

- [ ] **Step 3: Write the failing test**

`tests/helpers/makePdf.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { makePdf } from './makePdf'

describe('makePdf', () => {
  it('builds pages with the requested size, rotation and crop box', async () => {
    const bytes = await makePdf([
      { width: 612, height: 792 },
      { width: 300, height: 400, rotate: 90, cropBox: [10, 20, 200, 300] },
    ])
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(2)
    const second = doc.getPage(1)
    expect(second.getRotation().angle).toBe(90)
    expect(second.getCropBox()).toEqual({ x: 10, y: 20, width: 200, height: 300 })
  })
})
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npx vitest run tests/helpers/makePdf.test.ts`
Expected: FAIL, cannot find module `./makePdf`.

- [ ] **Step 5: Implement**

`tests/helpers/makePdf.ts`:
```ts
import { PDFDocument, StandardFonts, degrees } from 'pdf-lib'

export interface PageSpec {
  width: number
  height: number
  rotate?: 0 | 90 | 180 | 270
  /** [x, y, width, height] in user space */
  cropBox?: [number, number, number, number]
  label?: string
}

export async function makePdf(pages: PageSpec[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  pages.forEach((spec, i) => {
    const page = doc.addPage([spec.width, spec.height])
    if (spec.rotate) page.setRotation(degrees(spec.rotate))
    if (spec.cropBox) page.setCropBox(...spec.cropBox)
    page.drawText(spec.label ?? `Page ${i + 1}`, { x: 20, y: spec.height - 40, size: 20, font })
  })
  return doc.save()
}
```

- [ ] **Step 6: Verify tests and build pass**

Run: `npx vitest run && npm run build`
Expected: 1 test passes; build succeeds.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite, React, TypeScript, Vitest and fixture generator" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Annotation model and store

**Files:**
- Create: `src/model/types.ts`, `src/model/store.ts`
- Test: `src/model/store.test.ts`

**Interfaces:**
- Produces: types `Rotation`, `Point`, `Rect`, `Rgb`, `Annotation` (discriminated on `type`), `AnnotationType`, `RectAnnotation`, `isRectAnnotation`; `createStore(initial?)` returning `AnnotationStore` with `getState()`, `subscribe(fn)`, `add(a)`, `update(id, patch, coalesceKey?)`, `remove(id)`, `select(id|null)`, `bringToFront(id)`, `undo()`, `redo()`; `StoreState = { annotations; selectedId; revision; canUndo; canRedo }`.

- [ ] **Step 1: Write the types**

`src/model/types.ts`:
```ts
export type Rotation = 0 | 90 | 180 | 270
export interface Point { x: number; y: number }
/** x,y is the lower-left corner in PDF user space. */
export interface Rect { x: number; y: number; width: number; height: number }
/** Components in 0..1. */
export interface Rgb { r: number; g: number; b: number }

interface Base {
  id: string
  /** zero-based page index */
  page: number
  /** the page's /Rotate when the annotation was created; keeps text upright on screen */
  pageRotation: Rotation
  color: Rgb
  opacity: number
}

export interface HighlightAnnotation extends Base { type: 'highlight'; rect: Rect }
export interface UnderlineAnnotation extends Base { type: 'underline'; rect: Rect; strokeWidth: number }
export interface StrikeoutAnnotation extends Base { type: 'strikeout'; rect: Rect; strokeWidth: number }
export interface RectangleAnnotation extends Base { type: 'rectangle'; rect: Rect; strokeWidth: number }
export interface EllipseAnnotation extends Base { type: 'ellipse'; rect: Rect; strokeWidth: number }
export interface LineAnnotation extends Base { type: 'line' | 'arrow'; from: Point; to: Point; strokeWidth: number }
export interface PenAnnotation extends Base { type: 'pen'; points: Point[]; strokeWidth: number }
export interface TextAnnotation extends Base { type: 'text'; rect: Rect; text: string; fontSize: number }

export type Annotation =
  | HighlightAnnotation
  | UnderlineAnnotation
  | StrikeoutAnnotation
  | RectangleAnnotation
  | EllipseAnnotation
  | LineAnnotation
  | PenAnnotation
  | TextAnnotation

export type AnnotationType = Annotation['type']
export type RectAnnotation = Extract<Annotation, { rect: Rect }>

export function isRectAnnotation(a: Annotation): a is RectAnnotation {
  return 'rect' in a
}
```

- [ ] **Step 2: Write the failing tests**

`src/model/store.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest'
import { createStore } from './store'
import type { Annotation } from './types'

const rect = (id: string, opacity = 0.5): Annotation => ({
  id, page: 0, pageRotation: 0, type: 'rectangle',
  color: { r: 1, g: 0, b: 0 }, opacity, strokeWidth: 2,
  rect: { x: 10, y: 20, width: 100, height: 50 },
})

describe('annotation store', () => {
  it('adds and selects an annotation', () => {
    const s = createStore()
    s.add(rect('a'))
    expect(s.getState().annotations).toHaveLength(1)
    expect(s.getState().selectedId).toBe('a')
  })

  it('undoes and redoes add', () => {
    const s = createStore()
    s.add(rect('a'))
    s.undo()
    expect(s.getState().annotations).toHaveLength(0)
    expect(s.getState().canRedo).toBe(true)
    s.redo()
    expect(s.getState().annotations).toHaveLength(1)
  })

  it('a new action clears the redo stack', () => {
    const s = createStore()
    s.add(rect('a'))
    s.undo()
    s.add(rect('b'))
    expect(s.getState().canRedo).toBe(false)
  })

  it('updates fields but never id or type', () => {
    const s = createStore([rect('a')])
    s.update('a', { opacity: 0.9, id: 'zzz' } as Partial<Annotation>)
    const a = s.getState().annotations[0]
    expect(a.opacity).toBe(0.9)
    expect(a.id).toBe('a')
  })

  it('remove deselects, and undo restores it', () => {
    const s = createStore()
    s.add(rect('a'))
    s.remove('a')
    expect(s.getState().selectedId).toBeNull()
    s.undo()
    expect(s.getState().annotations).toHaveLength(1)
  })

  it('coalesces consecutive updates that share a key and id into one undo step', () => {
    const s = createStore([rect('a', 0.5)])
    s.update('a', { opacity: 0.6 }, 'opacity')
    s.update('a', { opacity: 0.7 }, 'opacity')
    s.update('a', { opacity: 0.8 }, 'opacity')
    s.undo()
    expect(s.getState().annotations[0].opacity).toBe(0.5)
  })

  it('does not coalesce updates with different keys', () => {
    const s = createStore([rect('a', 0.5)])
    s.update('a', { opacity: 0.6 }, 'opacity')
    s.update('a', { color: { r: 0, g: 0, b: 1 } }, 'color')
    s.undo()
    expect(s.getState().annotations[0].opacity).toBe(0.6)
  })

  it('brings an annotation to the front', () => {
    const s = createStore([rect('a'), rect('b')])
    s.bringToFront('a')
    expect(s.getState().annotations.map((x) => x.id)).toEqual(['b', 'a'])
  })

  it('notifies subscribers and keeps state identity stable when nothing changes', () => {
    const s = createStore()
    const fn = vi.fn()
    s.subscribe(fn)
    const before = s.getState()
    expect(s.getState()).toBe(before)
    s.add(rect('a'))
    expect(fn).toHaveBeenCalledTimes(1)
    expect(s.getState()).not.toBe(before)
  })

  it('increments revision on every content change including undo', () => {
    const s = createStore()
    s.add(rect('a'))
    const r1 = s.getState().revision
    s.undo()
    expect(s.getState().revision).toBeGreaterThan(r1)
  })
})
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run src/model/store.test.ts`
Expected: FAIL, cannot find module `./store`.

- [ ] **Step 4: Implement the store**

`src/model/store.ts`:
```ts
import type { Annotation } from './types'

export interface StoreState {
  readonly annotations: readonly Annotation[]
  readonly selectedId: string | null
  /** increments on every content change (including undo/redo); used for unsaved-changes tracking */
  readonly revision: number
  readonly canUndo: boolean
  readonly canRedo: boolean
}

export interface AnnotationStore {
  getState(): StoreState
  subscribe(listener: () => void): () => void
  add(a: Annotation): void
  /** Consecutive updates with the same coalesceKey and id share one undo step. */
  update(id: string, patch: Partial<Annotation>, coalesceKey?: string): void
  remove(id: string): void
  select(id: string | null): void
  bringToFront(id: string): void
  undo(): void
  redo(): void
}

type List = readonly Annotation[]

export function createStore(initial: List = []): AnnotationStore {
  let annotations: List = initial
  let selectedId: string | null = null
  let revision = 0
  let past: List[] = []
  let future: List[] = []
  let lastCoalesce: { key: string; id: string } | null = null
  const listeners = new Set<() => void>()

  const build = (): StoreState => ({
    annotations, selectedId, revision, canUndo: past.length > 0, canRedo: future.length > 0,
  })
  let state = build()
  const emit = () => {
    state = build()
    listeners.forEach((l) => l())
  }

  function commit(next: List, opts: { selectedId?: string | null; coalesce?: { key: string; id: string } } = {}) {
    const coalescing =
      !!opts.coalesce && !!lastCoalesce && opts.coalesce.key === lastCoalesce.key && opts.coalesce.id === lastCoalesce.id
    if (!coalescing) {
      past = [...past, annotations]
      future = []
    }
    lastCoalesce = opts.coalesce ?? null
    annotations = next
    revision++
    if (opts.selectedId !== undefined) selectedId = opts.selectedId
    emit()
  }

  function restore(list: List) {
    annotations = list
    revision++
    lastCoalesce = null
    if (selectedId && !annotations.some((a) => a.id === selectedId)) selectedId = null
    emit()
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    add(a) {
      commit([...annotations, a], { selectedId: a.id })
    },
    update(id, patch, coalesceKey) {
      if (!annotations.some((a) => a.id === id)) return
      commit(
        annotations.map((a) => (a.id === id ? ({ ...a, ...patch, id: a.id, type: a.type } as Annotation) : a)),
        { coalesce: coalesceKey ? { key: coalesceKey, id } : undefined },
      )
    },
    remove(id) {
      if (!annotations.some((a) => a.id === id)) return
      commit(annotations.filter((a) => a.id !== id), { selectedId: selectedId === id ? null : selectedId })
    },
    select(id) {
      if (id === selectedId) return
      selectedId = id
      emit()
    },
    bringToFront(id) {
      const target = annotations.find((a) => a.id === id)
      if (!target || annotations[annotations.length - 1] === target) return
      commit([...annotations.filter((a) => a.id !== id), target])
    },
    undo() {
      if (!past.length) return
      const prev = past[past.length - 1]
      past = past.slice(0, -1)
      future = [...future, annotations]
      restore(prev)
    },
    redo() {
      if (!future.length) return
      const next = future[future.length - 1]
      future = future.slice(0, -1)
      past = [...past, annotations]
      restore(next)
    },
  }
}
```

- [ ] **Step 5: Verify pass**

Run: `npx vitest run src/model/store.test.ts`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(model): annotation types and undoable store" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Page coordinate conversion and screen frame

**Files:**
- Create: `src/coords/page-space.ts`, `src/coords/frame.ts`
- Test: `src/coords/page-space.test.ts`, `src/coords/frame.test.ts`

**Interfaces:**
- Consumes: `Point`, `Rect`, `Rotation` from `src/model/types`.
- Produces: `PageGeometry = { view: readonly [x0,y0,x1,y1]; rotate: Rotation }`; `normalizeRotation(deg): Rotation`; `viewportSize(g, scale): {width,height}`; `userToViewport(g, scale, p): Point`; `viewportToUser(g, scale, p): Point`; `rectToViewport(g, scale, r): Rect` (top-left origin, normalized); `viewportRectToUser(g, scale, r): Rect`; `Matrix`, `Frame = {matrix, width, height}`, `screenFrame(rect, rotation): Frame`, `applyMatrix(m, p): Point`.

- [ ] **Step 1: Write the failing page-space tests**

`src/coords/page-space.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import {
  normalizeRotation, rectToViewport, userToViewport, viewportRectToUser, viewportSize, viewportToUser,
  type PageGeometry,
} from './page-space'

const letter = (rotate: PageGeometry['rotate']): PageGeometry => ({ view: [0, 0, 612, 792], rotate })

describe('page-space', () => {
  it('normalizes rotation values', () => {
    expect(normalizeRotation(-90)).toBe(270)
    expect(normalizeRotation(450)).toBe(90)
    expect(normalizeRotation(0)).toBe(0)
  })

  it('sizes the viewport, swapping axes for 90/270', () => {
    expect(viewportSize(letter(0), 2)).toEqual({ width: 1224, height: 1584 })
    expect(viewportSize(letter(90), 1)).toEqual({ width: 792, height: 612 })
    expect(viewportSize(letter(270), 1)).toEqual({ width: 792, height: 612 })
  })

  it('maps user space to a top-left-origin viewport at rotation 0', () => {
    expect(userToViewport(letter(0), 2, { x: 100, y: 700 })).toEqual({ x: 200, y: 184 })
  })

  it('maps the user-space origin to the expected viewport corner for each rotation', () => {
    expect(userToViewport(letter(0), 1, { x: 0, y: 0 })).toEqual({ x: 0, y: 792 })
    expect(userToViewport(letter(90), 1, { x: 0, y: 0 })).toEqual({ x: 0, y: 0 })
    expect(userToViewport(letter(180), 1, { x: 0, y: 0 })).toEqual({ x: 612, y: 0 })
    expect(userToViewport(letter(270), 1, { x: 0, y: 0 })).toEqual({ x: 792, y: 612 })
  })

  it('honours a crop box that does not start at the origin', () => {
    const g: PageGeometry = { view: [10, 20, 310, 420], rotate: 0 }
    expect(userToViewport(g, 1, { x: 10, y: 420 })).toEqual({ x: 0, y: 0 })
    expect(userToViewport(g, 1, { x: 310, y: 20 })).toEqual({ x: 300, y: 400 })
  })

  it('round-trips points for every rotation, crop box and scale', () => {
    for (const rotate of [0, 90, 180, 270] as const) {
      const g: PageGeometry = { view: [10, 20, 310, 420], rotate }
      const p = { x: 123.5, y: 77.25 }
      const back = viewportToUser(g, 1.5, userToViewport(g, 1.5, p))
      expect(back.x).toBeCloseTo(p.x, 6)
      expect(back.y).toBeCloseTo(p.y, 6)
    }
  })

  it('converts rects to a normalized viewport rect and back', () => {
    const r = { x: 100, y: 600, width: 200, height: 50 }
    expect(rectToViewport(letter(0), 1, r)).toEqual({ x: 100, y: 142, width: 200, height: 50 })
    for (const rotate of [0, 90, 180, 270] as const) {
      const g = letter(rotate)
      const back = viewportRectToUser(g, 2, rectToViewport(g, 2, r))
      expect(back.x).toBeCloseTo(r.x, 6)
      expect(back.y).toBeCloseTo(r.y, 6)
      expect(back.width).toBeCloseTo(r.width, 6)
      expect(back.height).toBeCloseTo(r.height, 6)
    }
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/coords/page-space.test.ts`
Expected: FAIL, cannot find module.

- [ ] **Step 3: Implement page-space**

`src/coords/page-space.ts`:
```ts
import type { Point, Rect, Rotation } from '../model/types'

/** `view` is pdf.js `page.view` ([x0,y0,x1,y1] of the crop box); `rotate` is the page's /Rotate. */
export interface PageGeometry {
  view: readonly [number, number, number, number]
  rotate: Rotation
}

export function normalizeRotation(deg: number): Rotation {
  return ((((Math.round(deg / 90) * 90) % 360) + 360) % 360) as Rotation
}

export function viewportSize(g: PageGeometry, scale: number): { width: number; height: number } {
  const w = g.view[2] - g.view[0]
  const h = g.view[3] - g.view[1]
  const swap = g.rotate === 90 || g.rotate === 270
  return { width: (swap ? h : w) * scale, height: (swap ? w : h) * scale }
}

/** Viewport coordinates have a top-left origin, y down, and include page rotation. */
export function userToViewport(g: PageGeometry, scale: number, p: Point): Point {
  const [x0, y0, x1, y1] = g.view
  switch (g.rotate) {
    case 0: return { x: (p.x - x0) * scale, y: (y1 - p.y) * scale }
    case 90: return { x: (p.y - y0) * scale, y: (p.x - x0) * scale }
    case 180: return { x: (x1 - p.x) * scale, y: (p.y - y0) * scale }
    case 270: return { x: (y1 - p.y) * scale, y: (x1 - p.x) * scale }
  }
}

export function viewportToUser(g: PageGeometry, scale: number, p: Point): Point {
  const [x0, y0, x1, y1] = g.view
  const vx = p.x / scale
  const vy = p.y / scale
  switch (g.rotate) {
    case 0: return { x: x0 + vx, y: y1 - vy }
    case 90: return { x: x0 + vy, y: y0 + vx }
    case 180: return { x: x1 - vx, y: y0 + vy }
    case 270: return { x: x1 - vy, y: y1 - vx }
  }
}

export function rectToViewport(g: PageGeometry, scale: number, r: Rect): Rect {
  const a = userToViewport(g, scale, { x: r.x, y: r.y })
  const b = userToViewport(g, scale, { x: r.x + r.width, y: r.y + r.height })
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) }
}

export function viewportRectToUser(g: PageGeometry, scale: number, r: Rect): Rect {
  const a = viewportToUser(g, scale, { x: r.x, y: r.y })
  const b = viewportToUser(g, scale, { x: r.x + r.width, y: r.y + r.height })
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) }
}
```

- [ ] **Step 4: Verify pass**

Run: `npx vitest run src/coords/page-space.test.ts`
Expected: all pass.

- [ ] **Step 5: Write the failing frame tests**

`src/coords/frame.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { applyMatrix, screenFrame } from './frame'
import { rectToViewport, userToViewport, type PageGeometry } from './page-space'

describe('screenFrame', () => {
  const rect = { x: 100, y: 200, width: 50, height: 30 }

  it('swaps width and height for 90/270', () => {
    expect(screenFrame(rect, 0)).toMatchObject({ width: 50, height: 30 })
    expect(screenFrame(rect, 90)).toMatchObject({ width: 30, height: 50 })
    expect(screenFrame(rect, 180)).toMatchObject({ width: 50, height: 30 })
    expect(screenFrame(rect, 270)).toMatchObject({ width: 30, height: 50 })
  })

  it('uses the standard rotation matrices', () => {
    expect(screenFrame(rect, 0).matrix).toEqual([1, 0, 0, 1, 100, 200])
    expect(screenFrame(rect, 90).matrix).toEqual([0, 1, -1, 0, 150, 200])
    expect(screenFrame(rect, 180).matrix).toEqual([-1, 0, 0, -1, 150, 230])
    expect(screenFrame(rect, 270).matrix).toEqual([0, -1, 1, 0, 100, 230])
  })

  it('agrees with the viewport conversion: the frame top-left and bottom-right land on the viewport rect corners', () => {
    for (const rotate of [0, 90, 180, 270] as const) {
      const g: PageGeometry = { view: [0, 0, 612, 792], rotate }
      const frame = screenFrame(rect, rotate)
      const rv = rectToViewport(g, 1, rect)
      const topLeft = userToViewport(g, 1, applyMatrix(frame.matrix, { x: 0, y: frame.height }))
      const bottomRight = userToViewport(g, 1, applyMatrix(frame.matrix, { x: frame.width, y: 0 }))
      expect(topLeft).toEqual({ x: rv.x, y: rv.y })
      expect(bottomRight).toEqual({ x: rv.x + rv.width, y: rv.y + rv.height })
    }
  })
})
```

- [ ] **Step 6: Run to verify failure**

Run: `npx vitest run src/coords/frame.test.ts`
Expected: FAIL, cannot find module `./frame`.

- [ ] **Step 7: Implement frame**

`src/coords/frame.ts`:
```ts
import type { Point, Rect, Rotation } from '../model/types'

export type Matrix = readonly [number, number, number, number, number, number]

/**
 * A screen-oriented coordinate frame for a rect: (0,0) is the lower-left of the box as seen
 * on screen, x runs right, y runs up. `matrix` maps frame coordinates into PDF user space.
 * `width`/`height` are the box dimensions as seen on screen (swapped for 90/270).
 */
export interface Frame {
  matrix: Matrix
  width: number
  height: number
}

export function screenFrame(rect: Rect, rotation: Rotation): Frame {
  const { x, y, width: w, height: h } = rect
  switch (rotation) {
    case 0: return { matrix: [1, 0, 0, 1, x, y], width: w, height: h }
    case 90: return { matrix: [0, 1, -1, 0, x + w, y], width: h, height: w }
    case 180: return { matrix: [-1, 0, 0, -1, x + w, y + h], width: w, height: h }
    case 270: return { matrix: [0, -1, 1, 0, x, y + h], width: h, height: w }
  }
}

export function applyMatrix(m: Matrix, p: Point): Point {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] }
}
```

- [ ] **Step 8: Verify all pass, then commit**

Run: `npx vitest run`
Expected: all tests pass.

```bash
git add -A
git commit -m "feat(coords): page-space conversion with rotation and crop box, plus screen frame" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Text support (WinAnsi, Helvetica measurement, wrapping)

**Files:**
- Create: `src/text/winansi.ts`, `src/text/helvetica.ts`, `src/text/layout.ts`
- Test: `src/text/winansi.test.ts`, `src/text/layout.test.ts`

**Interfaces:**
- Produces: `findUnsupportedChars(text): string[]`; `sanitizeText(text): string` (CRLF to `\n`, tab to space, unsupported to `?`); `toPdfLiteral(sanitized): string` (a PDF literal string with parentheses, e.g. `(Hello)`); `loadHelvetica(): Promise<void>`; `measureText(text, size): number` (throws if not loaded); constants `TEXT_PADDING = 2`, `LINE_HEIGHT = 1.2`, `BASELINE_ASCENT = 0.85`; `wrapText(text, fontSize, maxWidth): string[]`; `layoutTextBox(text, fontSize, frameWidth, frameHeight): { lines: string[]; baselines: number[]; overflows: boolean }` where `baselines[i]` is the distance from the frame **top** down to line i's baseline.

- [ ] **Step 1: Write the failing WinAnsi tests**

`src/text/winansi.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { findUnsupportedChars, sanitizeText, toPdfLiteral } from './winansi'

describe('winansi', () => {
  it('accepts ASCII, Latin-1 and common WinAnsi punctuation', () => {
    expect(findUnsupportedChars('Hello café “quoted” — 5€ …')).toEqual([])
  })

  it('reports unsupported characters once each, ignoring whitespace controls', () => {
    expect(findUnsupportedChars('a 😀 b 😀 日本\t\n')).toEqual(['😀', '日', '本'])
  })

  it('sanitizes line endings, tabs and unsupported characters', () => {
    expect(sanitizeText('a\r\nb\rc\td😀')).toBe('a\nb\nc d?')
  })

  it('escapes parentheses and backslashes in PDF literals', () => {
    expect(toPdfLiteral('a(b)c\\d')).toBe('(a\\(b\\)c\\\\d)')
  })

  it('encodes non-ASCII characters as octal WinAnsi codes', () => {
    expect(toPdfLiteral('é')).toBe('(\\351)')
    expect(toPdfLiteral('“')).toBe('(\\223)')
    expect(toPdfLiteral('€')).toBe('(\\200)')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/text/winansi.test.ts`
Expected: FAIL, cannot find module.

- [ ] **Step 3: Implement winansi and helvetica**

`src/text/winansi.ts`:
```ts
/** Unicode code points in the WinAnsi 0x80-0x9F block, mapped to their WinAnsi byte. */
const EXTRAS: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87,
  0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91,
  0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98,
  0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
}

/** The WinAnsi byte for a single character, or null if Helvetica cannot show it. */
export function winAnsiCode(ch: string): number | null {
  const cp = ch.codePointAt(0)!
  if (cp >= 0x20 && cp <= 0x7e) return cp
  if (cp >= 0xa0 && cp <= 0xff) return cp
  return EXTRAS[cp] ?? null
}

const WHITESPACE = new Set(['\n', '\r', '\t'])

export function findUnsupportedChars(text: string): string[] {
  const found = new Set<string>()
  for (const ch of text) {
    if (!WHITESPACE.has(ch) && winAnsiCode(ch) === null) found.add(ch)
  }
  return [...found]
}

export function sanitizeText(text: string): string {
  let out = ''
  for (const ch of text.replace(/\r\n?/g, '\n')) {
    if (ch === '\n') out += ch
    else if (ch === '\t') out += ' '
    else out += winAnsiCode(ch) === null ? '?' : ch
  }
  return out
}

/** `text` must already be sanitized. */
export function toPdfLiteral(text: string): string {
  let out = '('
  for (const ch of text) {
    const code = winAnsiCode(ch) ?? 0x3f
    if (ch === '\\' || ch === '(' || ch === ')') out += `\\${ch}`
    else if (code >= 0x20 && code <= 0x7e) out += ch
    else out += `\\${code.toString(8).padStart(3, '0')}`
  }
  return `${out})`
}
```

`src/text/helvetica.ts`:
```ts
import { PDFDocument, StandardFonts, type PDFFont } from 'pdf-lib'

let font: PDFFont | null = null

/** Must be awaited once before measureText is used. Safe to call repeatedly. */
export async function loadHelvetica(): Promise<void> {
  if (font) return
  const doc = await PDFDocument.create()
  font = await doc.embedFont(StandardFonts.Helvetica)
}

/** `text` must be sanitized (WinAnsi characters only). */
export function measureText(text: string, size: number): number {
  if (!font) throw new Error('Helvetica is not loaded; await loadHelvetica() first')
  return font.widthOfTextAtSize(text, size)
}
```

- [ ] **Step 4: Verify pass**

Run: `npx vitest run src/text/winansi.test.ts`
Expected: all pass.

- [ ] **Step 5: Write the failing layout tests**

`src/text/layout.test.ts`:
```ts
import { beforeAll, describe, expect, it } from 'vitest'
import { loadHelvetica } from './helvetica'
import { layoutTextBox, wrapText } from './layout'

beforeAll(loadHelvetica)

describe('wrapText', () => {
  it('keeps short text on one line', () => {
    expect(wrapText('hello world', 12, 100)).toEqual(['hello world'])
  })

  it('wraps at word boundaries', () => {
    expect(wrapText('hello world', 12, 40)).toEqual(['hello', 'world'])
  })

  it('breaks a word that is wider than the box', () => {
    expect(wrapText('WWWWWWWWWW', 12, 50)).toEqual(['WWWW', 'WWWW', 'WW'])
  })

  it('preserves explicit newlines and blank lines', () => {
    expect(wrapText('a\n\nb', 12, 100)).toEqual(['a', '', 'b'])
  })

  it('does not hang or throw when the box is narrower than any glyph', () => {
    expect(wrapText('abc', 12, 0)).toEqual(['a', 'b', 'c'])
  })

  it('replaces unsupported characters instead of throwing', () => {
    expect(wrapText('hi 😀', 12, 100)).toEqual(['hi ?'])
  })
})

describe('layoutTextBox', () => {
  it('places baselines below the frame top, one line height apart', () => {
    const { baselines } = layoutTextBox('a\nb', 10, 100, 100)
    expect(baselines[0]).toBeCloseTo(2 + 8.5)
    expect(baselines[1] - baselines[0]).toBeCloseTo(12)
  })

  it('flags text that does not fit the box height', () => {
    expect(layoutTextBox('a\nb\nc\nd\ne\nf', 14, 100, 30).overflows).toBe(true)
    expect(layoutTextBox('a', 14, 100, 48).overflows).toBe(false)
  })

  it('treats empty text as one blank line that fits', () => {
    const r = layoutTextBox('', 14, 160, 48)
    expect(r.lines).toEqual([''])
    expect(r.overflows).toBe(false)
  })
})
```

- [ ] **Step 6: Run to verify failure**

Run: `npx vitest run src/text/layout.test.ts`
Expected: FAIL, cannot find module `./layout`.

- [ ] **Step 7: Implement layout**

`src/text/layout.ts`:
```ts
import { measureText } from './helvetica'
import { sanitizeText } from './winansi'

export const TEXT_PADDING = 2
export const LINE_HEIGHT = 1.2
/** Distance from a line's top to its baseline, as a fraction of font size. */
export const BASELINE_ASCENT = 0.85

export function wrapText(text: string, fontSize: number, maxWidth: number): string[] {
  const out: string[] = []
  for (const paragraph of sanitizeText(text).split('\n')) {
    if (paragraph === '') {
      out.push('')
      continue
    }
    let line = ''
    for (const word of paragraph.split(' ')) {
      const candidate = line === '' ? word : `${line} ${word}`
      if (measureText(candidate, fontSize) <= maxWidth) {
        line = candidate
        continue
      }
      if (line !== '') {
        out.push(line)
        line = ''
      }
      let chunk = ''
      for (const ch of word) {
        if (chunk !== '' && measureText(chunk + ch, fontSize) > maxWidth) {
          out.push(chunk)
          chunk = ''
        }
        chunk += ch
      }
      line = chunk
    }
    out.push(line)
  }
  return out
}

export function layoutTextBox(text: string, fontSize: number, frameWidth: number, frameHeight: number) {
  const lines = wrapText(text, fontSize, frameWidth - 2 * TEXT_PADDING)
  const lineHeight = fontSize * LINE_HEIGHT
  const baselines = lines.map((_, i) => TEXT_PADDING + fontSize * BASELINE_ASCENT + i * lineHeight)
  const last = baselines[baselines.length - 1]
  const overflows = last + fontSize * 0.2 > frameHeight
  return { lines, baselines, overflows }
}
```

- [ ] **Step 8: Verify pass and commit**

Run: `npx vitest run`
Expected: all pass. (If the "narrower than any glyph" case loops or fails, fix `wrapText` before continuing.)

```bash
git add -A
git commit -m "feat(text): WinAnsi handling, Helvetica measurement and text-box wrapping" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Appearance-stream shapes

**Files:**
- Create: `src/shapes/geometry.ts`, `src/shapes/appearance.ts`
- Test: `src/shapes/appearance.test.ts`

**Interfaces:**
- Consumes: `Annotation` types (Task 2), `screenFrame` (Task 3), `layoutTextBox`, `TEXT_PADDING` (Task 4), `sanitizeText`, `toPdfLiteral` (Task 4).
- Produces: `arrowHeadLength(strokeWidth): number`; `arrowHeadPoints(from, to, length): [Point, Point]`; `boundsOfPoints(points): BBox`; `BBox = [x0, y0, x1, y1]`; `Appearance = { bbox: BBox; content: string; opacity: number; blendMultiply: boolean; usesFont: boolean }`; `buildAppearance(a: Annotation): Appearance`. Content streams reference graphics state `/GS0` (opacity, optional Multiply blend) and, for text, font `/F1`.

- [ ] **Step 1: Implement geometry helpers**

`src/shapes/geometry.ts`:
```ts
import type { Point } from '../model/types'

export type BBox = [number, number, number, number]

export function arrowHeadLength(strokeWidth: number): number {
  return Math.max(8, strokeWidth * 4)
}

const HEAD_ANGLE = Math.PI / 7

/** The two barb end-points of an open arrowhead whose tip is `to`. Works in any planar coordinate system. */
export function arrowHeadPoints(from: Point, to: Point, length: number): [Point, Point] {
  const angle = Math.atan2(to.y - from.y, to.x - from.x)
  const at = (offset: number): Point => ({
    x: to.x - length * Math.cos(angle + offset),
    y: to.y - length * Math.sin(angle + offset),
  })
  return [at(HEAD_ANGLE), at(-HEAD_ANGLE)]
}

export function boundsOfPoints(points: readonly Point[]): BBox {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const p of points) {
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y)
    x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y)
  }
  return [x0, y0, x1, y1]
}

export function padBounds(b: BBox, pad: number): BBox {
  return [b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad]
}
```

- [ ] **Step 2: Write the failing tests**

`src/shapes/appearance.test.ts`:
```ts
import { beforeAll, describe, expect, it } from 'vitest'
import type { Annotation } from '../model/types'
import { loadHelvetica } from '../text/helvetica'
import { buildAppearance } from './appearance'

beforeAll(loadHelvetica)

const base = { id: 'a', page: 0, pageRotation: 0 as const, color: { r: 1, g: 0, b: 0 }, opacity: 1 }
const rect = { x: 10, y: 20, width: 100, height: 50 }

describe('buildAppearance', () => {
  it('draws a highlight as a filled rect with a multiply blend', () => {
    const ap = buildAppearance({ ...base, type: 'highlight', color: { r: 1, g: 1, b: 0 }, rect })
    expect(ap.blendMultiply).toBe(true)
    expect(ap.bbox).toEqual([10, 20, 110, 70])
    expect(ap.content).toBe('/GS0 gs\n1 1 0 rg\n10 20 100 50 re\nf')
  })

  it('insets rectangle strokes so they stay inside the bbox', () => {
    const ap = buildAppearance({ ...base, type: 'rectangle', strokeWidth: 2, rect })
    expect(ap.bbox).toEqual([10, 20, 110, 70])
    expect(ap.content).toBe('/GS0 gs\n1 0 0 RG\n2 w\n11 21 98 48 re\nS')
    expect(ap.blendMultiply).toBe(false)
  })

  it('draws an ellipse with four Bezier segments', () => {
    const ap = buildAppearance({ ...base, type: 'ellipse', strokeWidth: 2, rect })
    expect(ap.content.match(/ c$/gm)).toHaveLength(4)
    expect(ap.content.endsWith('h\nS')).toBe(true)
  })

  it('draws underline along the bottom and strikeout through the middle of the screen frame', () => {
    const under = buildAppearance({ ...base, type: 'underline', strokeWidth: 2, rect })
    expect(under.content).toBe('/GS0 gs\n1 0 0 RG\n2 w\n1 0 0 1 10 20 cm\n0 1 m\n100 1 l\nS')
    const strike = buildAppearance({ ...base, type: 'strikeout', strokeWidth: 2, rect })
    expect(strike.content).toContain('0 25 m\n100 25 l')
  })

  it('rotates the underline frame on a rotated page', () => {
    const ap = buildAppearance({ ...base, pageRotation: 90, type: 'underline', strokeWidth: 2, rect })
    expect(ap.content).toContain('0 1 -1 0 110 20 cm\n0 1 m\n50 1 l')
  })

  it('pads a line bbox by the stroke width and grows it for an arrowhead', () => {
    const from = { x: 0, y: 0 }
    const to = { x: 100, y: 0 }
    const line = buildAppearance({ ...base, type: 'line', strokeWidth: 2, from, to })
    expect(line.bbox).toEqual([-2, -2, 102, 2])
    const arrow = buildAppearance({ ...base, type: 'arrow', strokeWidth: 2, from, to })
    expect(arrow.bbox[3] - arrow.bbox[1]).toBeGreaterThan(4)
  })

  it('draws a pen stroke as a polyline and a single point as a dot', () => {
    const pen = buildAppearance({ ...base, type: 'pen', strokeWidth: 3, points: [{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 10, y: 0 }] })
    expect(pen.content).toBe('/GS0 gs\n1 0 0 RG\n3 w\n1 J\n1 j\n0 0 m\n5 5 l\n10 0 l\nS')
    const dot = buildAppearance({ ...base, type: 'pen', strokeWidth: 3, points: [{ x: 4, y: 4 }] })
    expect(dot.content).toContain('4 4 m\n4 4 l')
  })

  it('lays text out in the screen frame and escapes the string', () => {
    const ap = buildAppearance({ ...base, pageRotation: 90, type: 'text', color: { r: 0, g: 0, b: 0 }, rect: { x: 100, y: 200, width: 50, height: 30 }, text: 'a(b)', fontSize: 10 })
    expect(ap.usesFont).toBe(true)
    expect(ap.content).toContain('0 1 -1 0 150 200 cm')
    expect(ap.content).toContain('/F1 10 Tf')
    expect(ap.content).toContain('(a\\(b\\)) Tj')
  })

  it('emits a valid stream for empty text', () => {
    const ap = buildAppearance({ ...base, type: 'text', rect, text: '', fontSize: 12 })
    expect(ap.content).not.toContain('Tj')
  })
})
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run src/shapes/appearance.test.ts`
Expected: FAIL, cannot find module `./appearance`.

- [ ] **Step 4: Implement appearance**

`src/shapes/appearance.ts`:
```ts
import { screenFrame } from '../coords/frame'
import type { Annotation, Point, Rect, Rgb } from '../model/types'
import { layoutTextBox, TEXT_PADDING } from '../text/layout'
import { toPdfLiteral } from '../text/winansi'
import { arrowHeadLength, arrowHeadPoints, boundsOfPoints, padBounds, type BBox } from './geometry'

export type { BBox }

export interface Appearance {
  bbox: BBox
  /** Page-content operators. Refers to graphics state /GS0 and, if usesFont, font /F1. */
  content: string
  opacity: number
  blendMultiply: boolean
  usesFont: boolean
}

const n = (v: number) => (Number.isFinite(v) ? String(Math.round(v * 10000) / 10000) : '0')
const rgb = (c: Rgb, stroke: boolean) => `${n(c.r)} ${n(c.g)} ${n(c.b)} ${stroke ? 'RG' : 'rg'}`
const rectBBox = (r: Rect): BBox => [r.x, r.y, r.x + r.width, r.y + r.height]
const pt = (p: Point) => `${n(p.x)} ${n(p.y)}`

const K = 0.5522847498

export function buildAppearance(a: Annotation): Appearance {
  const base = { opacity: a.opacity, blendMultiply: false, usesFont: false }
  switch (a.type) {
    case 'highlight': {
      const r = a.rect
      return {
        ...base, blendMultiply: true, bbox: rectBBox(r),
        content: ['/GS0 gs', rgb(a.color, false), `${n(r.x)} ${n(r.y)} ${n(r.width)} ${n(r.height)} re`, 'f'].join('\n'),
      }
    }
    case 'underline':
    case 'strikeout': {
      const f = screenFrame(a.rect, a.pageRotation)
      const v = a.type === 'underline' ? a.strokeWidth / 2 : f.height / 2
      return {
        ...base, bbox: rectBBox(a.rect),
        content: [
          '/GS0 gs', rgb(a.color, true), `${n(a.strokeWidth)} w`, `${f.matrix.map(n).join(' ')} cm`,
          `0 ${n(v)} m`, `${n(f.width)} ${n(v)} l`, 'S',
        ].join('\n'),
      }
    }
    case 'rectangle': {
      const { x, y, width, height } = a.rect
      const i = a.strokeWidth / 2
      return {
        ...base, bbox: rectBBox(a.rect),
        content: [
          '/GS0 gs', rgb(a.color, true), `${n(a.strokeWidth)} w`,
          `${n(x + i)} ${n(y + i)} ${n(Math.max(0, width - a.strokeWidth))} ${n(Math.max(0, height - a.strokeWidth))} re`, 'S',
        ].join('\n'),
      }
    }
    case 'ellipse': {
      const { x, y, width, height } = a.rect
      const cx = x + width / 2, cy = y + height / 2
      const rx = Math.max(0, (width - a.strokeWidth) / 2), ry = Math.max(0, (height - a.strokeWidth) / 2)
      const c = (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) =>
        `${n(x1)} ${n(y1)} ${n(x2)} ${n(y2)} ${n(x3)} ${n(y3)} c`
      return {
        ...base, bbox: rectBBox(a.rect),
        content: [
          '/GS0 gs', rgb(a.color, true), `${n(a.strokeWidth)} w`, `${n(cx + rx)} ${n(cy)} m`,
          c(cx + rx, cy + K * ry, cx + K * rx, cy + ry, cx, cy + ry),
          c(cx - K * rx, cy + ry, cx - rx, cy + K * ry, cx - rx, cy),
          c(cx - rx, cy - K * ry, cx - K * rx, cy - ry, cx, cy - ry),
          c(cx + K * rx, cy - ry, cx + rx, cy - K * ry, cx + rx, cy),
          'h', 'S',
        ].join('\n'),
      }
    }
    case 'line':
    case 'arrow': {
      const pts: Point[] = [a.from, a.to]
      const ops = ['/GS0 gs', rgb(a.color, true), `${n(a.strokeWidth)} w`, '1 J', '1 j', `${pt(a.from)} m`, `${pt(a.to)} l`, 'S']
      if (a.type === 'arrow') {
        const [p1, p2] = arrowHeadPoints(a.from, a.to, arrowHeadLength(a.strokeWidth))
        pts.push(p1, p2)
        ops.push(`${pt(p1)} m`, `${pt(a.to)} l`, `${pt(p2)} l`, 'S')
      }
      return { ...base, bbox: padBounds(boundsOfPoints(pts), a.strokeWidth), content: ops.join('\n') }
    }
    case 'pen': {
      const pts = a.points.length ? a.points : [{ x: 0, y: 0 }]
      const ops = ['/GS0 gs', rgb(a.color, true), `${n(a.strokeWidth)} w`, '1 J', '1 j', `${pt(pts[0])} m`]
      if (pts.length === 1) ops.push(`${pt(pts[0])} l`)
      for (const p of pts.slice(1)) ops.push(`${pt(p)} l`)
      ops.push('S')
      return { ...base, bbox: padBounds(boundsOfPoints(pts), a.strokeWidth), content: ops.join('\n') }
    }
    case 'text': {
      const f = screenFrame(a.rect, a.pageRotation)
      const { lines, baselines } = layoutTextBox(a.text, a.fontSize, f.width, f.height)
      const ops = ['/GS0 gs', `${f.matrix.map(n).join(' ')} cm`]
      if (lines.some((l) => l !== '')) {
        ops.push('BT', `/F1 ${n(a.fontSize)} Tf`, rgb(a.color, false))
        lines.forEach((line, i) => {
          if (line === '') return
          ops.push(`1 0 0 1 ${n(TEXT_PADDING)} ${n(f.height - baselines[i])} Tm`, `${toPdfLiteral(line)} Tj`)
        })
        ops.push('ET')
      }
      return { ...base, usesFont: true, bbox: rectBBox(a.rect), content: ops.join('\n') }
    }
  }
}
```

- [ ] **Step 5: Verify pass and commit**

Run: `npx vitest run`
Expected: all pass.

```bash
git add -A
git commit -m "feat(shapes): appearance-stream content for every annotation type" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: PDF export

**Files:**
- Create: `src/export/export-pdf.ts`
- Test: `src/export/export-pdf.test.ts`
- Modify: `docs/superpowers/specs/2026-10-09-pdf-annotator-design.md` (section 3, `pdf-export` signature)

**Interfaces:**
- Consumes: `buildAppearance` (Task 5), `screenFrame` (Task 3), `layoutTextBox`, `findUnsupportedChars`, `sanitizeText`, `loadHelvetica` (Task 4), `makePdf` fixture (Task 1).
- Produces: `ExportProblem = { annotationId: string; page: number; severity: 'warning' | 'error'; message: string }`; `ExportResult = { bytes: Uint8Array; problems: ExportProblem[] }`; `exportPdf(original: Uint8Array, annotations: readonly Annotation[]): Promise<ExportResult>`. Annotation subtypes: highlight→`/Highlight`, underline→`/Underline`, strikeout→`/StrikeOut`, rectangle→`/Square`, ellipse→`/Circle`, line and arrow→`/Line`, pen→`/Ink`, text→`/FreeText`.

- [ ] **Step 1: Write the failing tests**

`src/export/export-pdf.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { PDFDict, PDFDocument, PDFName, PDFRawStream, PDFString } from 'pdf-lib'
import { makePdf } from '../../tests/helpers/makePdf'
import type { Annotation } from '../model/types'
import { exportPdf } from './export-pdf'

const base = { page: 0, pageRotation: 0 as const, color: { r: 1, g: 0, b: 0 }, opacity: 0.5 }
const rect = { x: 10, y: 20, width: 100, height: 50 }

async function readAnnots(bytes: Uint8Array, pageIndex = 0) {
  const doc = await PDFDocument.load(bytes)
  const arr = doc.getPage(pageIndex).node.Annots()
  const dicts = (arr?.asArray() ?? []).map((ref) => doc.context.lookup(ref, PDFDict))
  return { doc, dicts }
}
const subtype = (d: PDFDict) => (d.get(PDFName.of('Subtype')) as PDFName).decodeText()
const nm = (d: PDFDict) => d.lookup(PDFName.of('NM'), PDFString).decodeText()
function apText(d: PDFDict): string {
  const ap = d.lookup(PDFName.of('AP'), PDFDict)
  const stream = ap.lookup(PDFName.of('N'), PDFRawStream)
  return new TextDecoder().decode(stream.getContents())
}

const one = (a: Annotation) => [a]

describe('exportPdf', () => {
  it('writes a native annotation with an appearance stream for each type', async () => {
    const source = await makePdf([{ width: 612, height: 792 }])
    const annotations: Annotation[] = [
      { ...base, id: 'h', type: 'highlight', rect },
      { ...base, id: 'u', type: 'underline', strokeWidth: 2, rect },
      { ...base, id: 's', type: 'strikeout', strokeWidth: 2, rect },
      { ...base, id: 'r', type: 'rectangle', strokeWidth: 2, rect },
      { ...base, id: 'e', type: 'ellipse', strokeWidth: 2, rect },
      { ...base, id: 'l', type: 'line', strokeWidth: 2, from: { x: 0, y: 0 }, to: { x: 50, y: 50 } },
      { ...base, id: 'a', type: 'arrow', strokeWidth: 2, from: { x: 0, y: 0 }, to: { x: 50, y: 50 } },
      { ...base, id: 'p', type: 'pen', strokeWidth: 2, points: [{ x: 1, y: 1 }, { x: 9, y: 9 }] },
      { ...base, id: 't', type: 'text', rect, text: 'Hello', fontSize: 12 },
    ]
    const { bytes, problems } = await exportPdf(source, annotations)
    expect(problems).toEqual([])
    const { dicts } = await readAnnots(bytes)
    expect(dicts.map(subtype)).toEqual([
      'Highlight', 'Underline', 'StrikeOut', 'Square', 'Circle', 'Line', 'Line', 'Ink', 'FreeText',
    ])
    expect(dicts.map(nm)).toEqual(['h', 'u', 's', 'r', 'e', 'l', 'a', 'p', 't'])
    for (const d of dicts) expect(apText(d).length).toBeGreaterThan(0)
  })

  it('writes type-specific fields', async () => {
    const source = await makePdf([{ width: 612, height: 792 }])
    const { bytes } = await exportPdf(source, [
      { ...base, id: 'h', type: 'highlight', rect },
      { ...base, id: 't', type: 'text', rect, text: 'Hi', fontSize: 12 },
    ])
    const { dicts } = await readAnnots(bytes)
    const quad = dicts[0].lookup(PDFName.of('QuadPoints')).toString()
    expect(quad).toBe('[ 10 70 110 70 10 20 110 20 ]')
    expect(dicts[1].has(PDFName.of('DA'))).toBe(true)
    expect(dicts[1].has(PDFName.of('C'))).toBe(false)
  })

  it('puts a multiply blend in the highlight appearance resources', async () => {
    const source = await makePdf([{ width: 612, height: 792 }])
    const { bytes } = await exportPdf(source, one({ ...base, id: 'h', type: 'highlight', rect }))
    const { dicts } = await readAnnots(bytes)
    const stream = dicts[0].lookup(PDFName.of('AP'), PDFDict).lookup(PDFName.of('N'), PDFRawStream)
    expect(stream.dict.toString()).toContain('/BM /Multiply')
  })

  it('places each annotation on its own page', async () => {
    const source = await makePdf([{ width: 612, height: 792 }, { width: 612, height: 792 }])
    const { bytes } = await exportPdf(source, one({ ...base, id: 'x', page: 1, type: 'highlight', rect }))
    expect((await readAnnots(bytes, 0)).dicts).toHaveLength(0)
    expect((await readAnnots(bytes, 1)).dicts).toHaveLength(1)
  })

  it('never modifies the original bytes', async () => {
    const source = await makePdf([{ width: 612, height: 792 }])
    const copy = source.slice()
    await exportPdf(source, one({ ...base, id: 'h', type: 'highlight', rect }))
    expect(source).toEqual(copy)
  })

  it('keeps existing annotations, including those from a previous export', async () => {
    const source = await makePdf([{ width: 612, height: 792 }])
    const first = await exportPdf(source, one({ ...base, id: 'a', type: 'highlight', rect }))
    const second = await exportPdf(first.bytes, one({ ...base, id: 'b', type: 'rectangle', strokeWidth: 2, rect }))
    const { dicts } = await readAnnots(second.bytes)
    expect(dicts.map(nm)).toEqual(['a', 'b'])
  })

  it('reports an error for a bad page but still writes the others', async () => {
    const source = await makePdf([{ width: 612, height: 792 }])
    const { bytes, problems } = await exportPdf(source, [
      { ...base, id: 'bad', page: 5, type: 'highlight', rect },
      { ...base, id: 'ok', type: 'highlight', rect },
    ])
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatchObject({ annotationId: 'bad', severity: 'error' })
    expect((await readAnnots(bytes)).dicts.map(nm)).toEqual(['ok'])
  })

  it('warns about unsupported characters and clipped text, but still exports', async () => {
    const source = await makePdf([{ width: 612, height: 792 }])
    const { bytes, problems } = await exportPdf(source, [
      { ...base, id: 'emoji', type: 'text', rect, text: 'Hi 😀', fontSize: 12 },
      { ...base, id: 'long', type: 'text', rect: { x: 0, y: 0, width: 60, height: 20 }, text: 'one two three four five six seven', fontSize: 12 },
    ])
    expect(problems.map((p) => [p.annotationId, p.severity])).toEqual([['emoji', 'warning'], ['long', 'warning']])
    expect(problems[0].message).toContain('😀')
    expect((await readAnnots(bytes)).dicts).toHaveLength(2)
  })

  it('keeps text upright on a rotated page', async () => {
    const source = await makePdf([{ width: 612, height: 792, rotate: 90 }])
    const { bytes } = await exportPdf(source, one({ ...base, id: 't', pageRotation: 90, type: 'text', rect: { x: 100, y: 200, width: 50, height: 30 }, text: 'Hi', fontSize: 10 }))
    const { dicts } = await readAnnots(bytes)
    expect(apText(dicts[0])).toContain('0 1 -1 0 150 200 cm')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/export/export-pdf.test.ts`
Expected: FAIL, cannot find module `./export-pdf`.

- [ ] **Step 3: Implement export**

`src/export/export-pdf.ts`:
```ts
import { PDFDocument, PDFHexString, PDFPage, PDFRef, PDFString, StandardFonts } from 'pdf-lib'
import { screenFrame } from '../coords/frame'
import type { Annotation } from '../model/types'
import { buildAppearance } from '../shapes/appearance'
import { loadHelvetica } from '../text/helvetica'
import { layoutTextBox } from '../text/layout'
import { findUnsupportedChars, sanitizeText } from '../text/winansi'

export interface ExportProblem {
  annotationId: string
  /** zero-based page index */
  page: number
  severity: 'warning' | 'error'
  message: string
}

export interface ExportResult {
  bytes: Uint8Array
  problems: ExportProblem[]
}

const SUBTYPES = {
  highlight: 'Highlight', underline: 'Underline', strikeout: 'StrikeOut', rectangle: 'Square',
  ellipse: 'Circle', line: 'Line', arrow: 'Line', pen: 'Ink', text: 'FreeText',
} as const

/** Never mutates `original`. Per-annotation failures are reported in `problems`; the rest are still written. */
export async function exportPdf(original: Uint8Array, annotations: readonly Annotation[]): Promise<ExportResult> {
  await loadHelvetica()
  const doc = await PDFDocument.load(original)
  const pages = doc.getPages()
  const problems: ExportProblem[] = []
  const font = annotations.some((a) => a.type === 'text') ? await doc.embedFont(StandardFonts.Helvetica) : null
  const getFontRef = (): PDFRef => {
    if (!font) throw new Error('Helvetica was not embedded')
    return font.ref
  }

  for (const ann of annotations) {
    try {
      const page = pages[ann.page]
      if (!page) throw new Error(`Page ${ann.page + 1} does not exist in this document.`)
      problems.push(...textProblems(ann))
      addAnnotation(doc, page, ann, getFontRef)
    } catch (e) {
      problems.push({
        annotationId: ann.id, page: ann.page, severity: 'error',
        message: e instanceof Error ? e.message : 'Could not be exported.',
      })
    }
  }
  return { bytes: await doc.save(), problems }
}

function textProblems(a: Annotation): ExportProblem[] {
  if (a.type !== 'text') return []
  const out: ExportProblem[] = []
  const bad = findUnsupportedChars(a.text)
  if (bad.length) {
    out.push({
      annotationId: a.id, page: a.page, severity: 'warning',
      message: `Characters Helvetica cannot show were replaced with "?": ${bad.join(' ')}`,
    })
  }
  const f = screenFrame(a.rect, a.pageRotation)
  if (layoutTextBox(a.text, a.fontSize, f.width, f.height).overflows) {
    out.push({ annotationId: a.id, page: a.page, severity: 'warning', message: 'Text does not fit in its box and is clipped.' })
  }
  return out
}

function addAnnotation(doc: PDFDocument, page: PDFPage, a: Annotation, getFontRef: () => PDFRef) {
  const ctx = doc.context
  const ap = buildAppearance(a)

  const gs: Record<string, unknown> = { Type: 'ExtGState', CA: ap.opacity, ca: ap.opacity }
  if (ap.blendMultiply) gs.BM = 'Multiply'
  const resources = ctx.obj({
    ExtGState: { GS0: gs },
    ...(ap.usesFont ? { Font: { F1: getFontRef() } } : {}),
  })
  const stream = ctx.stream(ap.content, { Type: 'XObject', Subtype: 'Form', BBox: ap.bbox, Resources: resources })
  const apRef = ctx.register(stream)

  const dict = ctx.obj({
    Type: 'Annot',
    Subtype: SUBTYPES[a.type],
    Rect: ap.bbox,
    F: 4,
    NM: PDFString.of(a.id),
    CA: a.opacity,
    AP: { N: apRef },
    ...typeFields(a),
  })
  page.node.addAnnot(ctx.register(dict))
}

function typeFields(a: Annotation): Record<string, unknown> {
  const color = [a.color.r, a.color.g, a.color.b]
  switch (a.type) {
    case 'highlight':
    case 'underline':
    case 'strikeout': {
      const { x, y, width, height } = a.rect
      // Top-left, top-right, bottom-left, bottom-right: the order Acrobat and Preview expect.
      return { C: color, QuadPoints: [x, y + height, x + width, y + height, x, y, x + width, y] }
    }
    case 'rectangle':
    case 'ellipse':
      return { C: color, BS: { W: a.strokeWidth, S: 'S' } }
    case 'line':
    case 'arrow':
      return {
        C: color,
        L: [a.from.x, a.from.y, a.to.x, a.to.y],
        LE: ['None', a.type === 'arrow' ? 'OpenArrow' : 'None'],
        BS: { W: a.strokeWidth, S: 'S' },
      }
    case 'pen':
      return { C: color, InkList: [a.points.flatMap((p) => [p.x, p.y])], BS: { W: a.strokeWidth, S: 'S' } }
    case 'text':
      // No /C: in FreeText it means background fill, and we do not want a fill.
      return {
        Contents: PDFHexString.fromText(sanitizeText(a.text)),
        DA: PDFString.of(`/Helv ${a.fontSize} Tf ${a.color.r} ${a.color.g} ${a.color.b} rg`),
        Q: 0,
      }
  }
}
```

- [ ] **Step 4: Verify pass**

Run: `npx vitest run src/export/export-pdf.test.ts`
Expected: all pass. If a pdf-lib API name differs in the installed version (for example `PDFRawStream.getContents`, `PDFName.decodeText`, `node.Annots()`), adjust the test helper or call to the installed version's equivalent without changing what is asserted.

- [ ] **Step 5: Refine the spec signature**

In `docs/superpowers/specs/2026-10-09-pdf-annotator-design.md` section 3, change the `pdf-export` bullet's signature from `exportPdf(originalBytes, annotations) -> Uint8Array` to `exportPdf(originalBytes, annotations) -> { bytes: Uint8Array; problems: ExportProblem[] }`, so the documented interface matches section 6 (per-annotation failures are reported).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(export): native annotations with appearance streams via pdf-lib" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Open a PDF and render pages

**Files:**
- Create: `src/render/pdf-document.ts`, `src/ui/open-file.ts`, `src/ui/UploadScreen.tsx`, `src/ui/PageView.tsx`, `src/ui/Editor.tsx`, `src/ui/zoom.ts`, `playwright.config.ts`, `e2e/helpers.ts`, `e2e/smoke.spec.ts`
- Modify: `src/App.tsx`, `src/styles.css`
- Test: `src/render/pdf-document.test.ts`, `src/ui/zoom.test.ts`, `e2e/smoke.spec.ts`

**Interfaces:**
- Consumes: `PageGeometry`, `normalizeRotation`, `viewportSize` (Task 3); `loadHelvetica` (Task 4); `makePdf` (Task 1).
- Produces:
  - `PdfLoadError extends Error { kind: 'password' | 'invalid' | 'unknown' }`, `toLoadError(e: unknown): PdfLoadError`, `openPdf(bytes: Uint8Array): Promise<PdfDocumentHandle>`.
  - `PdfDocumentHandle = { pageCount: number; pages: PdfPageHandle[]; destroy(): void }`; `PdfPageHandle = { index: number; geometry: PageGeometry; render(canvas, scale): { promise: Promise<void>; cancel(): void } }`.
  - `OpenFile = { id: string; name: string; bytes: Uint8Array; doc: PdfDocumentHandle }`.
  - `nextZoom(current: number, direction: 1 | -1): number`.
  - `<PageView page scale>{children}</PageView>`: a sized, lazily rendered page; children are positioned over it.
  - Test ids: `upload-input`, `page-{i}`, `page-canvas-{i}`, `zoom-in`, `zoom-out`, `fit-width`; error text in an element with `role="alert"`.

- [ ] **Step 1: Write the failing unit tests**

`src/render/pdf-document.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { PdfLoadError, toLoadError } from './pdf-document'

describe('toLoadError', () => {
  it('maps a pdf.js password exception', () => {
    const e = toLoadError(Object.assign(new Error('No password given'), { name: 'PasswordException' }))
    expect(e).toBeInstanceOf(PdfLoadError)
    expect(e.kind).toBe('password')
    expect(e.message).toMatch(/password/i)
  })

  it('maps invalid, format and missing exceptions to "not a valid PDF"', () => {
    for (const name of ['InvalidPDFException', 'FormatError', 'MissingPDFException']) {
      const e = toLoadError(Object.assign(new Error('x'), { name }))
      expect(e.kind).toBe('invalid')
      expect(e.message).toMatch(/valid PDF/)
    }
  })

  it('falls back to a generic message', () => {
    const e = toLoadError(new Error('boom'))
    expect(e.kind).toBe('unknown')
  })
})
```

`src/ui/zoom.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { nextZoom } from './zoom'

describe('nextZoom', () => {
  it('steps through the preset levels', () => {
    expect(nextZoom(1, 1)).toBe(1.25)
    expect(nextZoom(1, -1)).toBe(0.75)
  })
  it('clamps at the ends', () => {
    expect(nextZoom(3, 1)).toBe(3)
    expect(nextZoom(0.5, -1)).toBe(0.5)
  })
  it('moves to the next preset from an arbitrary fit-to-width value', () => {
    expect(nextZoom(1.1, 1)).toBe(1.25)
    expect(nextZoom(1.1, -1)).toBe(1)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/render src/ui/zoom.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement pdf-document and zoom**

`src/render/pdf-document.ts`:
```ts
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
  let doc: pdfjs.PDFDocumentProxy
  try {
    // pdf.js transfers the buffer to its worker, so hand it a copy.
    doc = await pdfjs.getDocument({ data: bytes.slice() }).promise
  } catch (e) {
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
  return { pageCount: doc.numPages, pages, destroy: () => void doc.destroy() }
}
```

`src/ui/zoom.ts`:
```ts
const LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3]

export function nextZoom(current: number, direction: 1 | -1): number {
  if (direction === 1) return LEVELS.find((z) => z > current + 1e-9) ?? LEVELS[LEVELS.length - 1]
  return [...LEVELS].reverse().find((z) => z < current - 1e-9) ?? LEVELS[0]
}
```

`src/ui/open-file.ts`:
```ts
import type { PdfDocumentHandle } from '../render/pdf-document'

export interface OpenFile {
  id: string
  name: string
  /** The untouched uploaded bytes; export always starts from these. */
  bytes: Uint8Array
  doc: PdfDocumentHandle
}
```

- [ ] **Step 4: Verify unit tests pass**

Run: `npx vitest run`
Expected: all pass.

- [ ] **Step 5: Implement the UI**

`src/ui/UploadScreen.tsx`:
```tsx
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
```

`src/ui/PageView.tsx`:
```tsx
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
```

`src/ui/Editor.tsx` (viewing only for now; Task 8 extends it):
```tsx
import { useRef, useState } from 'react'
import { viewportSize } from '../coords/page-space'
import type { OpenFile } from './open-file'
import { PageView } from './PageView'
import { nextZoom } from './zoom'

export function Editor({ file, onClose }: { file: OpenFile; onClose: () => void }) {
  const [scale, setScale] = useState(1)
  const pagesRef = useRef<HTMLDivElement>(null)

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
      <div className="pages" ref={pagesRef}>
        {file.doc.pages.map((p) => (
          <PageView key={p.index} page={p} scale={scale} />
        ))}
      </div>
    </div>
  )
}
```

`src/App.tsx`:
```tsx
import { useEffect, useState } from 'react'
import { loadHelvetica } from './text/helvetica'
import { Editor } from './ui/Editor'
import type { OpenFile } from './ui/open-file'
import { UploadScreen } from './ui/UploadScreen'

export function App() {
  const [file, setFile] = useState<OpenFile | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    void loadHelvetica().then(() => setReady(true))
  }, [])

  if (!ready) return null
  return file ? (
    <Editor
      key={file.id}
      file={file}
      onClose={() => {
        file.doc.destroy()
        setFile(null)
      }}
    />
  ) : (
    <UploadScreen onOpen={setFile} />
  )
}
```

Replace `src/styles.css` with:
```css
html, body, #root { height: 100%; margin: 0; }
body { font-family: system-ui, sans-serif; background: #e9ecef; color: #212529; }
.button { display: inline-flex; align-items: center; gap: 4px; padding: 6px 12px; border: 1px solid #adb5bd; border-radius: 6px; background: #fff; cursor: pointer; font: inherit; }
.button[aria-pressed='true'] { background: #dbe9ff; border-color: #2f7de1; }
.button:disabled { opacity: 0.4; cursor: default; }
.button.primary { background: #2f7de1; border-color: #2f7de1; color: #fff; }
.upload { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; text-align: center; padding: 0 16px; }
.hint { color: #6c757d; font-size: 14px; }
.error { color: #c92a2a; }
.editor { height: 100%; display: flex; flex-direction: column; }
.topbar { display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: #fff; border-bottom: 1px solid #ced4da; flex-wrap: wrap; }
.topbar .spacer { flex: 1; }
.filename { max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.zoom { display: flex; align-items: center; gap: 6px; }
.workspace { flex: 1; display: flex; min-height: 0; }
.pages { flex: 1; overflow: auto; padding: 16px 0; }
.page { position: relative; margin: 0 auto 16px; background: #fff; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3); }
.page canvas { display: block; }
```

- [ ] **Step 6: Write the Playwright config and helpers**

`playwright.config.ts`:
```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  webServer: { command: 'npm run dev -- --port 5173 --strictPort', url: 'http://localhost:5173', reuseExistingServer: true },
  use: { baseURL: 'http://localhost:5173', viewport: { width: 1280, height: 900 } },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
```

`e2e/helpers.ts`:
```ts
import { expect, type Page } from '@playwright/test'

export async function uploadFile(page: Page, name: string, bytes: Uint8Array | Buffer) {
  await page.goto('/')
  await page.getByTestId('upload-input').setInputFiles({ name, mimeType: 'application/pdf', buffer: Buffer.from(bytes) })
}

export async function openPdfInApp(page: Page, bytes: Uint8Array, name = 'sample.pdf') {
  await uploadFile(page, name, bytes)
  await expect(page.getByTestId('page-canvas-0')).toBeVisible()
  await expect.poll(() => canvasWidth(page, 0)).toBeGreaterThan(0)
}

export function canvasWidth(page: Page, index: number) {
  return page.evaluate(
    (i) => document.querySelector<HTMLCanvasElement>(`[data-testid="page-canvas-${i}"]`)?.width ?? 0,
    index,
  )
}

export function renderedCanvasCount(page: Page) {
  return page.evaluate(() => [...document.querySelectorAll('canvas')].filter((c) => c.width > 0).length)
}
```

- [ ] **Step 7: Write the end-to-end smoke tests**

`e2e/smoke.spec.ts`:
```ts
import { expect, test } from '@playwright/test'
import { makePdf } from '../tests/helpers/makePdf'
import { openPdfInApp, renderedCanvasCount, uploadFile } from './helpers'

test('opens a PDF and renders its pages', async ({ page }) => {
  await openPdfInApp(page, await makePdf([{ width: 612, height: 792 }, { width: 612, height: 792 }]))
  await expect(page.getByTestId('page-1')).toBeVisible()
})

test('zoom changes the page size', async ({ page }) => {
  await openPdfInApp(page, await makePdf([{ width: 612, height: 792 }]))
  const before = (await page.getByTestId('page-0').boundingBox())!.width
  await page.getByTestId('zoom-in').click()
  await expect.poll(async () => (await page.getByTestId('page-0').boundingBox())!.width).toBeGreaterThan(before)
})

test('renders only pages near the viewport in a long document', async ({ page }) => {
  const pdf = await makePdf(Array.from({ length: 120 }, () => ({ width: 612, height: 792 })))
  await openPdfInApp(page, pdf)
  expect(await renderedCanvasCount(page)).toBeLessThan(12)
})

test.describe('bad uploads', () => {
  test('rejects a file that is not a PDF', async ({ page }) => {
    await uploadFile(page, 'notes.pdf', Buffer.from('hello, I am not a pdf'))
    await expect(page.getByRole('alert')).toContainText('valid PDF')
    await expect(page.getByTestId('upload-input')).toBeAttached()
  })

  test('rejects an empty file', async ({ page }) => {
    await uploadFile(page, 'empty.pdf', Buffer.alloc(0))
    await expect(page.getByRole('alert')).toContainText('valid PDF')
  })
})
```

- [ ] **Step 8: Run end-to-end tests**

Run: `npm run test:e2e`
Expected: all pass. If pdf.js reports a different exception name for the empty file, add that name to `toLoadError`'s "invalid" branch and add it to the unit test's list.

- [ ] **Step 9: Verify build and commit**

Run: `npm run build`
Expected: success.

```bash
git add -A
git commit -m "feat(render): open a PDF, render lazily with zoom, and reject bad files" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Overlay and drawing tools

**Files:**
- Create: `src/ui/color.ts`, `src/ui/tools.ts`, `src/ui/useStoreState.ts`, `src/ui/AnnotationView.tsx`, `src/ui/TextEditor.tsx`, `src/ui/Overlay.tsx`, `src/ui/Toolbar.tsx`, `e2e/tools.spec.ts`
- Modify: `src/ui/Editor.tsx`, `src/styles.css`
- Test: `src/ui/color.test.ts`, `src/ui/tools.test.ts`

**Interfaces:**
- Consumes: store (Task 2), coords (Task 3), `layoutTextBox`/`TEXT_PADDING`/`LINE_HEIGHT` (Task 4), `arrowHeadLength`/`arrowHeadPoints` (Task 5), `PageView`, `OpenFile` (Task 7).
- Produces:
  - `css(c: Rgb): string`, `rgbToHex(c): string`, `hexToRgb(hex): Rgb`, `SWATCHES: string[]`.
  - `Tool = 'select' | DrawTool`, `DrawTool = AnnotationType`; `StyleDefaults = { color: Rgb; opacity: number; strokeWidth: number; fontSize: number }`; `ToolStyles = Record<DrawTool, StyleDefaults>`; `DEFAULT_STYLES: ToolStyles`; `MIN_DRAG_PX = 4`; `DEFAULT_TEXT_SIZE = { width: 160, height: 48 }` (points).
  - `Draft = { tool: DrawTool; start: Point; current: Point; points: Point[] }` in **viewport pixels**; `beginDraft(tool, p): Draft`; `extendDraft(d, p): Draft`; `draftToAnnotation(d, style, id, page, geometry, scale): Annotation | null`.
  - `useStoreState(store): StoreState`.
  - `<AnnotationView annotation geometry scale hidden? />`, `<TextEditor annotation geometry scale onCommit onCancel />`, `<Overlay pageIndex geometry scale tool styles store />`, `<Toolbar tool onTool />`.
  - Test ids: `tool-{type|select}`, `page-overlay-{i}`, `annotation-{type}`, `text-editor`.

- [ ] **Step 1: Write the failing color and tool tests**

`src/ui/color.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { css, hexToRgb, rgbToHex } from './color'

describe('color', () => {
  it('round-trips hex', () => {
    expect(rgbToHex(hexToRgb('#e53935'))).toBe('#e53935')
  })
  it('formats CSS rgb()', () => {
    expect(css({ r: 1, g: 0, b: 0.5 })).toBe('rgb(255, 0, 128)')
  })
})
```

`src/ui/tools.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import type { PageGeometry } from '../coords/page-space'
import { beginDraft, DEFAULT_STYLES, draftToAnnotation, extendDraft } from './tools'

const g0: PageGeometry = { view: [0, 0, 612, 792], rotate: 0 }
const g90: PageGeometry = { view: [0, 0, 612, 792], rotate: 90 }
const make = (tool: Parameters<typeof beginDraft>[0], a: [number, number], b: [number, number], g = g0, scale = 1) => {
  let d = beginDraft(tool, { x: a[0], y: a[1] })
  d = extendDraft(d, { x: b[0], y: b[1] })
  return draftToAnnotation(d, DEFAULT_STYLES[tool], 'id1', 0, g, scale)
}

describe('draftToAnnotation', () => {
  it('converts a dragged rectangle to a normalized user-space rect', () => {
    const a = make('rectangle', [100, 100], [200, 150])
    expect(a).toMatchObject({ type: 'rectangle', page: 0, pageRotation: 0, rect: { x: 100, y: 642, width: 100, height: 50 } })
  })

  it('normalizes a drag made up and to the left', () => {
    const a = make('highlight', [200, 150], [100, 100])
    expect(a).toMatchObject({ rect: { x: 100, y: 642, width: 100, height: 50 } })
  })

  it('uses the page rotation when converting and records it on the annotation', () => {
    const a = make('rectangle', [100, 100], [200, 150], g90)
    expect(a).toMatchObject({ pageRotation: 90, rect: { x: 100, y: 100, width: 50, height: 100 } })
  })

  it('divides by the zoom scale', () => {
    const a = make('rectangle', [200, 200], [400, 300], g0, 2)
    expect(a).toMatchObject({ rect: { x: 100, y: 642, width: 100, height: 50 } })
  })

  it('ignores a click without a drag, and drags that are too flat or narrow', () => {
    expect(make('rectangle', [50, 50], [51, 51])).toBeNull()
    expect(make('highlight', [50, 50], [200, 51])).toBeNull()
    expect(make('ellipse', [50, 50], [52, 300])).toBeNull()
    expect(make('line', [50, 50], [51, 50])).toBeNull()
  })

  it('creates lines and arrows from the two end points', () => {
    expect(make('arrow', [10, 10], [110, 10])).toMatchObject({ type: 'arrow', from: { x: 10, y: 782 }, to: { x: 110, y: 782 } })
  })

  it('drops pen points closer than 1.5px and needs at least two points', () => {
    let d = beginDraft('pen', { x: 10, y: 10 })
    d = extendDraft(d, { x: 10.5, y: 10 })
    expect(draftToAnnotation(d, DEFAULT_STYLES.pen, 'p', 0, g0, 1)).toBeNull()
    d = extendDraft(d, { x: 20, y: 10 })
    d = extendDraft(d, { x: 30, y: 10 })
    const a = draftToAnnotation(d, DEFAULT_STYLES.pen, 'p', 0, g0, 1)
    expect(a).toMatchObject({ type: 'pen', points: [{ x: 10, y: 782 }, { x: 20, y: 782 }, { x: 30, y: 782 }] })
  })

  it('creates a default-size text box from a click and a sized one from a drag', () => {
    expect(make('text', [50, 60], [50, 60])).toMatchObject({ type: 'text', text: '', rect: { x: 50, y: 684, width: 160, height: 48 } })
    expect(make('text', [50, 60], [250, 160])).toMatchObject({ rect: { x: 50, y: 632, width: 200, height: 100 } })
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/ui`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement color and tools**

`src/ui/color.ts`:
```ts
import type { Rgb } from '../model/types'

export const SWATCHES = ['#ffe600', '#ff8a00', '#e53935', '#d81b60', '#8e24aa', '#1e88e5', '#43a047', '#000000']

export const css = (c: Rgb): string => `rgb(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)})`

export function rgbToHex(c: Rgb): string {
  const h = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0')
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`
}

export function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.replace('#', ''), 16)
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 }
}
```

`src/ui/tools.ts`:
```ts
import {
  viewportRectToUser, viewportToUser, type PageGeometry,
} from '../coords/page-space'
import type { Annotation, AnnotationType, Point, Rect, Rgb } from '../model/types'

export type DrawTool = AnnotationType
export type Tool = 'select' | DrawTool

export interface StyleDefaults { color: Rgb; opacity: number; strokeWidth: number; fontSize: number }
export type ToolStyles = Record<DrawTool, StyleDefaults>

const RED: Rgb = { r: 0.85, g: 0.1, b: 0.1 }
const stroke = (color: Rgb, strokeWidth = 2): StyleDefaults => ({ color, opacity: 1, strokeWidth, fontSize: 14 })

export const DEFAULT_STYLES: ToolStyles = {
  highlight: { color: { r: 1, g: 0.92, b: 0 }, opacity: 0.5, strokeWidth: 0, fontSize: 14 },
  underline: stroke(RED),
  strikeout: stroke(RED),
  rectangle: stroke(RED),
  ellipse: stroke(RED),
  line: stroke(RED),
  arrow: stroke(RED),
  pen: stroke(RED, 2.5),
  text: { color: { r: 0, g: 0, b: 0 }, opacity: 1, strokeWidth: 0, fontSize: 14 },
}

export const MIN_DRAG_PX = 4
export const DEFAULT_TEXT_SIZE = { width: 160, height: 48 }

/** A gesture in progress. All coordinates are viewport pixels (top-left origin). */
export interface Draft { tool: DrawTool; start: Point; current: Point; points: Point[] }

export const beginDraft = (tool: DrawTool, p: Point): Draft => ({ tool, start: p, current: p, points: [p] })

export function extendDraft(d: Draft, p: Point): Draft {
  if (d.tool !== 'pen') return { ...d, current: p }
  const last = d.points[d.points.length - 1]
  const far = Math.hypot(p.x - last.x, p.y - last.y) >= 1.5
  return { ...d, current: p, points: far ? [...d.points, p] : d.points }
}

function normalizedRect(a: Point, b: Point): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) }
}

export function draftToAnnotation(
  d: Draft, style: StyleDefaults, id: string, page: number, g: PageGeometry, scale: number,
): Annotation | null {
  const base = { id, page, pageRotation: g.rotate, color: style.color, opacity: style.opacity }
  const dx = Math.abs(d.current.x - d.start.x)
  const dy = Math.abs(d.current.y - d.start.y)
  const toUser = (p: Point) => viewportToUser(g, scale, p)

  switch (d.tool) {
    case 'text': {
      const dragged = dx >= MIN_DRAG_PX && dy >= MIN_DRAG_PX
      const box = dragged
        ? normalizedRect(d.start, d.current)
        : { x: d.start.x, y: d.start.y, width: DEFAULT_TEXT_SIZE.width * scale, height: DEFAULT_TEXT_SIZE.height * scale }
      return { ...base, type: 'text', rect: viewportRectToUser(g, scale, box), text: '', fontSize: style.fontSize }
    }
    case 'pen':
      if (d.points.length < 2) return null
      return { ...base, type: 'pen', points: d.points.map(toUser), strokeWidth: style.strokeWidth }
    case 'line':
    case 'arrow':
      if (Math.hypot(dx, dy) < MIN_DRAG_PX) return null
      return { ...base, type: d.tool, from: toUser(d.start), to: toUser(d.current), strokeWidth: style.strokeWidth }
    case 'highlight':
    case 'underline':
    case 'strikeout':
    case 'rectangle':
    case 'ellipse': {
      if (dx < MIN_DRAG_PX || dy < MIN_DRAG_PX) return null
      const rect = viewportRectToUser(g, scale, normalizedRect(d.start, d.current))
      return d.tool === 'highlight'
        ? { ...base, type: 'highlight', rect }
        : { ...base, type: d.tool, rect, strokeWidth: style.strokeWidth }
    }
  }
}
```

- [ ] **Step 4: Verify pass**

Run: `npx vitest run src/ui`
Expected: all pass.

- [ ] **Step 5: Implement the store hook and annotation rendering**

`src/ui/useStoreState.ts`:
```ts
import { useSyncExternalStore } from 'react'
import type { AnnotationStore, StoreState } from '../model/store'

export function useStoreState(store: AnnotationStore): StoreState {
  return useSyncExternalStore(store.subscribe, store.getState)
}
```

`src/ui/AnnotationView.tsx`:
```tsx
import type { ReactNode } from 'react'
import { rectToViewport, userToViewport, type PageGeometry } from '../coords/page-space'
import type { Annotation, Rect } from '../model/types'
import { arrowHeadLength, arrowHeadPoints } from '../shapes/geometry'
import { layoutTextBox, TEXT_PADDING } from '../text/layout'
import { css } from './color'

interface Props { annotation: Annotation; geometry: PageGeometry; scale: number; hidden?: boolean }

export function AnnotationView({ annotation, geometry, scale, hidden }: Props) {
  if (hidden) return null
  return (
    <g data-annotation-id={annotation.id} data-testid={`annotation-${annotation.type}`}>
      {renderBody(annotation, geometry, scale)}
    </g>
  )
}

function renderBody(a: Annotation, g: PageGeometry, s: number): ReactNode {
  const color = css(a.color)
  const vp = (r: Rect) => rectToViewport(g, s, r)
  const toV = (p: { x: number; y: number }) => userToViewport(g, s, p)

  switch (a.type) {
    case 'highlight': {
      const r = vp(a.rect)
      return <rect {...r} fill={color} fillOpacity={a.opacity} style={{ mixBlendMode: 'multiply' }} />
    }
    case 'underline':
    case 'strikeout': {
      const r = vp(a.rect)
      const sw = a.strokeWidth * s
      const y = a.type === 'underline' ? r.y + r.height - sw / 2 : r.y + r.height / 2
      return <line x1={r.x} x2={r.x + r.width} y1={y} y2={y} stroke={color} strokeWidth={sw} strokeOpacity={a.opacity} />
    }
    case 'rectangle': {
      const r = vp(a.rect)
      const sw = a.strokeWidth * s
      return (
        <rect
          x={r.x + sw / 2} y={r.y + sw / 2}
          width={Math.max(0, r.width - sw)} height={Math.max(0, r.height - sw)}
          fill="none" stroke={color} strokeWidth={sw} strokeOpacity={a.opacity}
        />
      )
    }
    case 'ellipse': {
      const r = vp(a.rect)
      const sw = a.strokeWidth * s
      return (
        <ellipse
          cx={r.x + r.width / 2} cy={r.y + r.height / 2}
          rx={Math.max(0, (r.width - sw) / 2)} ry={Math.max(0, (r.height - sw) / 2)}
          fill="none" stroke={color} strokeWidth={sw} strokeOpacity={a.opacity}
        />
      )
    }
    case 'line':
    case 'arrow': {
      const from = toV(a.from)
      const to = toV(a.to)
      const sw = a.strokeWidth * s
      const [p1, p2] = arrowHeadPoints(from, to, arrowHeadLength(a.strokeWidth) * s)
      return (
        <g fill="none" stroke={color} strokeWidth={sw} strokeOpacity={a.opacity} strokeLinecap="round" strokeLinejoin="round">
          <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} />
          {a.type === 'arrow' && <polyline points={`${p1.x},${p1.y} ${to.x},${to.y} ${p2.x},${p2.y}`} />}
        </g>
      )
    }
    case 'pen':
      return (
        <polyline
          points={a.points.map(toV).map((p) => `${p.x},${p.y}`).join(' ')}
          fill="none" stroke={color} strokeWidth={a.strokeWidth * s} strokeOpacity={a.opacity}
          strokeLinecap="round" strokeLinejoin="round"
        />
      )
    case 'text': {
      const r = vp(a.rect)
      const { lines, baselines } = layoutTextBox(a.text, a.fontSize, r.width / s, r.height / s)
      return (
        <svg x={r.x} y={r.y} width={r.width} height={r.height} overflow="hidden">
          {lines.map((line, i) => (
            <text
              key={i} x={TEXT_PADDING * s} y={baselines[i] * s} fontSize={a.fontSize * s}
              fontFamily="Helvetica, Arial, sans-serif" fill={color} style={{ whiteSpace: 'pre' }}
            >
              {line}
            </text>
          ))}
        </svg>
      )
    }
  }
}
```

`src/ui/TextEditor.tsx`:
```tsx
import { useRef, useState } from 'react'
import { rectToViewport, type PageGeometry } from '../coords/page-space'
import type { TextAnnotation } from '../model/types'
import { LINE_HEIGHT, TEXT_PADDING } from '../text/layout'
import { css } from './color'

interface Props {
  annotation: TextAnnotation
  geometry: PageGeometry
  scale: number
  onCommit: (text: string) => void
  onCancel: () => void
}

/** An in-place editor. The page's text is always upright on screen, so a plain textarea over the viewport rect lines up at any page rotation. */
export function TextEditor({ annotation, geometry, scale, onCommit, onCancel }: Props) {
  const r = rectToViewport(geometry, scale, annotation.rect)
  const [value, setValue] = useState(annotation.text)
  const done = useRef(false)
  const finish = (commit: boolean) => {
    if (done.current) return
    done.current = true
    if (commit) onCommit(value)
    else onCancel()
  }
  return (
    <textarea
      data-testid="text-editor"
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          finish(false)
        }
      }}
      style={{
        position: 'absolute', left: r.x, top: r.y, width: r.width, height: r.height, boxSizing: 'border-box',
        padding: TEXT_PADDING * scale, fontFamily: 'Helvetica, Arial, sans-serif', fontSize: annotation.fontSize * scale,
        lineHeight: LINE_HEIGHT, color: css(annotation.color), border: '1px dashed #2f7de1',
        background: 'rgba(255,255,255,0.7)', resize: 'none', outline: 'none', overflow: 'hidden', margin: 0,
      }}
    />
  )
}
```

- [ ] **Step 6: Implement the overlay, toolbar and editor wiring**

`src/ui/Overlay.tsx`:
```tsx
import { useRef, useState, type PointerEvent } from 'react'
import { rectToViewport, viewportSize, type PageGeometry } from '../coords/page-space'
import type { AnnotationStore } from '../model/store'
import type { Point, TextAnnotation } from '../model/types'
import { AnnotationView } from './AnnotationView'
import { TextEditor } from './TextEditor'
import { beginDraft, draftToAnnotation, extendDraft, type Draft, type Tool, type ToolStyles } from './tools'
import { useStoreState } from './useStoreState'

interface Props {
  pageIndex: number
  geometry: PageGeometry
  scale: number
  tool: Tool
  styles: ToolStyles
  store: AnnotationStore
}

export function Overlay({ pageIndex, geometry, scale, tool, styles, store }: Props) {
  const { annotations } = useStoreState(store)
  const svgRef = useRef<SVGSVGElement>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [textEdit, setTextEdit] = useState<TextAnnotation | null>(null)
  const size = viewportSize(geometry, scale)
  const mine = annotations.filter((a) => a.page === pageIndex)

  const pointOf = (e: PointerEvent): Point => {
    const box = svgRef.current!.getBoundingClientRect()
    return { x: e.clientX - box.left, y: e.clientY - box.top }
  }
  const toAnnotation = (d: Draft, id: string) => draftToAnnotation(d, styles[d.tool], id, pageIndex, geometry, scale)

  function onPointerDown(e: PointerEvent<SVGSVGElement>) {
    if (tool === 'select' || e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setDraft(beginDraft(tool, pointOf(e)))
  }
  function onPointerMove(e: PointerEvent) {
    if (draft) setDraft(extendDraft(draft, pointOf(e)))
  }
  function onPointerUp(e: PointerEvent) {
    if (!draft) return
    const done = extendDraft(draft, pointOf(e))
    setDraft(null)
    const ann = toAnnotation(done, crypto.randomUUID())
    if (!ann) return
    if (ann.type === 'text') setTextEdit(ann)
    else store.add(ann)
  }

  const preview = draft ? toAnnotation(draft, 'draft') : null
  const previewRect = preview?.type === 'text' ? rectToViewport(geometry, scale, preview.rect) : null

  return (
    <div className="overlay" style={size}>
      <svg
        ref={svgRef}
        width={size.width}
        height={size.height}
        data-testid={`page-overlay-${pageIndex}`}
        style={{ cursor: tool === 'select' ? 'default' : 'crosshair' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setDraft(null)}
      >
        {mine.map((a) => (
          <AnnotationView key={a.id} annotation={a} geometry={geometry} scale={scale} />
        ))}
        {preview && <AnnotationView annotation={preview} geometry={geometry} scale={scale} />}
        {previewRect && <rect {...previewRect} fill="none" stroke="#2f7de1" strokeDasharray="4 3" />}
      </svg>
      {textEdit && (
        <TextEditor
          annotation={textEdit}
          geometry={geometry}
          scale={scale}
          onCancel={() => setTextEdit(null)}
          onCommit={(text) => {
            setTextEdit(null)
            if (text.trim()) store.add({ ...textEdit, text })
          }}
        />
      )}
    </div>
  )
}
```

`src/ui/Toolbar.tsx`:
```tsx
import type { Tool } from './tools'

const TOOLS: { id: Tool; label: string }[] = [
  { id: 'select', label: 'Select' },
  { id: 'highlight', label: 'Highlight' },
  { id: 'underline', label: 'Underline' },
  { id: 'strikeout', label: 'Strikethrough' },
  { id: 'rectangle', label: 'Rectangle' },
  { id: 'ellipse', label: 'Ellipse' },
  { id: 'line', label: 'Line' },
  { id: 'arrow', label: 'Arrow' },
  { id: 'pen', label: 'Pen' },
  { id: 'text', label: 'Text' },
]

export function Toolbar({ tool, onTool }: { tool: Tool; onTool: (t: Tool) => void }) {
  return (
    <div className="toolbar" role="toolbar" aria-label="Tools">
      {TOOLS.map((t) => (
        <button key={t.id} className="button" data-testid={`tool-${t.id}`} aria-pressed={tool === t.id} onClick={() => onTool(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  )
}
```

Replace `src/ui/Editor.tsx` with:
```tsx
import { useMemo, useRef, useState } from 'react'
import { viewportSize } from '../coords/page-space'
import { createStore } from '../model/store'
import type { OpenFile } from './open-file'
import { Overlay } from './Overlay'
import { PageView } from './PageView'
import { DEFAULT_STYLES, type Tool, type ToolStyles } from './tools'
import { Toolbar } from './Toolbar'
import { nextZoom } from './zoom'

export function Editor({ file, onClose }: { file: OpenFile; onClose: () => void }) {
  const store = useMemo(() => createStore(), [])
  const [tool, setTool] = useState<Tool>('select')
  const [styles] = useState<ToolStyles>(DEFAULT_STYLES)
  const [scale, setScale] = useState(1)
  const pagesRef = useRef<HTMLDivElement>(null)

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
        <Toolbar tool={tool} onTool={setTool} />
        <span className="spacer" />
        <div className="zoom">
          <button className="button" data-testid="zoom-out" onClick={() => setScale((s) => nextZoom(s, -1))}>−</button>
          <span>{Math.round(scale * 100)}%</span>
          <button className="button" data-testid="zoom-in" onClick={() => setScale((s) => nextZoom(s, 1))}>+</button>
          <button className="button" data-testid="fit-width" onClick={fitWidth}>Fit width</button>
        </div>
      </header>
      <div className="workspace">
        <div className="pages" ref={pagesRef}>
          {file.doc.pages.map((p) => (
            <PageView key={p.index} page={p} scale={scale}>
              <Overlay pageIndex={p.index} geometry={p.geometry} scale={scale} tool={tool} styles={styles} store={store} />
            </PageView>
          ))}
        </div>
      </div>
    </div>
  )
}
```

Append to `src/styles.css`:
```css
.toolbar { display: flex; gap: 4px; flex-wrap: wrap; }
.overlay { position: absolute; inset: 0; }
.overlay svg { display: block; position: absolute; inset: 0; touch-action: none; }
```

- [ ] **Step 7: Write the end-to-end drawing tests**

`e2e/tools.spec.ts`:
```ts
import { expect, test, type Page } from '@playwright/test'
import { makePdf } from '../tests/helpers/makePdf'
import { openPdfInApp } from './helpers'

async function overlayBox(page: Page) {
  return (await page.getByTestId('page-overlay-0').boundingBox())!
}

async function dragOnPage(page: Page, from: [number, number], to: [number, number]) {
  const box = await overlayBox(page)
  await page.mouse.move(box.x + from[0], box.y + from[1])
  await page.mouse.down()
  await page.mouse.move(box.x + (from[0] + to[0]) / 2, box.y + (from[1] + to[1]) / 2, { steps: 3 })
  await page.mouse.move(box.x + to[0], box.y + to[1], { steps: 3 })
  await page.mouse.up()
}

test.beforeEach(async ({ page }) => {
  await openPdfInApp(page, await makePdf([{ width: 612, height: 792 }]))
})

for (const tool of ['highlight', 'underline', 'strikeout', 'rectangle', 'ellipse', 'line', 'arrow'] as const) {
  test(`draws a ${tool}`, async ({ page }) => {
    await page.getByTestId(`tool-${tool}`).click()
    await dragOnPage(page, [100, 200], [300, 260])
    await expect(page.getByTestId(`annotation-${tool}`)).toHaveCount(1)
  })
}

test('draws a pen stroke', async ({ page }) => {
  await page.getByTestId('tool-pen').click()
  const box = await overlayBox(page)
  await page.mouse.move(box.x + 100, box.y + 300)
  await page.mouse.down()
  for (const [x, y] of [[130, 320], [160, 300], [190, 330]]) await page.mouse.move(box.x + x, box.y + y, { steps: 4 })
  await page.mouse.up()
  await expect(page.getByTestId('annotation-pen')).toHaveCount(1)
})

test('adds a text box by dragging and typing', async ({ page }) => {
  await page.getByTestId('tool-text').click()
  await dragOnPage(page, [100, 400], [300, 460])
  await page.getByTestId('text-editor').fill('Hello world')
  await page.getByTestId('tool-select').click()
  await expect(page.getByTestId('annotation-text')).toHaveCount(1)
  await expect(page.getByTestId('annotation-text')).toContainText('Hello world')
})

test('discards an empty text box', async ({ page }) => {
  await page.getByTestId('tool-text').click()
  await dragOnPage(page, [100, 400], [300, 460])
  await page.getByTestId('tool-select').click()
  await expect(page.getByTestId('annotation-text')).toHaveCount(0)
})

test('a click without a drag creates no shape', async ({ page }) => {
  await page.getByTestId('tool-rectangle').click()
  const box = await overlayBox(page)
  await page.mouse.click(box.x + 100, box.y + 100)
  await expect(page.getByTestId('annotation-rectangle')).toHaveCount(0)
})
```

- [ ] **Step 8: Run all tests, then commit**

Run: `npx vitest run && npm run build && npm run test:e2e`
Expected: all pass.

```bash
git add -A
git commit -m "feat(ui): SVG overlay with drawing tools and in-place text boxes" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Select, move, resize, delete, properties and undo

**Files:**
- Create: `src/ui/transform.ts`, `src/ui/style.ts`, `src/ui/PropertiesPanel.tsx`, `e2e/select.spec.ts`
- Modify: `src/ui/AnnotationView.tsx`, `src/ui/Overlay.tsx` (replace), `src/ui/Editor.tsx` (replace), `e2e/helpers.ts`, `e2e/tools.spec.ts`, `src/styles.css`
- Test: `src/ui/transform.test.ts`, `src/ui/style.test.ts`

**Interfaces:**
- Consumes: Tasks 2, 3, 5, 7, 8.
- Produces:
  - `Handle = 'nw'|'n'|'ne'|'e'|'se'|'s'|'sw'|'w'`, `HANDLES: Handle[]`, `MIN_SIZE_PX = 8`.
  - `translateAnnotation(a, du, dv): Annotation` (user-space deltas); `resizeViewportRect(r, handle, dx, dy, min?): Rect`; `resizeRectAnnotation(a: RectAnnotation, handle, startV, curV, g, scale): RectAnnotation`; `moveEndpoint(a: LineAnnotation, which: 'from'|'to', curV, g, scale): LineAnnotation`; `viewportBounds(a, g, scale): Rect`; `handlePoint(bounds: Rect, h: Handle): Point`.
  - `styleOf(a): StyleDefaults`; `stylePatchFor(a, patch): Partial<Annotation>`; `controlsFor(type): { opacity: boolean; strokeWidth: boolean; fontSize: boolean }`.
  - `<PropertiesPanel type style hasSelection onChange(patch, coalesceKey) onBringToFront />`.
  - Test ids: `handle-{nw|n|ne|e|se|s|sw|w}`, `handle-from`, `handle-to`, `swatch-{hex}`, `prop-color`, `prop-opacity`, `prop-stroke`, `prop-fontsize`, `bring-front`, `undo-button`, `redo-button`.

- [ ] **Step 1: Write the failing transform and style tests**

`src/ui/transform.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import type { PageGeometry } from '../coords/page-space'
import type { Annotation, LineAnnotation, RectangleAnnotation } from '../model/types'
import {
  handlePoint, moveEndpoint, resizeRectAnnotation, resizeViewportRect, translateAnnotation, viewportBounds,
} from './transform'

const g: PageGeometry = { view: [0, 0, 612, 792], rotate: 0 }
const base = { id: 'a', page: 0, pageRotation: 0 as const, color: { r: 1, g: 0, b: 0 }, opacity: 1 }
const rectangle: RectangleAnnotation = { ...base, type: 'rectangle', strokeWidth: 2, rect: { x: 100, y: 600, width: 100, height: 50 } }
const line: LineAnnotation = { ...base, type: 'line', strokeWidth: 2, from: { x: 10, y: 10 }, to: { x: 60, y: 40 } }

describe('translateAnnotation', () => {
  it('moves rect, line and pen annotations in user space', () => {
    expect(translateAnnotation(rectangle, 5, -5)).toMatchObject({ rect: { x: 105, y: 595, width: 100, height: 50 } })
    expect(translateAnnotation(line, 1, 2)).toMatchObject({ from: { x: 11, y: 12 }, to: { x: 61, y: 42 } })
    const pen: Annotation = { ...base, type: 'pen', strokeWidth: 2, points: [{ x: 0, y: 0 }, { x: 3, y: 4 }] }
    expect(translateAnnotation(pen, 10, 10)).toMatchObject({ points: [{ x: 10, y: 10 }, { x: 13, y: 14 }] })
  })
})

describe('resizeViewportRect', () => {
  const r = { x: 100, y: 100, width: 100, height: 50 }
  it('moves only the edges the handle touches', () => {
    expect(resizeViewportRect(r, 'se', 20, 10)).toEqual({ x: 100, y: 100, width: 120, height: 60 })
    expect(resizeViewportRect(r, 'nw', 20, 10)).toEqual({ x: 120, y: 110, width: 80, height: 40 })
    expect(resizeViewportRect(r, 'e', 20, 99)).toEqual({ x: 100, y: 100, width: 120, height: 50 })
    expect(resizeViewportRect(r, 'n', 99, -10)).toEqual({ x: 100, y: 90, width: 100, height: 60 })
  })
  it('never shrinks below the minimum size', () => {
    expect(resizeViewportRect(r, 'e', -500, 0)).toEqual({ x: 100, y: 100, width: 8, height: 50 })
    expect(resizeViewportRect(r, 'nw', 500, 500)).toEqual({ x: 192, y: 142, width: 8, height: 8 })
  })
})

describe('resizeRectAnnotation / moveEndpoint', () => {
  it('resizes in viewport space and converts back to user space', () => {
    const next = resizeRectAnnotation(rectangle, 'se', { x: 200, y: 192 }, { x: 220, y: 202 }, g, 1)
    expect(next.rect).toEqual({ x: 100, y: 590, width: 120, height: 60 })
  })
  it('moves one end of a line', () => {
    const next = moveEndpoint(line, 'to', { x: 100, y: 692 }, g, 1)
    expect(next.to).toEqual({ x: 100, y: 100 })
    expect(next.from).toEqual(line.from)
  })
})

describe('viewportBounds / handlePoint', () => {
  it('bounds a line by its end points in viewport space', () => {
    expect(viewportBounds(line, g, 1)).toEqual({ x: 10, y: 752, width: 50, height: 30 })
  })
  it('places handles on the bounds', () => {
    const b = { x: 100, y: 200, width: 40, height: 20 }
    expect(handlePoint(b, 'nw')).toEqual({ x: 100, y: 200 })
    expect(handlePoint(b, 'e')).toEqual({ x: 140, y: 210 })
    expect(handlePoint(b, 's')).toEqual({ x: 120, y: 220 })
  })
})
```

`src/ui/style.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import type { Annotation } from '../model/types'
import { controlsFor, styleOf, stylePatchFor } from './style'

const base = { id: 'a', page: 0, pageRotation: 0 as const, color: { r: 1, g: 0, b: 0 }, opacity: 0.7 }
const rect = { x: 0, y: 0, width: 10, height: 10 }

describe('style helpers', () => {
  it('reads the style of an annotation, falling back to defaults for fields it lacks', () => {
    const h: Annotation = { ...base, type: 'highlight', rect }
    expect(styleOf(h)).toMatchObject({ opacity: 0.7, color: { r: 1, g: 0, b: 0 } })
    const r: Annotation = { ...base, type: 'rectangle', rect, strokeWidth: 5 }
    expect(styleOf(r).strokeWidth).toBe(5)
  })

  it('only patches fields the annotation actually has', () => {
    const h: Annotation = { ...base, type: 'highlight', rect }
    expect(stylePatchFor(h, { strokeWidth: 9, fontSize: 30, opacity: 0.2 })).toEqual({ opacity: 0.2 })
    const t: Annotation = { ...base, type: 'text', rect, text: 'x', fontSize: 12 }
    expect(stylePatchFor(t, { fontSize: 30, strokeWidth: 9 })).toEqual({ fontSize: 30 })
  })

  it('shows the right controls per type', () => {
    expect(controlsFor('highlight')).toEqual({ opacity: true, strokeWidth: false, fontSize: false })
    expect(controlsFor('rectangle')).toEqual({ opacity: true, strokeWidth: true, fontSize: false })
    expect(controlsFor('text')).toEqual({ opacity: false, strokeWidth: false, fontSize: true })
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/ui/transform.test.ts src/ui/style.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement transform and style**

`src/ui/transform.ts`:
```ts
import {
  rectToViewport, userToViewport, viewportRectToUser, viewportToUser, type PageGeometry,
} from '../coords/page-space'
import { isRectAnnotation, type Annotation, type LineAnnotation, type Point, type Rect, type RectAnnotation } from '../model/types'
import { boundsOfPoints } from '../shapes/geometry'

export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
export const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
export const MIN_SIZE_PX = 8

export function translateAnnotation(a: Annotation, du: number, dv: number): Annotation {
  const shift = (p: Point): Point => ({ x: p.x + du, y: p.y + dv })
  switch (a.type) {
    case 'line':
    case 'arrow':
      return { ...a, from: shift(a.from), to: shift(a.to) }
    case 'pen':
      return { ...a, points: a.points.map(shift) }
    default:
      return { ...a, rect: { ...a.rect, x: a.rect.x + du, y: a.rect.y + dv } }
  }
}

export function resizeViewportRect(r: Rect, handle: Handle, dx: number, dy: number, min = MIN_SIZE_PX): Rect {
  let left = r.x
  let right = r.x + r.width
  let top = r.y
  let bottom = r.y + r.height
  if (handle.includes('w')) left += dx
  if (handle.includes('e')) right += dx
  if (handle.includes('n')) top += dy
  if (handle.includes('s')) bottom += dy
  if (right - left < min) {
    if (handle.includes('w')) left = right - min
    else right = left + min
  }
  if (bottom - top < min) {
    if (handle.includes('n')) top = bottom - min
    else bottom = top + min
  }
  return { x: left, y: top, width: right - left, height: bottom - top }
}

export function resizeRectAnnotation(
  a: RectAnnotation, handle: Handle, startV: Point, curV: Point, g: PageGeometry, scale: number,
): RectAnnotation {
  const next = resizeViewportRect(rectToViewport(g, scale, a.rect), handle, curV.x - startV.x, curV.y - startV.y)
  return { ...a, rect: viewportRectToUser(g, scale, next) }
}

export function moveEndpoint(
  a: LineAnnotation, which: 'from' | 'to', curV: Point, g: PageGeometry, scale: number,
): LineAnnotation {
  return { ...a, [which]: viewportToUser(g, scale, curV) } as LineAnnotation
}

/** The annotation's bounding box in viewport pixels. */
export function viewportBounds(a: Annotation, g: PageGeometry, scale: number): Rect {
  if (isRectAnnotation(a)) return rectToViewport(g, scale, a.rect)
  const pts = (a.type === 'pen' ? a.points : [a.from, a.to]).map((p) => userToViewport(g, scale, p))
  const [x0, y0, x1, y1] = boundsOfPoints(pts)
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
}

export function handlePoint(b: Rect, h: Handle): Point {
  const x = h.includes('w') ? b.x : h.includes('e') ? b.x + b.width : b.x + b.width / 2
  const y = h.includes('n') ? b.y : h.includes('s') ? b.y + b.height : b.y + b.height / 2
  return { x, y }
}
```

`src/ui/style.ts`:
```ts
import type { Annotation, AnnotationType } from '../model/types'
import { DEFAULT_STYLES, type StyleDefaults } from './tools'

export function styleOf(a: Annotation): StyleDefaults {
  return {
    color: a.color,
    opacity: a.opacity,
    strokeWidth: 'strokeWidth' in a ? a.strokeWidth : DEFAULT_STYLES[a.type].strokeWidth,
    fontSize: a.type === 'text' ? a.fontSize : DEFAULT_STYLES[a.type].fontSize,
  }
}

export function stylePatchFor(a: Annotation, patch: Partial<StyleDefaults>): Partial<Annotation> {
  const out: Record<string, unknown> = {}
  if (patch.color) out.color = patch.color
  if (patch.opacity !== undefined) out.opacity = patch.opacity
  if (patch.strokeWidth !== undefined && 'strokeWidth' in a) out.strokeWidth = patch.strokeWidth
  if (patch.fontSize !== undefined && a.type === 'text') out.fontSize = patch.fontSize
  return out as Partial<Annotation>
}

export function controlsFor(type: AnnotationType) {
  return {
    opacity: type !== 'text',
    strokeWidth: type !== 'highlight' && type !== 'text',
    fontSize: type === 'text',
  }
}
```

- [ ] **Step 4: Verify pass**

Run: `npx vitest run`
Expected: all pass.

- [ ] **Step 5: Make annotation groups interactive**

In `src/ui/AnnotationView.tsx`, change the first import line to `import type { PointerEvent, ReactNode } from 'react'`, then replace the `Props` interface and the exported `AnnotationView` function with:

```tsx
interface Props {
  annotation: Annotation
  geometry: PageGeometry
  scale: number
  hidden?: boolean
  /** In the select tool, annotations capture pointer events and show a generous hit area. */
  interactive?: boolean
  onPointerDown?: (e: PointerEvent<SVGGElement>) => void
}

export function AnnotationView({ annotation, geometry, scale, hidden, interactive, onPointerDown }: Props) {
  if (hidden) return null
  return (
    <g
      data-annotation-id={annotation.id}
      data-testid={`annotation-${annotation.type}`}
      style={{ pointerEvents: interactive ? 'auto' : 'none', cursor: interactive ? 'move' : undefined }}
      onPointerDown={onPointerDown}
    >
      {renderBody(annotation, geometry, scale)}
      {interactive && renderHit(annotation, geometry, scale)}
    </g>
  )
}

/** Invisible shapes that make thin strokes easy to click. */
function renderHit(a: Annotation, g: PageGeometry, s: number): ReactNode {
  const hitWidth = (sw: number) => Math.max(12, sw * s)
  switch (a.type) {
    case 'line':
    case 'arrow': {
      const f = userToViewport(g, s, a.from)
      const t = userToViewport(g, s, a.to)
      return <line x1={f.x} y1={f.y} x2={t.x} y2={t.y} stroke="transparent" strokeWidth={hitWidth(a.strokeWidth)} strokeLinecap="round" />
    }
    case 'pen':
      return (
        <polyline
          points={a.points.map((p) => userToViewport(g, s, p)).map((p) => `${p.x},${p.y}`).join(' ')}
          fill="none" stroke="transparent" strokeWidth={hitWidth(a.strokeWidth)} strokeLinecap="round" strokeLinejoin="round"
        />
      )
    default:
      return <rect {...rectToViewport(g, s, a.rect)} fill="transparent" />
  }
}
```

- [ ] **Step 6: Replace the overlay with selection, move, resize and text re-editing**

Replace `src/ui/Overlay.tsx` with:
```tsx
import { useRef, useState, type PointerEvent } from 'react'
import { rectToViewport, userToViewport, viewportSize, viewportToUser, type PageGeometry } from '../coords/page-space'
import type { AnnotationStore } from '../model/store'
import { isRectAnnotation, type Annotation, type Point, type TextAnnotation } from '../model/types'
import { AnnotationView } from './AnnotationView'
import { TextEditor } from './TextEditor'
import { beginDraft, draftToAnnotation, extendDraft, type Draft, type Tool, type ToolStyles } from './tools'
import {
  HANDLES, handlePoint, moveEndpoint, resizeRectAnnotation, translateAnnotation, viewportBounds, type Handle,
} from './transform'
import { useStoreState } from './useStoreState'

interface Props {
  pageIndex: number
  geometry: PageGeometry
  scale: number
  tool: Tool
  styles: ToolStyles
  store: AnnotationStore
}

interface Drag {
  mode: 'move' | 'resize' | 'endpoint'
  original: Annotation
  current: Annotation
  startV: Point
  handle?: Handle
  which?: 'from' | 'to'
}
interface TextEdit { annotation: TextAnnotation; isNew: boolean }

const CURSORS: Record<Handle, string> = {
  nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize',
  n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize',
}
const BLUE = '#2f7de1'

export function Overlay({ pageIndex, geometry, scale, tool, styles, store }: Props) {
  const { annotations, selectedId } = useStoreState(store)
  const svgRef = useRef<SVGSVGElement>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [textEdit, setTextEdit] = useState<TextEdit | null>(null)
  const size = viewportSize(geometry, scale)
  const selecting = tool === 'select'

  const mine = annotations
    .filter((a) => a.page === pageIndex)
    .map((a) => (drag && drag.original.id === a.id ? drag.current : a))
  const selected = selecting && !textEdit ? mine.find((a) => a.id === selectedId) : undefined

  const pointOf = (e: PointerEvent | MouseEventLike): Point => {
    const box = svgRef.current!.getBoundingClientRect()
    return { x: e.clientX - box.left, y: e.clientY - box.top }
  }
  const toAnnotation = (d: Draft, id: string) => draftToAnnotation(d, styles[d.tool], id, pageIndex, geometry, scale)

  function startDrag(e: PointerEvent, init: Pick<Drag, 'mode' | 'original' | 'handle' | 'which'>) {
    e.stopPropagation()
    svgRef.current!.setPointerCapture(e.pointerId)
    setDrag({ ...init, current: init.original, startV: pointOf(e) })
  }

  function computeDrag(d: Drag, p: Point): Annotation {
    if (d.mode === 'move') {
      const a = viewportToUser(geometry, scale, d.startV)
      const b = viewportToUser(geometry, scale, p)
      return translateAnnotation(d.original, b.x - a.x, b.y - a.y)
    }
    if (d.mode === 'resize' && isRectAnnotation(d.original) && d.handle) {
      return resizeRectAnnotation(d.original, d.handle, d.startV, p, geometry, scale)
    }
    if (d.mode === 'endpoint' && (d.original.type === 'line' || d.original.type === 'arrow') && d.which) {
      return moveEndpoint(d.original, d.which, p, geometry, scale)
    }
    return d.original
  }

  function onPointerDown(e: PointerEvent<SVGSVGElement>) {
    if (e.button !== 0) return
    if (selecting) {
      store.select(null)
      return
    }
    e.currentTarget.setPointerCapture(e.pointerId)
    setDraft(beginDraft(tool as Exclude<Tool, 'select'>, pointOf(e)))
  }
  function onPointerMove(e: PointerEvent) {
    if (drag) setDrag({ ...drag, current: computeDrag(drag, pointOf(e)) })
    else if (draft) setDraft(extendDraft(draft, pointOf(e)))
  }
  function onPointerUp(e: PointerEvent) {
    if (drag) {
      setDrag(null)
      if (drag.current !== drag.original) store.update(drag.original.id, drag.current)
      return
    }
    if (!draft) return
    const done = extendDraft(draft, pointOf(e))
    setDraft(null)
    const ann = toAnnotation(done, crypto.randomUUID())
    if (!ann) return
    if (ann.type === 'text') setTextEdit({ annotation: ann, isNew: true })
    else store.add(ann)
  }

  /** Handled here, not on the annotation, because the svg holds pointer capture after a press. */
  function onDoubleClick(e: MouseEventLike) {
    if (!selecting) return
    const p = pointOf(e)
    const hit = [...mine].reverse().find((a): a is TextAnnotation => {
      if (a.type !== 'text') return false
      const r = rectToViewport(geometry, scale, a.rect)
      return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height
    })
    if (hit) {
      store.select(hit.id)
      setTextEdit({ annotation: hit, isNew: false })
    }
  }

  const preview = draft ? toAnnotation(draft, 'draft') : null
  const previewRect = preview?.type === 'text' ? rectToViewport(geometry, scale, preview.rect) : null
  const bounds = selected ? viewportBounds(selected, geometry, scale) : null

  return (
    <div className="overlay" style={size}>
      <svg
        ref={svgRef}
        width={size.width}
        height={size.height}
        data-testid={`page-overlay-${pageIndex}`}
        style={{ cursor: selecting ? 'default' : 'crosshair' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          setDraft(null)
          setDrag(null)
        }}
        onDoubleClick={onDoubleClick}
      >
        {mine.map((a) => (
          <AnnotationView
            key={a.id}
            annotation={a}
            geometry={geometry}
            scale={scale}
            hidden={!!textEdit && !textEdit.isNew && textEdit.annotation.id === a.id}
            interactive={selecting}
            onPointerDown={(e) => {
              if (e.button !== 0) return
              store.select(a.id)
              startDrag(e, { mode: 'move', original: a })
            }}
          />
        ))}
        {preview && <AnnotationView annotation={preview} geometry={geometry} scale={scale} />}
        {previewRect && <rect {...previewRect} fill="none" stroke={BLUE} strokeDasharray="4 3" />}

        {selected && bounds && (
          <g>
            <rect {...bounds} fill="none" stroke={BLUE} strokeDasharray="4 3" pointerEvents="none" />
            {isRectAnnotation(selected) &&
              HANDLES.map((h) => {
                const c = handlePoint(bounds, h)
                return (
                  <rect
                    key={h} data-testid={`handle-${h}`} x={c.x - 4} y={c.y - 4} width={8} height={8}
                    fill="#fff" stroke={BLUE} style={{ cursor: CURSORS[h] }}
                    onPointerDown={(e) => startDrag(e, { mode: 'resize', original: selected, handle: h })}
                  />
                )
              })}
            {(selected.type === 'line' || selected.type === 'arrow') &&
              (['from', 'to'] as const).map((which) => {
                const c = userToViewport(geometry, scale, selected[which])
                return (
                  <circle
                    key={which} data-testid={`handle-${which}`} cx={c.x} cy={c.y} r={5}
                    fill="#fff" stroke={BLUE} style={{ cursor: 'crosshair' }}
                    onPointerDown={(e) => startDrag(e, { mode: 'endpoint', original: selected, which })}
                  />
                )
              })}
          </g>
        )}
      </svg>
      {textEdit && (
        <TextEditor
          annotation={textEdit.annotation}
          geometry={geometry}
          scale={scale}
          onCancel={() => setTextEdit(null)}
          onCommit={(text) => {
            const { annotation, isNew } = textEdit
            setTextEdit(null)
            if (isNew) {
              if (text.trim()) store.add({ ...annotation, text })
            } else if (!text.trim()) {
              store.remove(annotation.id)
            } else if (text !== annotation.text) {
              store.update(annotation.id, { text })
            }
          }}
        />
      )}
    </div>
  )
}

type MouseEventLike = { clientX: number; clientY: number }
```

- [ ] **Step 7: Implement the properties panel**

`src/ui/PropertiesPanel.tsx`:
```tsx
import type { AnnotationType } from '../model/types'
import { hexToRgb, rgbToHex, SWATCHES } from './color'
import { controlsFor } from './style'
import type { StyleDefaults } from './tools'

const LABELS: Record<AnnotationType, string> = {
  highlight: 'Highlight', underline: 'Underline', strikeout: 'Strikethrough', rectangle: 'Rectangle',
  ellipse: 'Ellipse', line: 'Line', arrow: 'Arrow', pen: 'Pen', text: 'Text box',
}

interface Props {
  type: AnnotationType
  style: StyleDefaults
  hasSelection: boolean
  onChange: (patch: Partial<StyleDefaults>, coalesceKey: string) => void
  onBringToFront: () => void
}

export function PropertiesPanel({ type, style, hasSelection, onChange, onBringToFront }: Props) {
  const show = controlsFor(type)
  const hex = rgbToHex(style.color)
  return (
    <aside className="panel" aria-label="Properties">
      <h2>{LABELS[type]}</h2>
      <div className="field">
        <span>Color</span>
        <div className="swatches">
          {SWATCHES.map((sw) => (
            <button
              key={sw} className="swatch" style={{ background: sw }} data-testid={`swatch-${sw.slice(1)}`}
              aria-label={`Color ${sw}`} aria-pressed={sw === hex} onClick={() => onChange({ color: hexToRgb(sw) }, 'color')}
            />
          ))}
        </div>
        <input type="color" data-testid="prop-color" value={hex} onChange={(e) => onChange({ color: hexToRgb(e.target.value) }, 'color')} />
      </div>
      {show.opacity && (
        <label className="field">
          <span>Opacity {Math.round(style.opacity * 100)}%</span>
          <input
            type="range" data-testid="prop-opacity" min={5} max={100} value={Math.round(style.opacity * 100)}
            onChange={(e) => onChange({ opacity: Number(e.target.value) / 100 }, 'opacity')}
          />
        </label>
      )}
      {show.strokeWidth && (
        <label className="field">
          <span>Thickness {style.strokeWidth}</span>
          <input
            type="range" data-testid="prop-stroke" min={1} max={12} step={0.5} value={style.strokeWidth}
            onChange={(e) => onChange({ strokeWidth: Number(e.target.value) }, 'strokeWidth')}
          />
        </label>
      )}
      {show.fontSize && (
        <label className="field">
          <span>Font size</span>
          <input
            type="number" data-testid="prop-fontsize" min={8} max={72} value={style.fontSize}
            onChange={(e) => onChange({ fontSize: Math.min(72, Math.max(8, Number(e.target.value) || 14)) }, 'fontSize')}
          />
        </label>
      )}
      {hasSelection && (
        <button className="button" data-testid="bring-front" onClick={onBringToFront}>Bring to front</button>
      )}
    </aside>
  )
}
```

- [ ] **Step 8: Replace the editor**

Replace `src/ui/Editor.tsx` with:
```tsx
import { useEffect, useMemo, useRef, useState } from 'react'
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
  const store = useMemo(() => createStore(), [])
  const { annotations, selectedId, canUndo, canRedo } = useStoreState(store)
  const [tool, setTool] = useState<Tool>('select')
  const [styles, setStyles] = useState<ToolStyles>(DEFAULT_STYLES)
  const [scale, setScale] = useState(1)
  const pagesRef = useRef<HTMLDivElement>(null)

  const selected = annotations.find((a) => a.id === selectedId) ?? null
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
        if (id) {
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
  }, [store])

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
        <div className="pages" ref={pagesRef}>
          {file.doc.pages.map((p) => (
            <PageView key={p.index} page={p} scale={scale}>
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
```

Append to `src/styles.css`:
```css
.panel { width: 220px; flex: none; background: #fff; border-left: 1px solid #ced4da; padding: 12px; display: flex; flex-direction: column; gap: 12px; overflow: auto; box-sizing: border-box; }
.panel h2 { font-size: 16px; margin: 0; }
.panel.hint { color: #6c757d; font-size: 14px; }
.field { display: flex; flex-direction: column; gap: 4px; font-size: 14px; }
.swatches { display: flex; flex-wrap: wrap; gap: 6px; }
.swatch { width: 24px; height: 24px; border-radius: 50%; border: 2px solid #fff; box-shadow: 0 0 0 1px #868e96; cursor: pointer; padding: 0; }
.swatch[aria-pressed='true'] { box-shadow: 0 0 0 2px #2f7de1; }
```

- [ ] **Step 9: Share the e2e drawing helpers**

Append to `e2e/helpers.ts`:
```ts
export async function overlayBox(page: Page, index = 0) {
  return (await page.getByTestId(`page-overlay-${index}`).boundingBox())!
}

/** Coordinates are CSS pixels relative to the page's top-left at 100% zoom. */
export async function dragOnPage(page: Page, from: [number, number], to: [number, number], index = 0) {
  const box = await overlayBox(page, index)
  await page.mouse.move(box.x + from[0], box.y + from[1])
  await page.mouse.down()
  await page.mouse.move(box.x + (from[0] + to[0]) / 2, box.y + (from[1] + to[1]) / 2, { steps: 3 })
  await page.mouse.move(box.x + to[0], box.y + to[1], { steps: 3 })
  await page.mouse.up()
}
```

In `e2e/tools.spec.ts`, delete the local `overlayBox` and `dragOnPage` functions and the `type Page` import use that only they needed, and change the helper import to:
```ts
import { dragOnPage, openPdfInApp, overlayBox } from './helpers'
```
(Keep `type Page` in the `@playwright/test` import only if still referenced; remove it otherwise.)

- [ ] **Step 10: Write the end-to-end selection tests**

`e2e/select.spec.ts`:
```ts
import { expect, test, type Page } from '@playwright/test'
import { makePdf } from '../tests/helpers/makePdf'
import { dragOnPage, openPdfInApp } from './helpers'

const rectangle = (page: Page) => page.getByTestId('annotation-rectangle')

async function drawRectangle(page: Page) {
  await page.getByTestId('tool-rectangle').click()
  await dragOnPage(page, [100, 200], [300, 260])
  await page.getByTestId('tool-select').click()
}

test.beforeEach(async ({ page }) => {
  await openPdfInApp(page, await makePdf([{ width: 612, height: 792 }]))
})

test('moves a selected annotation by dragging', async ({ page }) => {
  await drawRectangle(page)
  const before = (await rectangle(page).boundingBox())!
  await dragOnPage(page, [200, 230], [250, 280])
  const after = (await rectangle(page).boundingBox())!
  expect(after.x - before.x).toBeCloseTo(50, 0)
  expect(after.y - before.y).toBeCloseTo(50, 0)
})

test('resizes with a corner handle', async ({ page }) => {
  await drawRectangle(page)
  await rectangle(page).click({ position: { x: 100, y: 30 } })
  const before = (await rectangle(page).boundingBox())!
  const handle = (await page.getByTestId('handle-se').boundingBox())!
  await page.mouse.move(handle.x + 4, handle.y + 4)
  await page.mouse.down()
  await page.mouse.move(handle.x + 44, handle.y + 24, { steps: 4 })
  await page.mouse.up()
  const after = (await rectangle(page).boundingBox())!
  expect(after.width - before.width).toBeCloseTo(40, 0)
  expect(after.height - before.height).toBeCloseTo(20, 0)
})

test('deletes with the Delete key and restores with undo', async ({ page }) => {
  await drawRectangle(page)
  await rectangle(page).click({ position: { x: 100, y: 30 } })
  await page.keyboard.press('Delete')
  await expect(rectangle(page)).toHaveCount(0)
  await page.keyboard.press('ControlOrMeta+z')
  await expect(rectangle(page)).toHaveCount(1)
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect(rectangle(page)).toHaveCount(0)
})

test('clicking empty space deselects', async ({ page }) => {
  await drawRectangle(page)
  await rectangle(page).click({ position: { x: 100, y: 30 } })
  await expect(page.getByTestId('handle-se')).toBeVisible()
  const box = (await page.getByTestId('page-overlay-0').boundingBox())!
  await page.mouse.click(box.x + 500, box.y + 600)
  await expect(page.getByTestId('handle-se')).toHaveCount(0)
})

test('changes the colour of the selected annotation', async ({ page }) => {
  await drawRectangle(page)
  await rectangle(page).click({ position: { x: 100, y: 30 } })
  await page.getByTestId('swatch-1e88e5').click()
  await expect(rectangle(page).locator('rect').first()).toHaveAttribute('stroke', 'rgb(30, 136, 229)')
})

test('edits an existing text box by double-clicking it', async ({ page }) => {
  await page.getByTestId('tool-text').click()
  await dragOnPage(page, [100, 400], [300, 460])
  await page.getByTestId('text-editor').fill('Hello')
  await page.getByTestId('tool-select').click()
  const box = (await page.getByTestId('page-overlay-0').boundingBox())!
  await page.mouse.dblclick(box.x + 200, box.y + 430)
  await page.getByTestId('text-editor').fill('Changed')
  await page.getByTestId('tool-select').click()
  await expect(page.getByTestId('annotation-text')).toContainText('Changed')
})
```

- [ ] **Step 11: Run everything, then commit**

Run: `npx vitest run && npm run build && npm run test:e2e`
Expected: all pass.

```bash
git add -A
git commit -m "feat(ui): select, move, resize, delete, style panel and undo/redo" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Download, export report and unsaved-changes guard

**Files:**
- Create: `src/ui/download.ts`, `e2e/export.spec.ts`
- Modify: `src/ui/Editor.tsx`, `src/styles.css`, `e2e/helpers.ts`
- Test: `src/ui/download.test.ts`

**Interfaces:**
- Consumes: `exportPdf`, `ExportProblem` (Task 6); `Editor` (Task 9).
- Produces: `annotatedFileName(name: string): string`; `downloadBytes(bytes: Uint8Array, filename: string): void`; e2e helper `downloadAnnotated(page): Promise<Uint8Array>`; test ids `download-button`, `export-report`, `export-problems`.

- [ ] **Step 1: Write the failing test**

`src/ui/download.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { annotatedFileName } from './download'

describe('annotatedFileName', () => {
  it('adds -annotated before the extension', () => {
    expect(annotatedFileName('report.pdf')).toBe('report-annotated.pdf')
    expect(annotatedFileName('Report.PDF')).toBe('Report-annotated.pdf')
  })
  it('handles names without an extension or with only an extension', () => {
    expect(annotatedFileName('report')).toBe('report-annotated.pdf')
    expect(annotatedFileName('.pdf')).toBe('document-annotated.pdf')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/ui/download.test.ts`
Expected: FAIL, cannot find module `./download`.

- [ ] **Step 3: Implement download**

`src/ui/download.ts`:
```ts
export function annotatedFileName(name: string): string {
  const base = name.replace(/\.pdf$/i, '')
  return `${base || 'document'}-annotated.pdf`
}

export function downloadBytes(bytes: Uint8Array, filename: string): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
```

- [ ] **Step 4: Verify pass**

Run: `npx vitest run src/ui/download.test.ts`
Expected: pass.

- [ ] **Step 5: Wire download into the editor**

In `src/ui/Editor.tsx`:

1. Add imports after the existing ones:
```tsx
import { exportPdf, type ExportProblem } from '../export/export-pdf'
import { annotatedFileName, downloadBytes } from './download'
```

2. Change the store-state line to include `revision`:
```tsx
  const { annotations, selectedId, canUndo, canRedo, revision } = useStoreState(store)
```

3. After the line `const pagesRef = useRef<HTMLDivElement>(null)`, add:
```tsx
  const [savedRevision, setSavedRevision] = useState(0)
  const [problems, setProblems] = useState<ExportProblem[]>([])
  const [exportError, setExportError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const dirty = revision !== savedRevision

  async function handleDownload() {
    setExporting(true)
    setExportError(null)
    try {
      const result = await exportPdf(file.bytes, annotations)
      setProblems(result.problems)
      downloadBytes(result.bytes, annotatedFileName(file.name))
      setSavedRevision(revision)
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Export failed.')
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
```

4. Change `<button className="button" onClick={onClose}>Open another file</button>` to use `handleClose`, and add the download button right before `<span className="spacer" />`:
```tsx
        <button className="button primary" data-testid="download-button" disabled={exporting} onClick={() => void handleDownload()}>
          {exporting ? 'Preparing…' : 'Download PDF'}
        </button>
```

5. Add this banner between `</header>` and `<div className="workspace">`:
```tsx
      {(problems.length > 0 || exportError) && (
        <div className="banner" role="status" data-testid="export-report">
          {exportError ? (
            <p>{exportError}</p>
          ) : (
            <>
              <p>Downloaded, with {problems.length} {problems.length === 1 ? 'issue' : 'issues'}:</p>
              <ul data-testid="export-problems">
                {problems.map((p, i) => (
                  <li key={i}>Page {p.page + 1}: {p.message}</li>
                ))}
              </ul>
            </>
          )}
          <button className="button" onClick={() => { setProblems([]); setExportError(null) }}>Dismiss</button>
        </div>
      )}
```

Append to `src/styles.css`:
```css
.banner { background: #fff3bf; border-bottom: 1px solid #f1c40f; padding: 8px 12px; font-size: 14px; }
.banner p, .banner ul { margin: 0 0 6px; }
```

- [ ] **Step 6: Add the download helper and end-to-end tests**

Append to `e2e/helpers.ts` (add `import { readFile } from 'node:fs/promises'` at the top):
```ts
export async function downloadAnnotated(page: Page): Promise<Uint8Array> {
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('download-button').click()])
  return new Uint8Array(await readFile((await download.path())!))
}
```

`e2e/export.spec.ts`:
```ts
import { expect, test } from '@playwright/test'
import { PDFDict, PDFDocument, PDFName, PDFString } from 'pdf-lib'
import { makePdf } from '../tests/helpers/makePdf'
import { downloadAnnotated, dragOnPage, openPdfInApp } from './helpers'

async function annotationsIn(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes)
  const dicts = (doc.getPage(0).node.Annots()?.asArray() ?? []).map((r) => doc.context.lookup(r, PDFDict))
  return dicts.map((d) => ({
    subtype: (d.get(PDFName.of('Subtype')) as PDFName).decodeText(),
    id: d.lookup(PDFName.of('NM'), PDFString).decodeText(),
  }))
}

test.beforeEach(async ({ page }) => {
  await openPdfInApp(page, await makePdf([{ width: 612, height: 792 }]))
})

test('downloads a PDF containing the drawn annotations', async ({ page }) => {
  await page.getByTestId('tool-highlight').click()
  await dragOnPage(page, [100, 200], [300, 260])
  await page.getByTestId('tool-rectangle').click()
  await dragOnPage(page, [100, 300], [300, 360])
  await page.getByTestId('tool-text').click()
  await dragOnPage(page, [100, 400], [400, 460])
  await page.getByTestId('text-editor').fill('Hello')
  await page.getByTestId('tool-select').click()

  const found = await annotationsIn(await downloadAnnotated(page))
  expect(found.map((a) => a.subtype)).toEqual(['Highlight', 'Square', 'FreeText'])
  expect(new Set(found.map((a) => a.id)).size).toBe(3)
})

test('reports text that cannot be shown in Helvetica', async ({ page }) => {
  await page.getByTestId('tool-text').click()
  await dragOnPage(page, [100, 400], [400, 460])
  await page.getByTestId('text-editor').fill('Hi 😀')
  await page.getByTestId('tool-select').click()
  await downloadAnnotated(page)
  await expect(page.getByTestId('export-problems')).toContainText('😀')
})

test('removing an annotation before download leaves it out of the file', async ({ page }) => {
  await page.getByTestId('tool-rectangle').click()
  await dragOnPage(page, [100, 300], [300, 360])
  await page.keyboard.press('Delete')
  await page.getByTestId('tool-select').click()
  expect(await annotationsIn(await downloadAnnotated(page))).toEqual([])
})
```

If the Delete key does nothing in the last test because the new annotation is not selected after drawing, that is a bug in `store.add` selection or `chooseTool`; fix the app, not the test.

- [ ] **Step 7: Run everything, then commit**

Run: `npx vitest run && npm run build && npm run test:e2e`
Expected: all pass.

```bash
git add -A
git commit -m "feat: download annotated PDF with export report and unsaved-changes guard" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Round-trip verification, README and deployment

**Files:**
- Create: `e2e/roundtrip.spec.ts`, `README.md` (replace the stub)
- Modify: `e2e/helpers.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: e2e helpers `pixelAt(page, index, x, y)` and `darkBounds(page, index, region)`; a README documenting run, test and deploy steps.

This task proves the property the whole design exists for: an annotation drawn at a place on screen appears at the same place when the downloaded PDF is rendered by an independent renderer (pdf.js reading the real annotation and its appearance stream), including on rotated and cropped pages.

- [ ] **Step 1: Add pixel helpers**

Append to `e2e/helpers.ts`:
```ts
export type Pixel = [number, number, number, number]

/** Reads one pixel of a page canvas. x and y are CSS pixels from the page's top-left. */
export function pixelAt(page: Page, index: number, x: number, y: number): Promise<Pixel> {
  return page.evaluate(
    ({ index, x, y }) => {
      const canvas = document.querySelector<HTMLCanvasElement>(`[data-testid="page-canvas-${index}"]`)!
      const dpr = window.devicePixelRatio || 1
      const d = canvas.getContext('2d')!.getImageData(Math.round(x * dpr), Math.round(y * dpr), 1, 1).data
      return [d[0], d[1], d[2], d[3]] as Pixel
    },
    { index, x, y },
  )
}

/** Bounding box (CSS px) of dark pixels inside a region of a page canvas, or null if there are none. */
export function darkBounds(
  page: Page, index: number, region: { x: number; y: number; width: number; height: number },
): Promise<{ width: number; height: number } | null> {
  return page.evaluate(
    ({ index, region }) => {
      const canvas = document.querySelector<HTMLCanvasElement>(`[data-testid="page-canvas-${index}"]`)!
      const dpr = window.devicePixelRatio || 1
      const { x, y, width, height } = region
      const img = canvas.getContext('2d')!.getImageData(Math.round(x * dpr), Math.round(y * dpr), Math.round(width * dpr), Math.round(height * dpr))
      let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1
      for (let py = 0; py < img.height; py++) {
        for (let px = 0; px < img.width; px++) {
          const i = (py * img.width + px) * 4
          if (img.data[i + 3] > 0 && img.data[i] + img.data[i + 1] + img.data[i + 2] < 300) {
            x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py)
          }
        }
      }
      return x1 < 0 ? null : { width: (x1 - x0 + 1) / dpr, height: (y1 - y0 + 1) / dpr }
    },
    { index, region },
  )
}
```

- [ ] **Step 2: Write the round-trip tests**

`e2e/roundtrip.spec.ts`:
```ts
import { expect, test, type Page } from '@playwright/test'
import { makePdf, type PageSpec } from '../tests/helpers/makePdf'
import { darkBounds, downloadAnnotated, dragOnPage, openPdfInApp, pixelAt } from './helpers'

/** Annotate in the app, download, then open the downloaded file in a fresh tab so pdf.js renders the real annotations. */
async function annotateAndReopen(page: Page, spec: PageSpec, draw: (p: Page) => Promise<void>): Promise<Page> {
  await openPdfInApp(page, await makePdf([spec]))
  await draw(page)
  const exported = await downloadAnnotated(page)
  const reopened = await page.context().newPage()
  await openPdfInApp(reopened, exported, 'annotated.pdf')
  return reopened
}

const isYellowish = ([r, g, b]: number[]) => r > 230 && g > 200 && b < 200
const isRed = ([r, g, b]: number[]) => r > 150 && g < 100 && b < 100

async function drawHighlightAndRectangle(page: Page) {
  await page.getByTestId('tool-highlight').click()
  await dragOnPage(page, [60, 100], [260, 160])
  await page.getByTestId('tool-rectangle').click()
  await dragOnPage(page, [60, 200], [260, 260])
}

const cases: { name: string; spec: PageSpec }[] = [
  { name: 'an unrotated page', spec: { width: 612, height: 792 } },
  { name: 'a page rotated 90', spec: { width: 612, height: 792, rotate: 90 } },
  { name: 'a page rotated 180', spec: { width: 612, height: 792, rotate: 180 } },
  { name: 'a page rotated 270', spec: { width: 612, height: 792, rotate: 270 } },
  { name: 'a page with an offset crop box', spec: { width: 612, height: 792, cropBox: [50, 50, 400, 500] } },
  { name: 'a rotated page with an offset crop box', spec: { width: 612, height: 792, rotate: 90, cropBox: [50, 50, 400, 500] } },
]

for (const { name, spec } of cases) {
  test(`annotations land where they were drawn on ${name}`, async ({ page }) => {
    const reopened = await annotateAndReopen(page, spec, drawHighlightAndRectangle)
    expect(isYellowish(await pixelAt(reopened, 0, 160, 130))).toBe(true)
    expect(isRed(await pixelAt(reopened, 0, 61, 230))).toBe(true)
    expect(isRed(await pixelAt(reopened, 0, 160, 201))).toBe(true)
    // nothing drawn here
    const blank = await pixelAt(reopened, 0, 160, 330)
    expect(blank.slice(0, 3)).toEqual([255, 255, 255])
  })
}

test('text stays upright on a rotated page', async ({ page }) => {
  const reopened = await annotateAndReopen(page, { width: 612, height: 792, rotate: 90 }, async (p) => {
    await p.getByTestId('tool-text').click()
    await dragOnPage(p, [100, 400], [400, 460])
    await p.getByTestId('text-editor').fill('HELLO')
    await p.getByTestId('tool-select').click()
  })
  const ink = await darkBounds(reopened, 0, { x: 100, y: 400, width: 300, height: 60 })
  expect(ink).not.toBeNull()
  expect(ink!.width).toBeGreaterThan(ink!.height)
})

test('annotating an already annotated PDF keeps the earlier annotations', async ({ page }) => {
  // `first` is the app showing the first export; annotate it again and export a second generation.
  const first = await annotateAndReopen(page, { width: 612, height: 792 }, drawHighlightAndRectangle)
  await first.getByTestId('tool-ellipse').click()
  await dragOnPage(first, [60, 400], [260, 460])
  const second = await first.context().newPage()
  await openPdfInApp(second, await downloadAnnotated(first), 'twice.pdf')
  expect(isYellowish(await pixelAt(second, 0, 160, 130))).toBe(true)
  expect(isRed(await pixelAt(second, 0, 61, 230))).toBe(true)
})
```

- [ ] **Step 3: Run the round-trip tests**

Run: `npx playwright test e2e/roundtrip.spec.ts`
Expected: all pass. If a rotated or cropped case fails, the bug is in the conversion between `coords` and `export`/`shapes`, not in the test: debug with `superpowers:systematic-debugging` by comparing the annotation's `/Rect` in the downloaded file with `userToViewport` for the page's rotation before changing anything.

- [ ] **Step 4: Write the README**

Replace `README.md` with:
```markdown
# PDF Annotator

A browser-based tool for marking up PDFs. Open a PDF, add highlights, underlines, strikethrough, rectangles, ellipses, lines, arrows, freehand pen strokes and text boxes, then download a PDF containing real PDF annotations. Everything runs in your browser; your file is never uploaded.

## Develop

    npm install
    npm run dev          # http://localhost:5173
    npm test             # unit tests (Vitest)
    npm run test:e2e     # end-to-end tests (Playwright; first run: npx playwright install chromium)
    npm run build        # type-check and production build into dist/

## How it works

- `src/model`: annotations as plain data in PDF units, with undo and redo.
- `src/coords`: conversion between PDF user space and screen pixels (page rotation, crop box, zoom).
- `src/shapes`: turns each annotation into PDF drawing operators (an appearance stream).
- `src/export`: writes native annotation objects plus appearance streams with pdf-lib.
- `src/render`, `src/ui`: pdf.js page rendering and the React editor.

The original upload is never modified; each download is built from the original bytes plus the current annotations.

## Deploy (Vercel)

Import the repository in Vercel. It detects Vite automatically: build command `npm run build`, output directory `dist`. There are no environment variables and no server.

## Limits (v1)

No text selection or search, no form-filling, no images or signatures, Helvetica only for text boxes (characters outside WinAnsi are replaced with `?` and listed after download), no password-protected PDFs, and a downloaded PDF's annotations cannot be re-opened for editing in this app (other viewers can edit them).

## Checking a release by hand

Automated tests render with pdf.js only. Before announcing a change to export, open a downloaded sample in Preview, Adobe Acrobat and Chrome and confirm, for one unrotated and one rotated page:

1. Every annotation type appears, in the right place and colour.
2. Highlights let the text underneath show through.
3. Text boxes show the right text, upright, with no background fill.
4. Arrowheads and pen strokes look like they did in the editor.
```

- [ ] **Step 5: Full verification**

Run: `npx vitest run && npm run build && npm run test:e2e`
Expected: everything passes.

- [ ] **Step 6: Manual cross-viewer check (needs the author)**

Produce `sample-annotated.pdf` by annotating any PDF in the running app with one of every tool, on a normal page and on a rotated page (use a scanned or phone-exported PDF if you have one). Open it in Preview, Acrobat and Chrome and tick the four items under "Checking a release by hand" in the README for each. Report any viewer that differs; text-box (FreeText) rendering is the most likely place, and the fallback in the spec's risk section applies.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "test: round-trip checks across rotation and crop box; add README" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
