import { errorPayload, isCanvasError } from '@ai-image-canvas/shared'

export function toolResult(value: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
    structuredContent: value as Record<string, unknown>
  }
}

export function toolError(error: unknown) {
  if (isCanvasError(error)) return toolResult(errorPayload(error.error))
  return toolResult(
    errorPayload({
      code: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : String(error),
      retryable: false
    })
  )
}

export async function runTool<T>(fn: () => Promise<T>) {
  try {
    return toolResult(await fn())
  } catch (error) {
    return toolError(error)
  }
}
