# Browser-Based PDF Annotator: Design

Date: 2026-10-09
Status: Draft, awaiting review

## 1. Purpose and scope

A client-side web app for annotating PDFs. A user uploads a PDF, adds annotations over its pages (highlights, shapes, lines, freehand drawing, text boxes), and downloads a PDF containing those annotations. The PDF's own content is never edited.

- **Audience:** the author and anyone who visits the deployed site. Roughly one user at a time; scaling is not a goal.
- **Hosting:** Vercel, static files only. No backend, no database, no accounts. PDFs never leave the user's browser.
- **Success criteria:** a user can upload a multi-page PDF, annotate it, download it, and open the result in Preview, Acrobat and Chrome with every annotation in the place it was drawn and visually consistent across those viewers.

### Out of scope for v1

Reading or selecting page text; form-filling; images and signatures; custom fonts; password-protected PDFs; reopening a downloaded PDF to keep editing the annotations created by this app; saving work-in-progress in the browser.

## 2. Key decisions

| Decision | Choice | Rationale |
|---|---|---|
| Export format | Native PDF annotation objects, each with an explicit appearance stream (`/AP`) | Annotations stay real and editable in other viewers, and the explicit appearance stream keeps rendering consistent across viewers |
| Not chosen: flattening into page content | | Annotations would not remain annotations. Switching later is cheap because export is one isolated module |
| Not chosen: rasterizing pages | | Destroys vector quality and text |
| Rendering | `pdfjs-dist`, drawn to canvas at zoom x `devicePixelRatio` | Standard, and keeps pages sharp on high-DPI screens |
| PDF writing | `pdf-lib` | Low-level access to build annotation dictionaries and streams |
| Stack | TypeScript, Vite, React | Vercel deploys Vite out of the box. React suits the selection, toolbar and properties UI |
| Highlights | Dragged rectangles, not text selection | No text reading in v1 |

## 3. Architecture

Five units with narrow interfaces:

1. **`pdf-render`**: loads a PDF with `pdfjs-dist` and renders a page to a canvas at a given scale. Knows nothing about annotations.
2. **`model`**: annotation data and store. Each annotation has an ID, page index, type, geometry in **PDF units** (points, origin bottom-left), and style (color, opacity, stroke width, font size). Operations: add, update, delete, reorder, plus undo and redo. No UI or PDF code.
3. **`editor-ui`**: page view, interactive SVG overlay on each page canvas, toolbar and properties panel. Converts between screen pixels and PDF units for the current zoom. Reads and writes only `model`.
4. **`shapes`**: pure functions turning one annotation into PDF drawing instructions (a content-stream string plus bounding box). Shared by every export approach.
5. **`pdf-export`**: `exportPdf(originalBytes, annotations) -> Uint8Array`. Builds a native annotation dictionary and appearance stream per annotation using `shapes`, and writes the annotation ID into `/NM`.

**Data flow:** upload -> `pdf-render` shows pages -> user draws -> `model` updates -> overlay redraws. Download -> `exportPdf(original bytes, model)` -> file saved. The uploaded bytes are never modified; export always starts from them.

## 4. Annotation types

| Tool | Model geometry | PDF annotation |
|---|---|---|
| Highlight | rect | `/Highlight` with quad points; appearance stream uses a multiply blend so text beneath stays visible |
| Underline / Strikethrough | rect | `/Underline`, `/StrikeOut` |
| Rectangle / Ellipse | rect | `/Square`, `/Circle` |
| Line / Arrow | two points | `/Line`, arrow via line-ending style |
| Pen | list of points | `/Ink` |
| Text box | rect plus text | `/FreeText`, standard fonts only |

Highlight, underline and strikethrough are all dragged rectangles.

**Text box (v1):** Helvetica only, chosen size and color, left-aligned. Wrapping inside the box is computed by the app from measured glyph widths, because viewers will not reflow text drawn from an appearance stream. Characters outside the standard font's range are reported at export and not silently dropped.

## 5. Interaction

- Choose a tool, then drag on the page to create. Text boxes are created by drag, then typed into in place.
- Select tool: click to select, drag to move, drag handles to resize, Delete to remove. Pen strokes support move and delete only.
- Properties panel edits color, opacity, stroke width and font size for the selection or active tool.
- Continuous scroll through pages, zoom in and out, fit-to-width.
- Undo and redo (Cmd/Ctrl-Z) cover every change.

## 6. Export details

- Page rotation and crop box are applied when converting between screen and PDF coordinates. This is a known source of misplaced annotations and has dedicated tests.
- Each annotation carries its model ID in `/NM`. This is not used in v1 but allows reopening later.
- Per-annotation failures are collected and reported; one failure never blocks the rest.
- Switching export approaches later means replacing `pdf-export` only. `shapes`, `model` and `editor-ui` are unaffected.

## 7. Error handling

- Non-PDF, corrupt or unparsable files: clear message; the app stays on the upload screen.
- Password-protected PDFs: message that they are unsupported.
- Large files: render only pages near the viewport and release the rest, so a PDF with hundreds of pages does not freeze the tab.
- Export problems (unsupported characters, per-annotation failures): reported in a list.
- Leaving the page with unsaved annotations triggers a confirmation prompt.

## 8. Testing

- **Unit (Vitest):** coordinate conversion across zoom, page rotation and crop boxes; `shapes` output; `model` undo and redo.
- **Export:** generate a PDF, reload it with `pdf-lib` and assert annotation dictionaries and appearance streams; render with PDF.js and compare against reference images for each annotation type.
- **End-to-end (Playwright):** upload a sample PDF, draw with each tool, download, and verify the result.
- **Manual:** the author opens downloaded samples in Preview, Acrobat and Chrome. Acrobat and Preview cannot be run by the implementer.

## 9. Deployment

Vite builds static assets; Vercel serves them. No server, environment variables or database.

## 10. Risks

- **FreeText rendering** is the least uniform across viewers. Fallback: flatten only text boxes into page content, leaving all other annotation types native.
- **Cross-viewer verification** of Acrobat and Preview depends on manual checks.
- **Coordinate handling** for rotated or cropped pages must be covered by tests before other work builds on it.
