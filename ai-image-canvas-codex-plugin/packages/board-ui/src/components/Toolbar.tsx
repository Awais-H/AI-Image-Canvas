import { useState } from 'react'
import type { DrawingColor } from '@ai-image-canvas/shared/drawing'
import penIcon from '../assets/toolbar/pen.png'
import eraserIcon from '../assets/toolbar/eraser.png'
import { useDrawingStore } from '../store/useDrawingStore'

export function Toolbar() {
  const [thicknessAnchorTool, setThicknessAnchorTool] = useState<'pen' | 'eraser'>('pen')
  const activeTool = useDrawingStore((state) => state.activeTool)
  const activeColor = useDrawingStore((state) => state.activeColor)
  const brushSize = useDrawingStore((state) => state.brushSize)
  const isThicknessPickerOpen = useDrawingStore((state) => state.isThicknessPickerOpen)
  const isEraserMenuOpen = useDrawingStore((state) => state.isEraserMenuOpen)
  const eraserMode = useDrawingStore((state) => state.eraserMode)
  const history = useDrawingStore((state) => state.drawing.history)
  const future = useDrawingStore((state) => state.drawing.future)
  const setActiveTool = useDrawingStore((state) => state.setActiveTool)
  const setActiveColor = useDrawingStore((state) => state.setActiveColor)
  const setBrushSize = useDrawingStore((state) => state.setBrushSize)
  const setThicknessPickerOpen = useDrawingStore((state) => state.setThicknessPickerOpen)
  const setEraserMenuOpen = useDrawingStore((state) => state.setEraserMenuOpen)
  const setEraserMode = useDrawingStore((state) => state.setEraserMode)
  const undo = useDrawingStore((state) => state.undo)
  const redo = useDrawingStore((state) => state.redo)

  const colorOptions: DrawingColor[] = ['#111111', '#ef4444', '#22c55e', '#eab308', '#2279fa', '#a855f7']
  const thicknessOptions = [2, 4, 6, 8, 12, 16]
  const canUndo = history.length > 0
  const canRedo = future.length > 0

  const onToolClick = (tool: 'pen' | 'eraser' | 'text') => {
    if (tool === 'text') {
      setActiveTool('text')
      setThicknessPickerOpen(false)
      setEraserMenuOpen(false)
      return
    }

    if (activeTool === tool) {
      if (tool === 'eraser') {
        setEraserMenuOpen(!isEraserMenuOpen)
        setThicknessPickerOpen(false)
        setThicknessAnchorTool('eraser')
      } else {
        setThicknessPickerOpen(!isThicknessPickerOpen)
        setEraserMenuOpen(false)
        setThicknessAnchorTool('pen')
      }
      return
    }

    setActiveTool(tool)
    setThicknessPickerOpen(false)
    setEraserMenuOpen(false)
  }

  return (
    <div className="toolbar-shell relative z-40">
      <div className="workspace-toolbar flex items-center rounded-full border border-neutral-200 bg-white shadow-sm backdrop-blur-sm">
        <button
          type="button"
          aria-label="Pen tool"
          className={`toolbar-icon-button relative ${activeTool === 'pen' ? 'is-active' : ''}`}
          onClick={() => onToolClick('pen')}
        >
          <img src={penIcon} alt="" className="relative z-10 h-8 w-8" />
        </button>
        {isThicknessPickerOpen && thicknessAnchorTool === 'pen' ? (
          <div className="toolbar-popover thickness-picker absolute left-0 top-[calc(100%+10px)] rounded-full border border-neutral-200 bg-white px-3 py-2 shadow-md">
            <div className="flex items-center gap-2">
              {thicknessOptions.map((size) => (
                <button
                  key={size}
                  type="button"
                  aria-label={`Set thickness ${size}`}
                  onClick={() => {
                    setBrushSize(size)
                    setThicknessPickerOpen(false)
                  }}
                  className={`thickness-dot-button ${brushSize === size ? 'is-active' : ''}`}
                >
                  <span
                    className="thickness-dot"
                    style={{
                      width: `${Math.max(5, Math.min(18, size))}px`,
                      height: `${Math.max(5, Math.min(18, size))}px`
                    }}
                  />
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <div className="relative">
          <button
            type="button"
            aria-label="Eraser tool"
            className={`toolbar-icon-button relative ${activeTool === 'eraser' ? 'is-active' : ''}`}
            onClick={() => onToolClick('eraser')}
          >
            <img src={eraserIcon} alt="" className="relative z-10 h-8 w-8" />
          </button>

          {isEraserMenuOpen ? (
            <div className="toolbar-popover eraser-menu absolute left-0 top-[calc(100%+10px)] w-32 rounded-2xl border border-neutral-200 bg-white p-1 shadow-md">
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  className="eraser-menu-tab"
                  onClick={() => {
                    setThicknessAnchorTool('eraser')
                    setThicknessPickerOpen(true)
                    setEraserMenuOpen(false)
                  }}
                >
                  <span>Thickness</span>
                  <svg aria-hidden viewBox="0 0 20 20" className="thickness-chevron h-4 w-4">
                    <path d="M7 4.5L13 10L7 15.5" />
                  </svg>
                </button>
                <button
                  type="button"
                  className={`eraser-menu-tab ${eraserMode === 'stroke' ? 'is-active' : ''}`}
                  onClick={() => {
                    setEraserMode(eraserMode === 'normal' ? 'stroke' : 'normal')
                    setEraserMenuOpen(false)
                  }}
                >
                  {eraserMode === 'normal' ? 'Stroke' : 'Normal'}
                </button>
              </div>
            </div>
          ) : null}
          {isThicknessPickerOpen && thicknessAnchorTool === 'eraser' ? (
            <div className="toolbar-popover thickness-picker absolute left-0 top-[calc(100%+10px)] rounded-full border border-neutral-200 bg-white px-3 py-2 shadow-md">
              <div className="flex items-center gap-2">
                {thicknessOptions.map((size) => (
                  <button
                    key={size}
                    type="button"
                    aria-label={`Set thickness ${size}`}
                    onClick={() => {
                      setBrushSize(size)
                      setThicknessPickerOpen(false)
                    }}
                    className={`thickness-dot-button ${brushSize === size ? 'is-active' : ''}`}
                  >
                    <span
                      className="thickness-dot"
                      style={{
                        width: `${Math.max(5, Math.min(18, size))}px`,
                        height: `${Math.max(5, Math.min(18, size))}px`
                      }}
                    />
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <button
          type="button"
          aria-label="Text tool"
          className={`toolbar-icon-button relative ${activeTool === 'text' ? 'is-active' : ''}`}
          onClick={() => onToolClick('text')}
        >
          <span className="relative z-10 text-base font-semibold text-neutral-800">T</span>
        </button>

        <div className="mx-1 h-9 w-px bg-neutral-200" />

        {colorOptions.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={`Select ${color} ink`}
            onClick={() => setActiveColor(color)}
            className={`toolbar-color-swatch ${activeColor === color ? 'is-active' : ''}`}
            style={{ backgroundColor: color }}
          />
        ))}

        <div className="mx-1 h-9 w-px bg-neutral-200" />

        <button
          type="button"
          aria-label="Undo last stroke"
          disabled={!canUndo}
          className="history-icon-button"
          onClick={() => undo()}
        >
          ↶
        </button>
        <button
          type="button"
          aria-label="Redo last stroke"
          disabled={!canRedo}
          className="history-icon-button"
          onClick={() => redo()}
        >
          ↷
        </button>
      </div>
    </div>
  )
}
