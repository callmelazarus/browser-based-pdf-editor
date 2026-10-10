import { useState } from 'react'
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
          <FontSizeInput value={style.fontSize} onChange={(v) => onChange({ fontSize: v }, 'fontSize')} />
        </label>
      )}
      {hasSelection && (
        <button className="button" data-testid="bring-front" onClick={onBringToFront}>Bring to front</button>
      )}
    </aside>
  )
}

const FONT_MIN = 8
const FONT_MAX = 72

/**
 * Keeps the raw text while typing so intermediate values ("1" on the way to "12") are allowed.
 * Valid values are committed as you type; blur or Enter clamps, and empty/invalid reverts.
 */
function FontSizeInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [text, setText] = useState(String(value))
  const [seen, setSeen] = useState(value)
  // Resync when the stored value changes from elsewhere (undo/redo, another annotation).
  if (seen !== value) {
    setSeen(value)
    if (Number(text) !== value) setText(String(value))
  }
  const finish = () => {
    const n = Number(text)
    if (text.trim() === '' || !Number.isFinite(n)) {
      setText(String(value))
      return
    }
    const clamped = Math.min(FONT_MAX, Math.max(FONT_MIN, n))
    setText(String(clamped))
    if (clamped !== value) onChange(clamped)
  }
  return (
    <input
      type="number" data-testid="prop-fontsize" min={FONT_MIN} max={FONT_MAX} value={text}
      onChange={(e) => {
        setText(e.target.value)
        const n = Number(e.target.value)
        if (e.target.value.trim() !== '' && Number.isFinite(n) && n >= FONT_MIN && n <= FONT_MAX) onChange(n)
      }}
      onBlur={finish}
      onKeyDown={(e) => {
        if (e.key === 'Enter') finish()
      }}
    />
  )
}
