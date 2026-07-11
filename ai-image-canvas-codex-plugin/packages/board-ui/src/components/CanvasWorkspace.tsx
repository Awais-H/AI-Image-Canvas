import { useRef } from 'react'
import { DottedBackground } from './DottedBackground'
import { AnnotationLayer } from './AnnotationLayer'
import { DrawingCanvas } from './DrawingCanvas'
import { ImageLayer } from './ImageLayer'
import { Toolbar } from './Toolbar'
import { useClipboardPaste } from '../hooks/useClipboardPaste'

export function CanvasWorkspace() {
  const canvasRef = useRef<HTMLDivElement | null>(null)
  useClipboardPaste(true, canvasRef)

  return (
    <div className="flex h-full flex-col gap-3">
      <Toolbar />
      <div
        ref={canvasRef}
        className="canvas-workspace relative z-0 min-h-[320px] flex-1 overflow-hidden rounded-2xl outline-none"
      >
        <DottedBackground />
        <ImageLayer />
        <AnnotationLayer />
        <DrawingCanvas />
      </div>
    </div>
  )
}
