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
