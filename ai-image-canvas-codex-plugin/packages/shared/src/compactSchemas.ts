import { z } from 'zod'
import {
  aspectRatioSchema,
  createImageVersionSchema,
  insertImageIntoHolderSchema,
  jobKindSchema,
  jobStatusSchema,
  openCanvasSchema,
  saveSnapshotSchema,
  skillCategorySchema
} from './schemas.js'

export const boardSessionSchema = z
  .object({
    action: z.enum(['open', 'list', 'close', 'health']).default('open'),
    workspaceRoot: z.string().optional(),
    canvasId: z.string().optional(),
    title: z.string().optional(),
    port: z.number().int().positive().optional()
  })
  .strict()

export const boardReadSchema = openCanvasSchema.extend({
  include: z.array(z.enum(['document', 'summary', 'selection'])).default(['document']),
  role: z.string().optional(),
  type: z.string().optional(),
  label: z.string().optional(),
  near: z
    .object({
      x: z.number(),
      y: z.number(),
      radius: z.number().positive()
    })
    .optional()
})

export const visualPlanSchema = openCanvasSchema.extend({
  mode: z.enum(['create', 'regenerate']).default('create'),
  request: z.string().optional(),
  aspectRatio: aspectRatioSchema.default('5:7'),
  label: z.string().default('Generated image'),
  intendedUse: z.string().optional(),
  x: z.number().default(120),
  y: z.number().default(100),
  w: z.number().positive().optional(),
  h: z.number().positive().optional(),
  holderShapeId: z.string().optional(),
  variation: z.string().optional(),
  seed: z.number().int().optional()
})

export const visualFillSchema = insertImageIntoHolderSchema

export const visualReviseSchema = createImageVersionSchema

export const visualImportSchema = openCanvasSchema.extend({
  source: z.enum(['file', 'url', 'paste']),
  inputPath: z.string().optional(),
  url: z.string().url().optional(),
  dataUrl: z.string().optional(),
  title: z.string().default('Imported image'),
  placement: z.enum(['viewport_center', 'selection_right', 'absolute']).default('selection_right'),
  x: z.number().optional(),
  y: z.number().optional(),
  w: z.number().positive().optional(),
  h: z.number().positive().optional()
})

const pointSchema = z
  .object({
    x: z.number(),
    y: z.number()
  })
  .strict()

export const annotationInputSchema = z
  .object({
    kind: z.enum(['text', 'arrow', 'mark']),
    text: z.string().optional(),
    x: z.number(),
    y: z.number(),
    w: z.number().positive().optional(),
    h: z.number().positive().optional(),
    color: z.string().optional(),
    arrowStart: pointSchema.optional(),
    arrowEnd: pointSchema.optional()
  })
  .strict()

export const boardAnnotateSchema = openCanvasSchema.extend({
  action: z.enum(['create', 'update', 'delete', 'list']).default('create'),
  annotations: z.array(annotationInputSchema).optional(),
  shapeId: z.string().optional(),
  shapeIds: z.array(z.string()).optional(),
  text: z.string().optional(),
  bounds: z
    .object({
      x: z.number(),
      y: z.number(),
      w: z.number().positive(),
      h: z.number().positive()
    })
    .strict()
    .optional(),
  color: z.string().optional(),
  role: z.string().optional(),
  type: z.string().optional()
})

export const markPrepareEditSchema = openCanvasSchema.extend({
  targetShapeId: z.string().optional(),
  radius: z.number().positive().default(300),
  includeUnbound: z.boolean().default(true),
  userRequest: z.string().optional(),
  confidenceThreshold: z.number().min(0).max(1).default(0.55)
})

export const taskWatchSchema = openCanvasSchema.extend({
  action: z.enum(['wait', 'list']).default('wait'),
  kind: jobKindSchema.optional(),
  waitMs: z.number().int().min(0).max(55_000).default(30_000),
  claim: z.boolean().default(true),
  includeCompleted: z.boolean().default(false)
})

export const taskManageSchema = z
  .object({
    action: z.enum(['get', 'update', 'cancel', 'complete_edit']),
    workspaceRoot: z.string().optional(),
    canvasId: z.string().optional(),
    port: z.number().int().positive().optional(),
    requestId: z.string(),
    status: jobStatusSchema.optional(),
    error: z.string().optional(),
    result: z.record(z.unknown()).optional(),
    newVersionShapeId: z.string().optional()
  })
  .strict()

export const workflowRunSchema = openCanvasSchema.extend({
  action: z.enum(['list', 'plan', 'enqueue', 'fetch']),
  category: skillCategorySchema.optional(),
  skillId: z.string().optional(),
  userRequest: z.string().optional(),
  brief: z.record(z.unknown()).optional(),
  runId: z.string().optional()
})

export const libraryManageSchema = openCanvasSchema.extend({
  action: z.enum(['list', 'tag', 'delete']).default('list'),
  tag: z.string().optional(),
  assetId: z.string().optional(),
  tags: z.array(z.string()).min(1).optional()
})

export { saveSnapshotSchema }
