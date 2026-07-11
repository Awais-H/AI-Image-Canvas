import { BoardPanel } from './components/BoardPanel'
import { useBoardBootstrap, useDrawingPersistence } from './hooks/useBoardSession'

export function App() {
  const { status, error } = useBoardBootstrap()
  useDrawingPersistence(status === 'ready')

  if (status === 'loading') {
    return (
      <div className="flex h-full items-center justify-center text-sm text-neutral-500">
        Loading board...
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-red-600">
        {error ?? 'Failed to load board'}
      </div>
    )
  }

  return (
    <div className="h-full p-3">
      <BoardPanel />
    </div>
  )
}
