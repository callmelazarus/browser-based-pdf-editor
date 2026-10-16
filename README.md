# PDF Annotator

A browser-based tool for marking up PDFs. Open a PDF, add highlights, underlines, strikethrough, rectangles, ellipses, lines, arrows, freehand pen strokes and text boxes, then download a PDF containing real PDF annotations. Everything runs in your browser; your file is never uploaded.

**Live site: https://browser-based-pdf-editor.vercel.app/**

## Develop

Requires Node `^22.12.0 || ^24.0.0 || >=26.0.0` (Vitest 5's range, which is stricter than Vite 8's `^20.19.0 || >=22.12.0`).

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
- `src/render`, `src/ui`: pdf.js page rendering and the React editor. pdf.js's decoders (scanned-image wasm), CMaps, standard fonts and ICC profiles are copied from `node_modules` into `public/pdfjs/` by `scripts/copy-pdfjs-assets.mjs` (run automatically before `dev` and `build`) and served from the same origin, so no third-party request is ever made.

The original upload is never modified; each download is built from the original bytes plus the current annotations.

`e2e/roundtrip.spec.ts` checks the central property: it annotates a page, downloads the PDF, reopens the download so pdf.js renders the real annotations, and reads pixels to confirm everything landed where it was drawn, on pages rotated 0, 90, 180 and 270 and on pages with an offset crop box.

## Deploy (Vercel)

Import the repository in Vercel. It detects Vite automatically: build command `npm run build`, output directory `dist`. There are no environment variables and no server. The production deployment is at https://browser-based-pdf-editor.vercel.app/.

## Limits (v1)

No text selection or search, no form-filling, no images or signatures, Helvetica only for text boxes (characters outside WinAnsi are replaced with `?` and listed after download), no password-protected PDFs, and only annotations this app wrote can be edited again: it stores a private copy of each one in the PDF, so downloads made before that was added, and annotations from other apps, stay part of the page (other viewers can edit them). If another app edits one of this app's annotations, reopening it here brings back the original, not the edit.

## Checking a release by hand

Automated tests render with pdf.js only. Before announcing a change to export, annotate a sample in the app with one of every tool on an unrotated page and on a rotated page (a scanned or phone-exported PDF is ideal), download it, open it in Preview, Adobe Acrobat and Chrome, and confirm for each viewer:

1. Every annotation type appears, in the right place and colour.
2. Highlights let the text underneath show through.
3. Text boxes show the right text, upright, with no background fill.
4. Arrowheads and pen strokes look like they did in the editor.
5. Opacity: draw a 50% opacity highlight over text. Its darkness is the same in all three viewers and not noticeably lighter than in the app. The exporter writes the opacity both as the annotation's `/CA` and inside the appearance stream's ExtGState; a viewer that multiplies the two would show 25%. If one does, the one-line fix is in `src/export/export-pdf.ts`: set the appearance stream's `GS0` `ca`/`CA` to 1 and keep `/CA` in the dictionary, or drop the dictionary `/CA`.
6. Underline and strikethrough on a rotated page (`/Rotate 90`): the line sits along the same edge of the dragged rectangle in all three viewers (the QuadPoints are derived from the screen frame).
7. A text box containing curly quotes and an accented letter (for example `“café” it’s`) renders all of those characters in all three viewers.

Report any viewer that differs; text-box (FreeText) rendering is the most likely place.
