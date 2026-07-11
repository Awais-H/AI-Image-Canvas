import { useCallback, useEffect, useRef, type PointerEvent } from 'react'
import type { Stroke, StrokePoint } from '@ai-image-canvas/shared/drawing'
import penCursorIcon from '../assets/toolbar/pen_cursor.png'
import eraserCursorIcon from '../assets/toolbar/eraser_cursor.png'
import { useDrawingStore } from '../store/useDrawingStore'

interface DrawingCanvasProps {
  onStrokeComplete?: (stroke: Stroke) => void
}

interface ActiveStroke {
  tool: 'pen' | 'eraser'
  size: number
  color: Stroke['color']
  points: StrokePoint[]
}

export function DrawingCanvas({ onStrokeComplete }: DrawingCanvasProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const drawingRef = useRef<HTMLCanvasElement | null>(null)
  const activeStrokeRef = useRef<ActiveStroke | null>(null)
  const optimisticStrokeRef = useRef<Stroke | null>(null)
  const pointerIdRef = useRef<number | null>(null)
  const strokeEraserLastPointRef = useRef<StrokePoint | null>(null)
  const dprRef = useRef(1)

  const activeTool = useDrawingStore((state) => state.activeTool)
  const activeColor = useDrawingStore((state) => state.activeColor)
  const brushSize = useDrawingStore((state) => state.brushSize)
  const isThicknessPickerOpen = useDrawingStore((state) => state.isThicknessPickerOpen)
  const isEraserMenuOpen = useDrawingStore((state) => state.isEraserMenuOpen)
  const eraserMode = useDrawingStore((state) => state.eraserMode)
  const setThicknessPickerOpen = useDrawingStore((state) => state.setThicknessPickerOpen)
  const setEraserMenuOpen = useDrawingStore((state) => state.setEraserMenuOpen)
  const strokes = useDrawingStore((state) => state.drawing.strokes)
  const addStroke = useDrawingStore((state) => state.addStroke)
  const beginStrokeEraseSession = useDrawingStore((state) => state.beginStrokeEraseSession)
  const eraseStrokeAtPoint = useDrawingStore((state) => state.eraseStrokeAtPoint)
  const endStrokeEraseSession = useDrawingStore((state) => state.endStrokeEraseSession)

  const drawStroke = (ctx: CanvasRenderingContext2D, stroke: Stroke) => {
    if (stroke.points.length === 0) return

    ctx.save()
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over'
    ctx.strokeStyle = stroke.color

    if (stroke.points.length === 1) {
      const point = stroke.points[0]
      const pressure = Math.max(0.35, point.pressure || 0.5)
      ctx.beginPath()
      ctx.arc(point.x, point.y, (stroke.size * pressure) / 2, 0, Math.PI * 2)
      ctx.fillStyle = stroke.color
      ctx.fill()
      ctx.restore()
      return
    }

    const avgPressure =
      stroke.points.reduce((sum, point) => sum + Math.max(0.15, point.pressure || 0.5), 0) /
      Math.max(1, stroke.points.length)
    ctx.lineWidth = Math.max(1, stroke.size * avgPressure)

    ctx.beginPath()
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y)
    for (let i = 1; i < stroke.points.length - 1; i += 1) {
      const current = stroke.points[i]
      const next = stroke.points[i + 1]
      const midX = (current.x + next.x) / 2
      const midY = (current.y + next.y) / 2
      ctx.quadraticCurveTo(current.x, current.y, midX, midY)
    }
    const penultimate = stroke.points[stroke.points.length - 2]
    const last = stroke.points[stroke.points.length - 1]
    ctx.quadraticCurveTo(penultimate.x, penultimate.y, last.x, last.y)
    ctx.stroke()

    ctx.restore()
  }

  const repaintCanvas = useCallback(() => {
    const canvas = drawingRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = dprRef.current
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr)
    strokes.forEach((stroke) => drawStroke(ctx, stroke))
    if (optimisticStrokeRef.current) {
      drawStroke(ctx, optimisticStrokeRef.current)
    }
    if (activeStrokeRef.current) {
      drawStroke(ctx, activeStrokeRef.current)
    }
  }, [strokes])

  const resizeCanvas = useCallback(() => {
    const wrapper = wrapperRef.current
    const canvas = drawingRef.current
    if (!wrapper || !canvas) return

    const cssWidth = Math.max(1, Math.round(wrapper.clientWidth))
    const cssHeight = Math.max(1, Math.round(wrapper.clientHeight))
    const dpr = typeof window === 'undefined' ? 1 : Math.max(1, window.devicePixelRatio || 1)
    dprRef.current = dpr
    const nextWidth = Math.max(1, Math.round(cssWidth * dpr))
    const nextHeight = Math.max(1, Math.round(cssHeight * dpr))
    if (canvas.width !== nextWidth || canvas.height !== nextHeight || canvas.style.width !== `${cssWidth}px`) {
      canvas.width = nextWidth
      canvas.height = nextHeight
      canvas.style.width = `${cssWidth}px`
      canvas.style.height = `${cssHeight}px`
    }
    repaintCanvas()
  }, [repaintCanvas])

  useEffect(() => {
    resizeCanvas()
    const onWindowResize = () => resizeCanvas()
    window.addEventListener('resize', onWindowResize)

    if (typeof ResizeObserver === 'undefined') {
      return () => window.removeEventListener('resize', onWindowResize)
    }

    const observer = new ResizeObserver(() => resizeCanvas())
    if (wrapperRef.current) {
      observer.observe(wrapperRef.current)
    }

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', onWindowResize)
    }
  }, [resizeCanvas])

  useEffect(() => {
    optimisticStrokeRef.current = null
    repaintCanvas()
  }, [strokes, repaintCanvas])

  const pointFromClient = (clientX: number, clientY: number, pressure: number, rect: DOMRect): StrokePoint => ({
    x: clientX - rect.left,
    y: clientY - rect.top,
    pressure: pressure || 0.5,
    timestamp: performance.now()
  })

  const commitStroke = (stroke: Stroke) => {
    optimisticStrokeRef.current = stroke
    addStroke(stroke)
    onStrokeComplete?.(stroke)
    pointerIdRef.current = null
    activeStrokeRef.current = null
    repaintCanvas()
  }

  const eraseAlongPath = (start: StrokePoint, end: StrokePoint, radius: number) => {
    const dx = end.x - start.x
    const dy = end.y - start.y
    const distance = Math.hypot(dx, dy)
    if (distance === 0) {
      eraseStrokeAtPoint(end, radius, { silent: true })
      return
    }

    const step = Math.max(2, radius * 0.45)
    const samples = Math.max(1, Math.ceil(distance / step))
    for (let i = 1; i <= samples; i += 1) {
      const t = i / samples
      eraseStrokeAtPoint(
        {
          x: start.x + dx * t,
          y: start.y + dy * t
        },
        radius,
        { silent: true }
      )
    }
  }

  const endStroke = (event: PointerEvent<HTMLCanvasElement>) => {
    if (pointerIdRef.current !== event.pointerId || !activeStrokeRef.current) {
      return
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    commitStroke({
      ...activeStrokeRef.current,
      points: [...activeStrokeRef.current.points]
    })
  }

  const menuOpen = isThicknessPickerOpen || isEraserMenuOpen
  const isStrokeEraser = activeTool === 'eraser' && eraserMode === 'stroke'
  const isTextTool = activeTool === 'text'
  const drawCursor = menuOpen
    ? 'default'
    : isTextTool
      ? 'text'
      : activeTool === 'pen'
        ? `url(${penCursorIcon}) 3 20, crosshair`
        : `url(${eraserCursorIcon}) 10 30, crosshair`

  return (
    <div ref={wrapperRef} className="absolute inset-0 z-10">
      <canvas
        ref={drawingRef}
        className={`absolute inset-0 z-30 touch-none bg-transparent ${isTextTool ? 'pointer-events-none' : ''}`}
        style={{ touchAction: 'none', cursor: drawCursor }}
        onPointerDown={(event) => {
          if (isTextTool || menuOpen) {
            setThicknessPickerOpen(false)
            setEraserMenuOpen(false)
            return
          }
          if (event.pointerType === 'mouse' && event.button !== 0) {
            return
          }
          event.preventDefault()
          resizeCanvas()
          pointerIdRef.current = event.pointerId
          event.currentTarget.setPointerCapture(event.pointerId)
          const rect = event.currentTarget.getBoundingClientRect()
          const startPoint = pointFromClient(event.clientX, event.clientY, event.pressure, rect)
          if (isStrokeEraser) {
            beginStrokeEraseSession()
            strokeEraserLastPointRef.current = startPoint
            eraseStrokeAtPoint(startPoint, Math.max(6, brushSize * 1.4), { silent: true })
            return
          }
          activeStrokeRef.current = {
            tool: activeTool,
            size: brushSize,
            color: activeColor,
            points: [startPoint]
          }
          optimisticStrokeRef.current = null
          repaintCanvas()
        }}
        onPointerMove={(event) => {
          if (isTextTool || menuOpen) {
            return
          }
          if (isStrokeEraser) {
            if (pointerIdRef.current !== event.pointerId) {
              return
            }
            event.preventDefault()
            const rect = event.currentTarget.getBoundingClientRect()
            const radius = Math.max(6, brushSize * 1.4)
            const samples = event.nativeEvent.getCoalescedEvents?.() ?? [event.nativeEvent]
            for (const sample of samples) {
              const nextPoint = pointFromClient(sample.clientX, sample.clientY, sample.pressure, rect)
              const lastPoint = strokeEraserLastPointRef.current ?? nextPoint
              eraseAlongPath(lastPoint, nextPoint, radius)
              strokeEraserLastPointRef.current = nextPoint
            }
            return
          }
          if (pointerIdRef.current !== event.pointerId || !activeStrokeRef.current) {
            return
          }
          event.preventDefault()
          const rect = event.currentTarget.getBoundingClientRect()
          const coalesced = event.nativeEvent.getCoalescedEvents?.() ?? []
          if (coalesced.length > 0) {
            for (const sample of coalesced) {
              activeStrokeRef.current.points.push(
                pointFromClient(sample.clientX, sample.clientY, sample.pressure, rect)
              )
            }
          } else {
            activeStrokeRef.current.points.push(
              pointFromClient(event.clientX, event.clientY, event.pressure, rect)
            )
          }
          repaintCanvas()
        }}
        onPointerUp={(event) => {
          if (isStrokeEraser) {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId)
            }
            endStrokeEraseSession()
            pointerIdRef.current = null
            strokeEraserLastPointRef.current = null
            return
          }
          endStroke(event)
        }}
        onLostPointerCapture={() => {
          if (isStrokeEraser) {
            endStrokeEraseSession()
            pointerIdRef.current = null
            strokeEraserLastPointRef.current = null
            return
          }
          if (!activeStrokeRef.current) {
            return
          }
          commitStroke({
            ...activeStrokeRef.current,
            points: [...activeStrokeRef.current.points]
          })
        }}
        onPointerCancel={() => {
          if (isStrokeEraser) {
            endStrokeEraseSession()
          }
          pointerIdRef.current = null
          activeStrokeRef.current = null
          strokeEraserLastPointRef.current = null
          repaintCanvas()
        }}
      />
    </div>
  )
}
