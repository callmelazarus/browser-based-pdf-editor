import { Icon } from './icons'
import type { Tool } from './tools'

const GROUPS: { label: string | null; tools: { id: Tool; label: string }[] }[] = [
  { label: null, tools: [{ id: 'select', label: 'Select' }] },
  {
    label: 'Markup',
    tools: [
      { id: 'highlight', label: 'Highlight' },
      { id: 'underline', label: 'Underline' },
      { id: 'strikeout', label: 'Strikethrough' },
    ],
  },
  {
    label: 'Shapes',
    tools: [
      { id: 'rectangle', label: 'Rectangle' },
      { id: 'ellipse', label: 'Ellipse' },
      { id: 'line', label: 'Line' },
      { id: 'arrow', label: 'Arrow' },
    ],
  },
  {
    label: 'Draw',
    tools: [
      { id: 'pen', label: 'Pen' },
      { id: 'text', label: 'Text' },
    ],
  },
]

interface Props {
  tool: Tool
  onTool: (t: Tool) => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
}

/** Left rail: the drawing tools in labelled groups, with Undo and Redo underneath. */
export function Toolbar({ tool, onTool, canUndo, canRedo, onUndo, onRedo }: Props) {
  return (
    <nav className="rail" aria-label="Editing tools">
      <div role="toolbar" aria-label="Tools" aria-orientation="vertical" className="rail-tools">
        {GROUPS.map((g) => (
          <div className="rail-group" key={g.label ?? 'select'}>
            {g.label && <div className="rail-label">{g.label}</div>}
            {g.tools.map((t) => (
              <button
                key={t.id}
                className="rail-button"
                data-testid={`tool-${t.id}`}
                aria-pressed={tool === t.id}
                onClick={() => onTool(t.id)}
              >
                <Icon name={t.id} />
                <span>{t.label}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
      <hr className="rail-divider" />
      <div role="group" aria-label="History" className="rail-group">
        <button className="rail-button" data-testid="undo-button" disabled={!canUndo} onClick={onUndo}>
          <Icon name="undo" />
          <span>Undo</span>
        </button>
        <button className="rail-button" data-testid="redo-button" disabled={!canRedo} onClick={onRedo}>
          <Icon name="redo" />
          <span>Redo</span>
        </button>
      </div>
    </nav>
  )
}
