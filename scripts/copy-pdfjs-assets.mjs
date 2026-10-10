// Copies pdf.js's decoder assets (JBIG2/JPX/QCMS wasm, CMaps, standard fonts, ICC profiles) into
// public/pdfjs/ so they are served same-origin. The app must never contact a third-party host.
import { cp, mkdir, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const from = join(root, 'node_modules', 'pdfjs-dist')
const to = join(root, 'public', 'pdfjs')

await rm(to, { recursive: true, force: true })
await mkdir(to, { recursive: true })
for (const dir of ['wasm', 'cmaps', 'standard_fonts', 'iccs']) {
  await cp(join(from, dir), join(to, dir), { recursive: true })
}
console.log('pdfjs assets copied to public/pdfjs')
