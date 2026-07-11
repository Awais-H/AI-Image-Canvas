import type { BoardDrawingDocument } from '@ai-image-canvas/shared/drawing'
import type { CanvasDocument, Shape } from '@ai-image-canvas/shared'

type AnnotateInput = {
  action?: 'create' | 'update' | 'delete' | 'list'
  annotations?: Array<{
    kind: 'text' | 'arrow' | 'mark'
    text?: string
    x: number
    y: number
    w?: number
    h?: number
    color?: string
    arrowStart?: { x: number; y: number }
    arrowEnd?: { x: number; y: number }
  }>
  shapeId?: string
  shapeIds?: string[]
  text?: string
  bounds?: { x: number; y: number; w: number; h: number }
  color?: string
  role?: string
  type?: string
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `Request failed: ${response.status}`)
  }
  return response.json() as Promise<T>
}

export async function openBoard(canvasId?: string) {
  return request<{ canvasId: string; boardUrl: string; alreadyOpen: boolean }>('POST', '/api/canvas/open', {
    canvasId
  })
}

export async function fetchDrawing() {
  return request<BoardDrawingDocument>('GET', '/api/drawing')
}

export async function saveDrawing(document: BoardDrawingDocument) {
  return request<BoardDrawingDocument>('PUT', '/api/drawing', document)
}

export async function fetchCanvasState() {
  return request<{ canvasId: string; storagePath: string; document: CanvasDocument }>('GET', '/api/canvas/state')
}

export async function annotateBoard(input: AnnotateInput) {
  return request<
    | { shapes: Shape[] }
    | { shape: Shape }
    | { deleted: string[] }
    | Shape[]
  >('POST', '/api/canvas/annotate', input)
}
