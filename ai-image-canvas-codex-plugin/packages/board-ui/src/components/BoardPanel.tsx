import { CanvasWorkspace } from './CanvasWorkspace'

export function BoardPanel() {
  return (
    <section className="flex h-full min-h-[420px] flex-col rounded-2xl bg-neutral-50 p-3">
      <CanvasWorkspace />
    </section>
  )
}
