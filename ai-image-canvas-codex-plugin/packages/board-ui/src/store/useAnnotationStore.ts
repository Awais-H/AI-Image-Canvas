import { create } from 'zustand'
import type { Shape } from '@ai-image-canvas/shared'

export function isAnnotationShape(shape: Shape) {
  return (
    shape.role === 'annotation_text' ||
    shape.role === 'annotation_arrow' ||
    shape.role === 'annotation_mark' ||
    shape.type === 'text' ||
    shape.type === 'arrow' ||
    (shape.type === 'geo' && shape.role === 'annotation_mark')
  )
}

interface AnnotationStore {
  shapes: Shape[]
  hydrate: (shapes: Shape[]) => void
  setShapes: (shapes: Shape[]) => void
  upsertShape: (shape: Shape) => void
  removeShape: (shapeId: string) => void
}

export const useAnnotationStore = create<AnnotationStore>((set) => ({
  shapes: [],
  hydrate: (shapes) => set({ shapes: shapes.filter(isAnnotationShape) }),
  setShapes: (shapes) => set({ shapes }),
  upsertShape: (shape) =>
    set((state) => {
      const next = state.shapes.filter((item) => item.id !== shape.id)
      return { shapes: [...next, shape] }
    }),
  removeShape: (shapeId) =>
    set((state) => ({
      shapes: state.shapes.filter((shape) => shape.id !== shapeId)
    }))
}))
