export type ShapeRole =
  | 'image_holder'
  | 'ai_image'
  | 'artboard'
  | 'annotation_text'
  | 'annotation_arrow'
  | 'annotation_mark'
  | 'version_group'

export type ShapeType = 'geo' | 'image' | 'arrow' | 'text' | 'draw'

export type JobKind = 'edit' | 'skill' | 'generation'

export type JobStatus =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'needs_clarification'
  | 'cancelled'

export type AspectRatio = '1:1' | '4:3' | '3:4' | '16:9' | '9:16' | '5:7' | 'custom'

export type SkillCategory =
  | 'social_media'
  | 'e_commerce'
  | 'branding'
  | 'marketing'
  | 'studio'
  | 'custom'

export interface Point {
  x: number
  y: number
}

export interface Bounds {
  x: number
  y: number
  w: number
  h: number
}

export interface Shape {
  id: string
  type: ShapeType
  role?: ShapeRole
  bounds: Bounds
  text?: string
  color?: string
  assetPath?: string
  assetUrl?: string
  aspectRatio?: string
  version?: number
  parentShapeId?: string
  resolvedPlanId?: string
  arrowStart?: Point
  arrowEnd?: Point
  tags?: string[]
  label?: string
  meta?: Record<string, unknown>
}

export interface CanvasMetadata {
  canvasId: string
  title: string
  workspaceRoot: string
  createdAt: string
  updatedAt: string
  width: number
  height: number
}

export interface CanvasDocument {
  metadata: CanvasMetadata
  shapes: Shape[]
  selection: string[]
}

export interface CanvasSummary {
  canvasId: string
  title: string
  shapeCount: number
  updatedAt: string
  workspaceRoot: string
}

export interface CanvasStateResponse {
  canvasId: string
  storagePath: string
  document: CanvasDocument
}

export interface SelectionResponse {
  canvasId: string
  selectedShapeIds: string[]
  shapes: Shape[]
}

export interface AssetRecord {
  id: string
  path: string
  filename: string
  mimeType: string
  width?: number
  height?: number
  tags: string[]
  createdAt: string
  sourceShapeId?: string
}

export interface AnnotationInstruction {
  id: string
  type:
    | 'arrow_to_region'
    | 'circle_text'
    | 'box_text'
    | 'draw_mark'
    | 'text_near_image'
  region: Bounds
  instruction: string
  sourceShapeIds: string[]
  confidence: number
}

export interface AnnotationPlanV1 {
  schemaVersion: '1'
  targetShapeId?: string
  targetImagePath?: string
  annotationPlan: AnnotationInstruction[]
  needsClarification: AnnotationInstruction[]
  readyToEdit: boolean
  clarificationReasons?: string[]
}

export interface RawAnnotationShape {
  id: string
  type: ShapeType
  role?: ShapeRole
  bounds: Bounds
  text?: string
  color?: string
  arrowStart?: Point
  arrowEnd?: Point
}

export interface RawAnnotationsResult {
  targetShapeId?: string
  targetImagePath?: string
  radius: number
  shapes: RawAnnotationShape[]
}

export interface InterpretPlanResult {
  readyToEdit: boolean
  needsClarification: AnnotationInstruction[]
  resolvedPlan: AnnotationInstruction[]
  issues: string[]
}

export interface CanvasJob {
  id: string
  kind: JobKind
  status: JobStatus
  createdAt: string
  updatedAt: string
  claimedBy?: string
  claimExpiresAt?: string
  payload: Record<string, unknown>
  result?: Record<string, unknown>
  error?: string
}

export interface SkillDefinition {
  id: string
  name: string
  category: SkillCategory
  description: string
  aspectRatios: string[]
  promptTemplate: string
  builtin: boolean
  createdAt: string
  updatedAt: string
}

export interface SkillRun {
  id: string
  skillId: string
  status: JobStatus
  jobs: Array<{ id: string; prompt: string; aspectRatio: string; placement?: string }>
  createdAt: string
  updatedAt: string
}

export interface VersionComparison {
  sourceShapeId: string
  targetShapeId: string
  sourceVersion?: number
  targetVersion?: number
  sourcePlanId?: string
  targetPlanId?: string
  summary: string
  instructionDiff: string[]
}

export interface ServerHealth {
  ok: boolean
  version: string
  uptimeMs: number
  canvasOpen: boolean
  activeCanvasId?: string
  queueDepths: { queued: number; processing: number }
  storageBytes: number
  lastError?: string
}

export interface OpenCanvasResult {
  url: string
  canvasId: string
  storagePath: string
  alreadyOpen: boolean
}
