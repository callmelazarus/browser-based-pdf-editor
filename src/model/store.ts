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
