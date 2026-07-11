import { DottedBackground } from './DottedBackground'
import { AnnotationLayer } from './AnnotationLayer'
import { DrawingCanvas } from './DrawingCanvas'
import { Toolbar } from './Toolbar'

export function CanvasWorkspace() {
  return (
    <div className="flex h-full flex-col gap-3">
      <Toolbar />
      <div className="relative z-0 min-h-[320px] flex-1 overflow-hidden rounded-2xl">
        <DottedBackground />
        <AnnotationLayer />
        <DrawingCanvas />
      </div>
    </div>
  )
}
