import { useEffect, useRef } from 'react'
import type { Bounds, Shape } from '@ai-image-canvas/shared'
import { assetUrl, deleteImageShape, fetchCanvasState, moveImageShape } from '../api'
import { useDrawingStore } from '../store/useDrawingStore'
import { isImageShape, isMovableImageShape, useImageStore } from '../store/useImageStore'

const MIN_IMAGE_SIZE = 64

interface DragState {
  shapeId: string
  pointerId: number
  offsetX: number
  offsetY: number
}

interface ResizeState {
  shapeId: string
  pointerId: number
  origin: Bounds
  startX: number
  startY: number
}

function ImageVisual({ shape }: { shape: Shape }) {
  if (!shape.assetPath) {
    if (shape.role !== 'image_holder') return null
    return (
      <div
        className="image-holder"
        style={{
          left: shape.bounds.x,
          top: shape.bounds.y,
          width: shape.bounds.w,
          height: shape.bounds.h
        }}
      />
    )
  }

  return (
    <img
      src={assetUrl(shape.assetPath)}
      alt={shape.label ?? 'Canvas image'}
      className="canvas-image pointer-events-none absolute select-none"
      style={{
        left: shape.bounds.x,
        top: shape.bounds.y,
        width: shape.bounds.w,
        height: shape.bounds.h
      }}
      draggable={false}
    />
  )
}

function ImageInteractionTarget({
  shape,
  isSelected,
  isDragging,
  isResizing,
  onSelect,
  onDragStart,
  onDragMove,
  onDragEnd,
  onResizeStart,
  onResizeMove,
  onResizeEnd
}: {
  shape: Shape
  isSelected: boolean
  isDragging: boolean
  isResizing: boolean
  onSelect: (shapeId: string) => void
  onDragStart: (shape: Shape, event: React.PointerEvent<HTMLDivElement>) => void
  onDragMove: (event: React.PointerEvent<HTMLDivElement>) => void
  onDragEnd: (event: React.PointerEvent<HTMLDivElement>) => void
  onResizeStart: (shape: Shape, event: React.PointerEvent<HTMLButtonElement>) => void
  onResizeMove: (event: React.PointerEvent<HTMLButtonElement>) => void
  onResizeEnd: (event: React.PointerEvent<HTMLButtonElement>) => void
}) {
  return (
    <div
      className={`image-interaction-target ${isSelected ? 'is-selected' : ''} ${isDragging ? 'is-dragging' : ''} ${isResizing ? 'is-resizing' : ''}`}
      style={{
        left: shape.bounds.x,
        top: shape.bounds.y,
        width: shape.bounds.w,
        height: shape.bounds.h
      }}
      onPointerDown={(event) => {
        event.stopPropagation()
        onSelect(shape.id)
        onDragStart(shape, event)
      }}
      onPointerMove={onDragMove}
      onPointerUp={onDragEnd}
      onPointerCancel={onDragEnd}
    >
      {isSelected ? (
        <button
          type="button"
          aria-label="Resize image"
          className="image-resize-handle"
          onPointerDown={(event) => {
            event.stopPropagation()
            onSelect(shape.id)
            onResizeStart(shape, event)
          }}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeEnd}
          onPointerCancel={onResizeEnd}
        />
      ) : null}
    </div>
  )
}

