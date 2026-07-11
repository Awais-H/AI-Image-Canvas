import { useEffect, useRef, useState } from 'react'
import { fetchCanvasState, fetchDrawing, openBoard, saveDrawing } from '../api'
import { isAnnotationShape, useAnnotationStore } from '../store/useAnnotationStore'
import { isImageShape, useImageStore } from '../store/useImageStore'
import { useDrawingStore } from '../store/useDrawingStore'

function boardIdFromLocation() {
  return new URLSearchParams(window.location.search).get('board') ?? undefined
}

function setBoardInLocation(canvasId: string) {
  const url = new URL(window.location.href)
  url.searchParams.set('board', canvasId)
  window.history.replaceState({}, '', url)
}

export function useBoardBootstrap() {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [canvasId, setCanvasId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const requestedId = boardIdFromLocation()
        const opened = await openBoard(requestedId)
        if (cancelled) return
        setCanvasId(opened.canvasId)
        setBoardInLocation(opened.canvasId)
        const [document, canvasState] = await Promise.all([fetchDrawing(), fetchCanvasState()])
        if (cancelled) return
        useDrawingStore.getState().hydrate(document)
        useAnnotationStore.getState().hydrate(canvasState.document.shapes.filter(isAnnotationShape))
        useImageStore.getState().hydrate(canvasState.document.shapes.filter(isImageShape))
        setStatus('ready')
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load board')
        setStatus('error')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return { status, error, canvasId }
}

export function useDrawingPersistence(enabled: boolean) {
  const saveTimer = useRef<number | null>(null)
  const lastSerialized = useRef('')

  useEffect(() => {
    if (!enabled) return

    lastSerialized.current = JSON.stringify(useDrawingStore.getState().toDocument())

    const scheduleSave = () => {
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current)
      }
      saveTimer.current = window.setTimeout(async () => {
        const document = useDrawingStore.getState().toDocument()
        const serialized = JSON.stringify(document)
        if (serialized === lastSerialized.current) {
          return
        }
        try {
          const saved = await saveDrawing(document)
          lastSerialized.current = JSON.stringify(saved)
        } catch (err) {
          console.error('[board-ui] failed to save drawing', err)
        }
      }, 400)
    }

    const unsubscribe = useDrawingStore.subscribe(scheduleSave)
    return () => {
      unsubscribe()
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current)
      }
    }
  }, [enabled])
}
