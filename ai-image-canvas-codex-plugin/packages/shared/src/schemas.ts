import { z } from 'zod'

const strict = { additionalProperties: false } as const

export const boundsSchema = z
  .object({
    x: z.number(),
    y: z.number(),
    w: z.number().positive(),
    h: z.number().positive()
  })
  .strict()

export const aspectRatioSchema = z.enum(['1:1', '4:3', '3:4', '16:9', '9:16', '5:7', 'custom'])

export const jobStatusSchema = z.enum([
  'queued',
  'processing',
  'completed',
  'failed',
  'needs_clarification',
  'cancelled'
])

export const jobKindSchema = z.enum(['edit', 'skill', 'generation'])

export const skillCategorySchema = z.enum([
  'social_media',
  'e_commerce',
  'branding',
  'marketing',
  'studio',
  'custom'
])

export const openCanvasSchema = z
  .object({
    workspaceRoot: z.string().optional(),
    canvasId: z.string().optional(),
    title: z.string().optional(),
    port: z.number().int().positive().optional()
  })
  .strict()

export const closeCanvasSchema = z.object({}).strict()

export const listCanvasesSchema = z
  .object({
    workspaceRoot: z.string().optional()
  })
  .strict()

export const getCanvasInfoSchema = openCanvasSchema

export const getCanvasStateSchema = openCanvasSchema

export const getSelectionSchema = openCanvasSchema

export const saveSnapshotSchema = z.object({}).strict()

export const findShapesSchema = z
  .object({
    role: z.string().optional(),
    type: z.string().optional(),
    label: z.string().optional(),
    near: z.object({ x: z.number(), y: z.number(), radius: z.number().positive() }).optional()
  })
  .strict()

export const prepareImageGenerationSchema = openCanvasSchema.extend({
  request: z.string().min(1),
  aspectRatio: aspectRatioSchema.default('5:7'),
  label: z.string().default('Generated image'),
  intendedUse: z.string().optional(),
  x: z.number().default(120),
  y: z.number().default(100),
  w: z.number().positive().optional(),
  h: z.number().positive().optional()
})

export const createImageHolderSchema = z
  .object({
    label: z.string().default('Image holder'),
    aspectRatio: aspectRatioSchema.default('5:7'),
    x: z.number().default(100),
    y: z.number().default(100),
    w: z.number().positive().default(403),
    h: z.number().positive().default(567)
  })
  .strict()

export const insertImageIntoHolderSchema = z
  .object({
    holderShapeId: z.string(),
    imagePath: z.string(),
    mode: z.enum(['contain', 'cover']).default('contain'),
    title: z.string().default('Generated image'),
    idempotencyKey: z.string().optional()
  })
  .strict()

export const generateImageSchema = z
  .object({
    prompt: z.string().min(1),
    aspectRatio: aspectRatioSchema.default('5:7'),
    outputPath: z.string().optional(),
    provider: z.enum(['openai', 'gemini', 'host']).default('host')
  })
  .strict()

export const regenerateSchema = z
  .object({
    holderShapeId: z.string(),
    variation: z.string().optional(),
    seed: z.number().int().optional()
  })
  .strict()

export const importImageAssetSchema = openCanvasSchema.extend({
  inputPath: z.string(),
  title: z.string().default('Imported image'),
  placement: z.enum(['viewport_center', 'selection_right', 'absolute']).default('selection_right'),
  x: z.number().optional(),
  y: z.number().optional(),
  w: z.number().positive().optional(),
  h: z.number().positive().optional()
})

export const importImageFromUrlSchema = openCanvasSchema.extend({
  url: z.string().url(),
  title: z.string().default('URL import')
})

export const importFromClipboardSchema = openCanvasSchema.extend({
  dataUrl: z.string().startsWith('data:image/'),
  title: z.string().default('Clipboard import')
})

export const getAnnotationsSchema = z
  .object({
    targetShapeId: z.string().optional(),
    radius: z.number().positive().default(300),
    includeUnbound: z.boolean().default(true)
  })
  .strict()

export const normalizeAnnotationsSchema = z
  .object({
    targetShapeId: z.string().optional(),
    radius: z.number().positive().default(300),
    raw: z.record(z.unknown()).optional()
  })
  .strict()

