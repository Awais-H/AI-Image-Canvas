import { useEffect, useRef, useState } from 'react'
import type { Shape } from '@ai-image-canvas/shared'
import { annotateBoard, fetchCanvasState } from '../api'
import { isAnnotationShape, useAnnotationStore } from '../store/useAnnotationStore'
import { useDrawingStore } from '../store/useDrawingStore'

interface PendingText {
  x: number
  y: number
}

function TextAnnotation({
  shape,
  onEdit
}: {
  shape: Shape
  onEdit: (shape: Shape) => void
}) {
  return (
    <button
      type="button"
      className="annotation-text-label"
      style={{
        left: shape.bounds.x,
        top: shape.bounds.y,
        minWidth: shape.bounds.w,
        minHeight: shape.bounds.h,
        color: shape.color ?? '#111111'
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation()
        onEdit(shape)
      }}
      title="Click to edit"
    >
      {shape.text}
    </button>
  )
}

function ArrowAnnotation({ shape }: { shape: Shape }) {
  const start = shape.arrowStart ?? { x: shape.bounds.x, y: shape.bounds.y }
  const end = shape.arrowEnd ?? {
    x: shape.bounds.x + shape.bounds.w,
    y: shape.bounds.y + shape.bounds.h
  }
  const color = shape.color ?? '#ef4444'

  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
      <defs>
        <marker id={`arrowhead-${shape.id}`} markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" fill={color} />
        </marker>
      </defs>
      <line
        x1={start.x}
        y1={start.y}
        x2={end.x}
        y2={end.y}
        stroke={color}
        strokeWidth="2.5"
        markerEnd={`url(#arrowhead-${shape.id})`}
      />
    </svg>
  )
}

function MarkAnnotation({ shape }: { shape: Shape }) {
  return (
    <div
      className="annotation-mark"
      style={{
        left: shape.bounds.x,
        top: shape.bounds.y,
        width: shape.bounds.w,
        height: shape.bounds.h,
        borderColor: shape.color ?? '#eab308'
      }}
    />
  )
}

export function AnnotationLayer() {
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const [pendingText, setPendingText] = useState<PendingText | null>(null)
  const [editingShape, setEditingShape] = useState<Shape | null>(null)
  const [draft, setDraft] = useState('')

  const activeTool = useDrawingStore((state) => state.activeTool)
  const shapes = useAnnotationStore((state) => state.shapes)
  const upsertShape = useAnnotationStore((state) => state.upsertShape)
  const removeShape = useAnnotationStore((state) => state.removeShape)
  const hydrate = useAnnotationStore((state) => state.hydrate)

  useEffect(() => {
    const syncAnnotations = async () => {
      try {
        const state = await fetchCanvasState()
        hydrate(state.document.shapes.filter(isAnnotationShape))
      } catch (err) {
        console.error('[board-ui] failed to sync annotations', err)
      }
    }

    const onFocus = () => {
      void syncAnnotations()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [hydrate])

  useEffect(() => {
    if ((pendingText || editingShape) && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [pendingText, editingShape])

  const closeEditor = () => {
    setPendingText(null)
    setEditingShape(null)
    setDraft('')
  }

  const commitEditor = async () => {
    const text = draft.trim()
    const currentEdit = editingShape
    const currentPending = pendingText

    if (!text) {
      closeEditor()
      return
    }

    closeEditor()

    try {
      if (currentEdit) {
        const result = await annotateBoard({
          action: 'update',
          shapeId: currentEdit.id,
          text
        })
        if ('shape' in result) upsertShape(result.shape)
      } else if (currentPending) {
        const result = await annotateBoard({
          action: 'create',
          annotations: [{ kind: 'text', text, x: currentPending.x, y: currentPending.y }]
        })
        if ('shapes' in result) {
          const created = result.shapes[0]
          if (created) upsertShape(created)
        }
      }
    } catch (err) {
      console.error('[board-ui] failed to save annotation', err)
      try {
        const state = await fetchCanvasState()
        hydrate(state.document.shapes.filter(isAnnotationShape))
      } catch {
        // ignore resync failure
      }
    }
  }

  const deleteShape = (shapeId: string) => {
    removeShape(shapeId)
    closeEditor()

    void annotateBoard({ action: 'delete', shapeId }).catch(async (err) => {
      console.error('[board-ui] failed to delete annotation', err)
      try {
        const state = await fetchCanvasState()
        hydrate(state.document.shapes.filter(isAnnotationShape))
      } catch {
        // ignore resync failure
      }
    })
  }

  const onLayerPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (activeTool !== 'text') return
    if (pendingText || editingShape) return
    if (event.target !== event.currentTarget) return

    const rect = event.currentTarget.getBoundingClientRect()
    setPendingText({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    })
    setDraft('')
  }

  const onEditShape = (shape: Shape) => {
    setEditingShape(shape)
    setPendingText(null)
    setDraft(shape.text ?? '')
  }

  const editorPosition = editingShape
    ? { x: editingShape.bounds.x, y: editingShape.bounds.y }
    : pendingText

  const editingShapeId = editingShape?.id

  return (
    <div
      className={`annotation-layer absolute inset-0 z-20 ${activeTool === 'text' ? 'is-text-tool' : ''}`}
      onPointerDown={onLayerPointerDown}
    >
      {shapes.map((shape) => {
        if (shape.id === editingShapeId) return null

        if (shape.type === 'text' || shape.role === 'annotation_text') {
          return <TextAnnotation key={shape.id} shape={shape} onEdit={onEditShape} />
        }
        if (shape.type === 'arrow' || shape.role === 'annotation_arrow') {
          return <ArrowAnnotation key={shape.id} shape={shape} />
        }
        if (shape.role === 'annotation_mark') {
          return <MarkAnnotation key={shape.id} shape={shape} />
        }
        return null
      })}

      {editorPosition ? (
        <div
          className="annotation-editor"
          style={{ left: editorPosition.x, top: editorPosition.y }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <textarea
            ref={inputRef}
            value={draft}
            rows={2}
            className="annotation-editor-input"
            placeholder="Type annotation..."
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                closeEditor()
                return
              }
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void commitEditor()
              }
            }}
          />
          <div className="annotation-editor-actions">
            <button
              type="button"
              className="annotation-editor-button"
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => void commitEditor()}
            >
              Save
            </button>
            {editingShapeId ? (
              <button
                type="button"
                className="annotation-editor-button is-danger"
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => deleteShape(editingShapeId)}
              >
                Delete
              </button>
            ) : null}
            <button
              type="button"
              className="annotation-editor-button"
              onPointerDown={(event) => event.preventDefault()}
              onClick={closeEditor}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
