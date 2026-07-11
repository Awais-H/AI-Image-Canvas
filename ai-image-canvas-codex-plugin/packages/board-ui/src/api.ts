import type { BoardDrawingDocument } from '@ai-image-canvas/shared/drawing'

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