export const interpretAnnotationPlanSchema = z
  .object({
    plan: z.record(z.unknown()),
    confidenceThreshold: z.number().min(0).max(1).default(0.55)
  })
  .strict()

export const buildEditPromptSchema = z
  .object({
    userRequest: z.string().optional(),
    resolvedPlan: z.array(z.record(z.unknown()))
  })
  .strict()

export const createImageVersionSchema = z
  .object({
    sourceShapeId: z.string(),
    imagePath: z.string(),
    placement: z.enum(['right', 'replace']).default('right'),
    title: z.string().default('Image v2'),
    resolvedPlanId: z.string().optional(),
    idempotencyKey: z.string().optional()
  })
  .strict()

export const continueEditLoopSchema = openCanvasSchema.extend({
  requestId: z.string(),
  newVersionShapeId: z.string().optional(),
  status: jobStatusSchema.default('completed')
})

export const compareVersionsSchema = z
  .object({
    sourceShapeId: z.string(),
    targetShapeId: z.string()
  })
  .strict()

export const revertToVersionSchema = z
  .object({
    shapeId: z.string()
  })
  .strict()

export const watchJobsSchema = openCanvasSchema.extend({
  kind: jobKindSchema.optional(),
  waitMs: z.number().int().min(0).max(55_000).default(30_000),
  claim: z.boolean().default(true)
})

export const getJobSchema = z.object({ requestId: z.string() }).strict()

export const updateJobSchema = z
  .object({
    requestId: z.string(),
    status: jobStatusSchema,
    error: z.string().optional(),
    result: z.record(z.unknown()).optional()
  })
  .strict()

export const cancelJobSchema = z.object({ requestId: z.string() }).strict()

export const listPendingRequestsSchema = openCanvasSchema.extend({
  includeCompleted: z.boolean().default(false)
})

export const listCanvasSkillsSchema = z
  .object({ category: skillCategorySchema.optional() })
  .strict()

export const recommendCanvasSkillsSchema = openCanvasSchema.extend({
  userRequest: z.string().optional(),
  maxResults: z.number().int().positive().max(10).default(5)
})

export const submitSkillRequestSchema = openCanvasSchema.extend({
  skillId: z.string(),
  userRequest: z.string().optional(),
  brief: z.record(z.unknown()).optional()
})

export const prepareSkillRunSchema = openCanvasSchema.extend({
  skillId: z.string(),
  userRequest: z.string().optional()
})

export const runCanvasSkillSchema = openCanvasSchema.extend({
  runId: z.string()
})

export const getSkillRunSchema = z.object({ runId: z.string() }).strict()

export const createCustomSkillSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    name: z.string().min(1),
    category: skillCategorySchema.default('custom'),
    description: z.string().default(''),
    aspectRatios: z.array(z.string()).default(['1:1']),
    promptTemplate: z.string().min(1)
  })
  .strict()

export const updateSkillSchema = createCustomSkillSchema.partial().extend({ id: z.string() })

export const deleteSkillSchema = z.object({ id: z.string() }).strict()

export const applyCanvasActionsSchema = openCanvasSchema.extend({
  actions: z.array(
    z
      .object({
        id: z.string(),
        type: z.string(),
        payload: z.record(z.unknown()).default({})
      })
      .strict()
  )
})

export const arrangeLayoutSchema = z
  .object({
    shapeIds: z.array(z.string()).min(1),
    layout: z.enum(['grid', 'row', 'mood_board']).default('grid'),
    gap: z.number().nonnegative().default(24)
  })
  .strict()

export const exportCanvasSchema = z
  .object({
    shapeIds: z.array(z.string()).optional(),
    format: z.enum(['png', 'svg', 'pdf']).default('png')
  })
  .strict()

export const listAssetsSchema = openCanvasSchema.extend({
  tag: z.string().optional()
})

export const tagAssetSchema = z
  .object({
    assetId: z.string(),
    tags: z.array(z.string()).min(1)
  })
  .strict()

export const deleteAssetSchema = z.object({ assetId: z.string() }).strict()

export const getServerHealthSchema = z
  .object({ port: z.number().int().positive().optional() })
  .strict()

export { strict }
