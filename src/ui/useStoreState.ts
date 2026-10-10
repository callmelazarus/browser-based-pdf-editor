import { useSyncExternalStore } from 'react'
import type { AnnotationStore, StoreState } from '../model/store'

export function useStoreState(store: AnnotationStore): StoreState {
  return useSyncExternalStore(store.subscribe, store.getState)
}
