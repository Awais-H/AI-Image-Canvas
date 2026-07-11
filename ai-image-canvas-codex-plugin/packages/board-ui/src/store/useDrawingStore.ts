import { create } from 'zustand'
import {
  defaultDrawingPreferences,
  defaultDrawingState,
  type BoardDrawingDocument,
  type DrawingColor,
  type DrawingState,
  type DrawingTool,
  type EraserMode,
  type Stroke
} from '@ai-image-canvas/shared/drawing'

const pointDistance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)

const pointToSegmentDistance = (
  point: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number }
) => {
  const abx = b.x - a.x
  const aby = b.y - a.y
  const apx = point.x - a.x
  const apy = point.y - a.y
  const abLenSq = abx * abx + aby * aby
  if (abLenSq === 0) {
    return pointDistance(point, a)
  }

  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / abLenSq))
  const closest = { x: a.x + abx * t, y: a.y + aby * t }
  return pointDistance(point, closest)
}

const filterStrokesAtPoint = (strokes: Stroke[], point: { x: number; y: number }, radius: number) =>
  strokes.filter((stroke) => {
    if (stroke.points.length === 0) {
      return true
    }
    if (stroke.points.length === 1) {
      return pointDistance(stroke.points[0], point) > radius
    }

    for (let i = 1; i < stroke.points.length; i += 1) {
      if (pointToSegmentDistance(point, stroke.points[i - 1], stroke.points[i]) <= radius) {
        return false
      }
    }
    return true
  })

let strokeEraseSessionBefore: Stroke[] | null = null

interface DrawingStore {
  hydrated: boolean
  drawing: DrawingState
  activeTool: DrawingTool
  activeColor: DrawingColor
  brushSize: number
  isThicknessPickerOpen: boolean
  isEraserMenuOpen: boolean
  eraserMode: EraserMode
  hydrate: (document: BoardDrawingDocument) => void
  toDocument: () => BoardDrawingDocument
  setActiveTool: (tool: DrawingTool) => void
  setActiveColor: (color: DrawingColor) => void
  setBrushSize: (size: number) => void
  setThicknessPickerOpen: (isOpen: boolean) => void
  setEraserMenuOpen: (isOpen: boolean) => void
  setEraserMode: (mode: EraserMode) => void
  addStroke: (stroke: Stroke) => void
  beginStrokeEraseSession: () => void
  eraseStrokeAtPoint: (
    point: { x: number; y: number },
    radius: number,
    options?: { silent?: boolean }
  ) => void
  endStrokeEraseSession: () => void
  undo: () => void
  redo: () => void
  clearDrawing: () => void
}

export const useDrawingStore = create<DrawingStore>((set, get) => ({
  hydrated: false,
  drawing: defaultDrawingState(),
  ...defaultDrawingPreferences(),
  isThicknessPickerOpen: false,
  isEraserMenuOpen: false,
  hydrate: (document) =>
    set({
      hydrated: true,
      drawing: document.drawing,
      activeTool: document.preferences.activeTool,
      activeColor: document.preferences.activeColor,
      brushSize: document.preferences.brushSize,
      eraserMode: document.preferences.eraserMode
    }),
  toDocument: () => {
    const state = get()
    return {
      layerId: 'main',
      drawing: state.drawing,
      preferences: {
        activeTool: state.activeTool,
        activeColor: state.activeColor,
        brushSize: state.brushSize,
        eraserMode: state.eraserMode
      },
      updatedAt: new Date().toISOString()
    }
  },
  setActiveTool: (tool) => set({ activeTool: tool }),
  setActiveColor: (color) => set({ activeColor: color }),
  setBrushSize: (size) => set({ brushSize: size }),
  setThicknessPickerOpen: (isOpen) => set({ isThicknessPickerOpen: isOpen }),
  setEraserMenuOpen: (isOpen) => set({ isEraserMenuOpen: isOpen }),
  setEraserMode: (mode) => set({ eraserMode: mode }),
  addStroke: (stroke) =>
    set((state) => {
      const before = state.drawing.strokes
      const after = [...before, stroke]
      return {
        drawing: {
          strokes: after,
          history: [...state.drawing.history, { before, after }],
          future: []
        }
      }
    }),
  beginStrokeEraseSession: () => {
    strokeEraseSessionBefore = [...get().drawing.strokes]
  },
  eraseStrokeAtPoint: (point, radius, options) =>
    set((state) => {
      if (state.drawing.strokes.length === 0) {
        return state
      }

      const filtered = filterStrokesAtPoint(state.drawing.strokes, point, radius)
      if (filtered.length === state.drawing.strokes.length) {
        return state
      }

      const after = filtered
      if (options?.silent) {
        return {
          drawing: {
            ...state.drawing,
            strokes: after
          }
        }
      }

      const before = state.drawing.strokes
      return {
        drawing: {
          strokes: after,
          history: [...state.drawing.history, { before, after }],
          future: []
        }
      }
    }),
  endStrokeEraseSession: () =>
    set((state) => {
      if (strokeEraseSessionBefore === null) {
        return state
      }

      const before = strokeEraseSessionBefore
      strokeEraseSessionBefore = null
      const after = state.drawing.strokes
      if (after.length === before.length) {
        return state
      }

      return {
        drawing: {
          strokes: after,
          history: [...state.drawing.history, { before, after }],
          future: []
        }
      }
    }),
  undo: () =>
    set((state) => {
      if (state.drawing.history.length === 0) {
        return state
      }
      const lastEntry = state.drawing.history[state.drawing.history.length - 1]
      return {
        drawing: {
          strokes: lastEntry.before,
          history: state.drawing.history.slice(0, -1),
          future: [...state.drawing.future, lastEntry]
        }
      }
    }),
  redo: () =>
    set((state) => {
      if (state.drawing.future.length === 0) {
        return state
      }
      const nextEntry = state.drawing.future[state.drawing.future.length - 1]
      return {
        drawing: {
          strokes: nextEntry.after,
          history: [...state.drawing.history, nextEntry],
          future: state.drawing.future.slice(0, -1)
        }
      }
    }),
  clearDrawing: () =>
    set((state) => {
      const before = state.drawing.strokes
      const after: Stroke[] = []
      return {
        drawing: {
          strokes: after,
          history: [...state.drawing.history, { before, after }],
          future: []
        }
      }
    })
}))
