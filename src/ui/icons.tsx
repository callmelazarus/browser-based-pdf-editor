import type { ReactElement } from 'react'
import type { Tool } from './tools'

export type IconName = Tool | 'undo' | 'redo'

const PATHS: Record<IconName, ReactElement> = {
  select: <path d="M5 3l14 7-6 2-2 6z" />,
  highlight: (
    <>
      <path d="M14 4l6 6-8 8-6-6z" />
      <path d="M4 21h8" />
    </>
  ),
  underline: (
    <>
      <path d="M7 4v8a5 5 0 0010 0V4" />
      <path d="M5 21h14" />
    </>
  ),
  strikeout: (
    <>
      <path d="M17 7c-1-2-3-3-5-3-3 0-5 1.5-5 3.5S9 11 12 12s5 2 5 4.5S15 20 12 20c-2 0-4-1-5-3" />
      <path d="M4 12h16" />
    </>
  ),
  rectangle: <rect x="4" y="6" width="16" height="12" rx="1" />,
  ellipse: <ellipse cx="12" cy="12" rx="8" ry="6" />,
  line: <path d="M5 19L19 5" />,
  arrow: (
    <>
      <path d="M5 19L19 5" />
      <path d="M9 5h10v10" />
    </>
  ),
  pen: (
    <>
      <path d="M4 20l1-4L16 5l3 3L8 19z" />
      <path d="M14 7l3 3" />
    </>
  ),
  text: (
    <>
      <path d="M5 6V4h14v2" />
      <path d="M12 4v16" />
      <path d="M9 20h6" />
    </>
  ),
  undo: (
    <>
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h10a6 6 0 010 12h-3" />
    </>
  ),
  redo: (
    <>
      <path d="M15 14l5-5-5-5" />
      <path d="M20 9H10a6 6 0 000 12h3" />
    </>
  ),
}

/** Decorative line icon; the button that holds it carries the accessible name. */
export function Icon({ name }: { name: IconName }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {PATHS[name]}
    </svg>
  )
}
