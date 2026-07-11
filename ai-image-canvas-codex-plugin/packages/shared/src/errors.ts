export type CanvasErrorCode =
  | 'CANVAS_NOT_OPEN'
  | 'HOLDER_NOT_FOUND'
  | 'FILE_NOT_READABLE'
  | 'PATH_OUTSIDE_WORKSPACE'
  | 'INVALID_ASPECT_RATIO'
  | 'REQUEST_NOT_FOUND'
  | 'REQUEST_ALREADY_CLAIMED'
  | 'GENERATION_TIMEOUT'
  | 'STORAGE_WRITE_FAILED'
  | 'ANNOTATION_AMBIGUOUS'
  | 'TARGET_NOT_FOUND'
  | 'INVALID_ANNOTATION'
  | 'INTERNAL_ERROR'

export interface CanvasErrorBody {
  code: CanvasErrorCode
  message: string
  retryable: boolean
  details?: Record<string, unknown>
}

export class CanvasError extends Error {
  readonly error: CanvasErrorBody

  constructor(error: CanvasErrorBody) {
    super(error.message)
    this.name = 'CanvasError'
    this.error = error
  }
}

export function canvasError(
  code: CanvasErrorCode,
  message: string,
  options?: { retryable?: boolean; details?: Record<string, unknown> }
): CanvasError {
  return new CanvasError({
    code,
    message,
    retryable: options?.retryable ?? false,
    details: options?.details
  })
}

export function isCanvasError(value: unknown): value is CanvasError {
  return value instanceof CanvasError
}

export function errorPayload(error: CanvasErrorBody) {
  return { error }
}
