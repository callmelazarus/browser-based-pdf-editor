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
