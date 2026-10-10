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

  it('selecting another annotation ends the coalescing run', () => {
    const s = createStore([rect('a', 0.5), rect('b', 0.5)])
    s.update('a', { opacity: 0.6 }, 'opacity')
    s.select('b')
    s.select('a')
    s.update('a', { opacity: 0.7 }, 'opacity')
    s.undo()
    expect(s.getState().annotations[0].opacity).toBe(0.6)
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
