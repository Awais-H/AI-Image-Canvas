export type DrawingTool = 'pen' | 'eraser' | 'text'
export type DrawingColor = '#111111' | '#ef4444' | '#22c55e' | '#eab308' | '#2279fa' | '#a855f7'
export type EraserMode = 'normal' | 'stroke'

export interface StrokePoint {
  x: number
  y: number
  pressure: number
  timestamp: number
}

export interface Stroke {
  tool: DrawingTool
  size: number
  color: DrawingColor
  points: StrokePoint[]
}

export interface DrawingHistoryEntry {
  before: Stroke[]
  after: Stroke[]
}

export interface DrawingState {
  strokes: Stroke[]
  history: DrawingHistoryEntry[]
  future: DrawingHistoryEntry[]
}

export interface DrawingPreferences {
  activeTool: DrawingTool
  activeColor: DrawingColor
  brushSize: number
  eraserMode: EraserMode
}

export interface BoardDrawingDocument {
  layerId: string
  drawing: DrawingState
  preferences: DrawingPreferences
  updatedAt: string
}

export const defaultDrawingState = (): DrawingState => ({
  strokes: [],
  history: [],
  future: []
})

export const defaultDrawingPreferences = (): DrawingPreferences => ({
  activeTool: 'pen',
  activeColor: '#111111',
  brushSize: 3,
  eraserMode: 'normal'
})