export function ImageLayer() {
  const activeTool = useDrawingStore((state) => state.activeTool)
  const interactionEnabled = activeTool !== 'pen' && activeTool !== 'eraser'

  const shapes = useImageStore((state) => state.shapes)
  const selectedShapeId = useImageStore((state) => state.selectedShapeId)
  const draggingShapeId = useImageStore((state) => state.draggingShapeId)
  const resizingShapeId = useImageStore((state) => state.resizingShapeId)
  const hydrate = useImageStore((state) => state.hydrate)
  const setSelectedShapeId = useImageStore((state) => state.setSelectedShapeId)
  const setDraggingShapeId = useImageStore((state) => state.setDraggingShapeId)
  const setResizingShapeId = useImageStore((state) => state.setResizingShapeId)
  const updateShapeBounds = useImageStore((state) => state.updateShapeBounds)
  const removeShape = useImageStore((state) => state.removeShape)

  const dragRef = useRef<DragState | null>(null)
  const resizeRef = useRef<ResizeState | null>(null)
  const layerRef = useRef<HTMLDivElement | null>(null)

  const movableShapes = shapes.filter(isMovableImageShape)

  useEffect(() => {
    if (interactionEnabled) return
    setSelectedShapeId(null)
    setDraggingShapeId(null)
    setResizingShapeId(null)
    dragRef.current = null
    resizeRef.current = null
  }, [interactionEnabled, setDraggingShapeId, setResizingShapeId, setSelectedShapeId])

  useEffect(() => {
    const syncImages = async () => {
      try {
        const state = await fetchCanvasState()
        const selected = state.document.selection.find((id) =>
          state.document.shapes.some((shape) => shape.id === id && isMovableImageShape(shape))
        )
        hydrate(state.document.shapes.filter(isImageShape), selected ?? null)
      } catch (err) {
        console.error('[board-ui] failed to sync images', err)
      }
    }

    const onFocus = () => {
      void syncImages()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [hydrate])

  useEffect(() => {
    if (!interactionEnabled) return

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('.image-interaction-target, .image-resize-handle')) return
      if (target?.closest('.annotation-editor, .annotation-editor-input')) return
      setSelectedShapeId(null)
    }

    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [interactionEnabled, setSelectedShapeId])

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false
      return Boolean(target.closest('input, textarea, [contenteditable="true"]'))
    }

    const deleteSelectedImage = async (shapeId: string) => {
      removeShape(shapeId)
      try {
        await deleteImageShape(shapeId)
      } catch (err) {
        console.error('[board-ui] failed to delete image', err)
        try {
          const state = await fetchCanvasState()
          hydrate(state.document.shapes.filter(isImageShape))
        } catch {
          // ignore resync failure
        }
      }
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return
      if (isEditableTarget(event.target)) return
      if (!interactionEnabled) return

      const { selectedShapeId: shapeId, draggingShapeId, resizingShapeId } = useImageStore.getState()
      if (!shapeId || draggingShapeId || resizingShapeId) return

      event.preventDefault()
      void deleteSelectedImage(shapeId)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [hydrate, interactionEnabled, removeShape])

  const persistShapeBounds = async (shapeId: string) => {
    const shape = useImageStore.getState().shapes.find((item) => item.id === shapeId)
    if (!shape) return

    try {
      const saved = await moveImageShape({
        shapeId: shape.id,
        x: shape.bounds.x,
        y: shape.bounds.y,
        w: shape.bounds.w,
        h: shape.bounds.h
      })
      useImageStore.getState().upsertShape(saved)
    } catch (err) {
      console.error('[board-ui] failed to update image', err)
      try {
        const state = await fetchCanvasState()
        hydrate(state.document.shapes.filter(isImageShape))
      } catch {
        // ignore resync failure
      }
    }
  }

  const onDragStart = (shape: Shape, event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactionEnabled || !isMovableImageShape(shape)) return

    const layer = layerRef.current
    if (!layer) return

    const rect = layer.getBoundingClientRect()
    dragRef.current = {
      shapeId: shape.id,
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left - shape.bounds.x,
      offsetY: event.clientY - rect.top - shape.bounds.y
    }
    setDraggingShapeId(shape.id)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onDragMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return

    const layer = layerRef.current
    if (!layer) return

    const rect = layer.getBoundingClientRect()
    const shape = shapes.find((item) => item.id === drag.shapeId)
    if (!shape) return

    const x = Math.round(event.clientX - rect.left - drag.offsetX)
    const y = Math.round(event.clientY - rect.top - drag.offsetY)
    updateShapeBounds(drag.shapeId, { ...shape.bounds, x, y })
  }

  const onDragEnd = async (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return

    dragRef.current = null
    setDraggingShapeId(null)

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    await persistShapeBounds(drag.shapeId)
  }

  const onResizeStart = (shape: Shape, event: React.PointerEvent<HTMLButtonElement>) => {
    if (!interactionEnabled) return

    resizeRef.current = {
      shapeId: shape.id,
      pointerId: event.pointerId,
      origin: { ...shape.bounds },
      startX: event.clientX,
      startY: event.clientY
    }
    setResizingShapeId(shape.id)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onResizeMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const resize = resizeRef.current
    if (!resize || resize.pointerId !== event.pointerId) return

    const dx = event.clientX - resize.startX
    const dy = event.clientY - resize.startY
    updateShapeBounds(resize.shapeId, {
      x: resize.origin.x,
      y: resize.origin.y,
      w: Math.max(MIN_IMAGE_SIZE, Math.round(resize.origin.w + dx)),
      h: Math.max(MIN_IMAGE_SIZE, Math.round(resize.origin.h + dy))
    })
  }

  const onResizeEnd = async (event: React.PointerEvent<HTMLButtonElement>) => {
    const resize = resizeRef.current
    if (!resize || resize.pointerId !== event.pointerId) return

    resizeRef.current = null
    setResizingShapeId(null)

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    await persistShapeBounds(resize.shapeId)
  }

  return (
    <>
      <div className="image-layer image-layer-visual pointer-events-none absolute inset-0 z-10">
        {movableShapes.map((shape) => (
          <ImageVisual key={shape.id} shape={shape} />
        ))}
      </div>

      {interactionEnabled ? (
        <div ref={layerRef} className="image-layer image-layer-interaction pointer-events-none absolute inset-0 z-40">
          {movableShapes.map((shape) => (
            <ImageInteractionTarget
              key={shape.id}
              shape={shape}
              isSelected={selectedShapeId === shape.id}
              isDragging={draggingShapeId === shape.id}
              isResizing={resizingShapeId === shape.id}
              onSelect={setSelectedShapeId}
              onDragStart={onDragStart}
              onDragMove={onDragMove}
              onDragEnd={onDragEnd}
              onResizeStart={onResizeStart}
              onResizeMove={onResizeMove}
              onResizeEnd={onResizeEnd}
            />
          ))}
        </div>
      ) : null}
    </>
  )
}
