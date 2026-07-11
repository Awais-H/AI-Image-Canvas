import { create } from 'zustand'
import type { Bounds, Shape } from '@ai-image-canvas/shared'

export function isImageShape(shape: Shape) {
  return shape.type === 'image' || shape.role === 'ai_image' || shape.role === 'image_holder'
}

export function isMovableImageShape(shape: Shape) {
  return Boolean(shape.assetPath) && (shape.type === 'image' || shape.role === 'ai_image')
}

interface ImageStore {
  shapes: Shape[]
  selectedShapeId: string | null
  draggingShapeId: string | null
  resizingShapeId: string | null
  hydrate: (shapes: Shape[], selectedShapeId?: string | null) => void
  upsertShape: (shape: Shape) => void
  setSelectedShapeId: (shapeId: string | null) => void
  setDraggingShapeId: (shapeId: string | null) => void
  setResizingShapeId: (shapeId: string | null) => void
  updateShapeBounds: (shapeId: string, bounds: Bounds) => void
  removeShape: (shapeId: string) => void
}

export const useImageStore = create<ImageStore>((set) => ({
  shapes: [],
  selectedShapeId: null,
  draggingShapeId: null,
  resizingShapeId: null,
  hydrate: (shapes, selectedShapeId = null) =>
    set({
      shapes: shapes.filter(isImageShape),
      selectedShapeId: selectedShapeId ?? null
    }),
  upsertShape: (shape) =>
    set((state) => {
      const next = state.shapes.filter((item) => item.id !== shape.id)
      return { shapes: [...next, shape], selectedShapeId: shape.id }
    }),
  setSelectedShapeId: (shapeId) => set({ selectedShapeId: shapeId }),
  setDraggingShapeId: (shapeId) => set({ draggingShapeId: shapeId }),
  setResizingShapeId: (shapeId) => set({ resizingShapeId: shapeId }),
  updateShapeBounds: (shapeId, bounds) =>
    set((state) => ({
      shapes: state.shapes.map((shape) => (shape.id === shapeId ? { ...shape, bounds } : shape))
    })),
  removeShape: (shapeId) =>
    set((state) => ({
      shapes: state.shapes.filter((shape) => shape.id !== shapeId),
      selectedShapeId: state.selectedShapeId === shapeId ? null : state.selectedShapeId
    }))
}))
