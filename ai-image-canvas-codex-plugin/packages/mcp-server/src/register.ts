import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  boardAnnotateSchema,
  boardReadSchema,
  boardSessionSchema,
  extractRawAnnotations,
  interpretAnnotationPlan,
  libraryManageSchema,
  markPrepareEditSchema,
  normalizeAnnotationsToPlan,
  saveSnapshotSchema,
  taskManageSchema,
  taskWatchSchema,
  visualFillSchema,
  visualImportSchema,
  visualPlanSchema,
  visualReviseSchema,
  workflowRunSchema,
  type AnnotationInstruction
} from '@ai-image-canvas/shared'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { api, ensureService } from './runtime.js'
import { buildEditPromptFromPlan, buildGenerationPrompt, buildSkillPrompt } from './prompts.js'
import { runTool } from './toolResult.js'

async function openBoard(input: { workspaceRoot?: string; canvasId?: string; title?: string; port?: number }) {
  const workspaceRoot = input.workspaceRoot ?? process.cwd()
  await ensureService(workspaceRoot, input.port)
  const opened = await api<{ canvasId: string; storagePath: string; boardUrl: string; alreadyOpen: boolean }>(
    'POST',
    '/api/canvas/open',
    { canvasId: input.canvasId, title: input.title }
  )
  const health = await api('GET', '/api/health')
  return {
    url: `http://127.0.0.1:${input.port ?? process.env.AI_IMAGE_CANVAS_PORT ?? 43219}`,
    boardUrl: opened.boardUrl,
    canvasId: opened.canvasId,
    storagePath: opened.storagePath,
    alreadyOpen: opened.alreadyOpen,
    health
  }
}

function holderSize(aspectRatio: string, w?: number, h?: number) {
  if (w && h) return { w, h }
  const [rw, rh] = aspectRatio.split(':').map(Number)
  if (rw > 0 && rh > 0) {
    const base = 420
    return { w: base, h: Math.round((base * rh) / rw) }
  }
  return { w: 420, h: 588 }
}

async function ensureBoardSession(input: { workspaceRoot?: string; canvasId?: string; port?: number }) {
  if (input.workspaceRoot || input.canvasId || input.port) {
    await openBoard(input)
  }
}

export function registerTools(server: McpServer) {
  server.registerTool(
    'board_open',
    {
      title: 'Board Session',
      description: 'Open, list, close, or health-check the local board service.',
      inputSchema: boardSessionSchema
    },
    async (input) =>
      runTool(async () => {
        const parsed = boardSessionSchema.parse(input)
        if (parsed.action === 'list') {
          await ensureService(parsed.workspaceRoot ?? process.cwd())
          return api('GET', '/api/canvas/list')
        }
        if (parsed.action === 'close') {
          return api('POST', '/api/canvas/close')
        }
        if (parsed.action === 'health') {
          await ensureService(process.cwd(), parsed.port)
          return api('GET', '/api/health')
        }
        return openBoard(parsed)
      })
  )

  server.registerTool(
    'board_read',
    {
      title: 'Read Board',
      description: 'Read document state, summary metadata, selection, and optional shape queries.',
      inputSchema: boardReadSchema
    },
    async (input) =>
      runTool(async () => {
        const parsed = boardReadSchema.parse(input)
        await ensureBoardSession(parsed)
        const result: Record<string, unknown> = {}
        if (parsed.include.includes('document')) {
          result.document = await api('GET', '/api/canvas/state')
        }
        if (parsed.include.includes('summary')) {
          result.summary = await api('GET', '/api/canvas/info')
        }
        if (parsed.include.includes('selection')) {
          result.selection = await api('GET', '/api/canvas/selection')
        }
        if (parsed.role || parsed.type || parsed.label || parsed.near) {
          result.matches = await api('POST', '/api/canvas/shapes/find', {
            role: parsed.role,
            type: parsed.type,
            label: parsed.label,
            near: parsed.near
          })
        }
        return result
      })
  )

  server.registerTool(
    'board_save',
    {
      title: 'Save Board',
      description: 'Force-persist the current board document.',
      inputSchema: saveSnapshotSchema
    },
    async () => runTool(() => api('POST', '/api/canvas/save'))
  )

  server.registerTool(
    'board_annotate',
    {
      title: 'Annotate Board',
      description:
        'Create, update, delete, or list annotation shapes (text notes, arrows, region marks) on the board document.',
      inputSchema: boardAnnotateSchema
    },
    async (input) =>
      runTool(async () => {
        const parsed = boardAnnotateSchema.parse(input)
        await ensureBoardSession(parsed)
        return api('POST', '/api/canvas/annotate', parsed)
      })
  )

  server.registerTool(
    'visual_plan',
    {
      title: 'Plan Visual',
      description: 'Create or regenerate an image holder and return a generation prompt plus output paths.',
      inputSchema: visualPlanSchema
    },
    async (input) =>
      runTool(async () => {
        const parsed = visualPlanSchema.parse(input)
        if (parsed.mode === 'regenerate') {
          if (!parsed.holderShapeId) throw new Error('holderShapeId is required for regenerate mode.')
          const state = await api<{
            document: { shapes: Array<{ id: string; aspectRatio?: string; label?: string }> }
          }>('GET', '/api/canvas/state')
          const holder = state.document.shapes.find((shape) => shape.id === parsed.holderShapeId)
          if (!holder) throw new Error(`Holder not found: ${parsed.holderShapeId}`)
          return {
            holderShapeId: holder.id,
            suggestedPrompt: buildGenerationPrompt({
              request: parsed.variation ?? `Regenerate ${holder.label ?? 'image'}`,
              aspectRatio: holder.aspectRatio ?? '5:7'
            }),
            seed: parsed.seed
          }
        }
        if (!parsed.request) throw new Error('request is required for create mode.')
        const opened = await openBoard(parsed)
        const state = await api<{
          document: { shapes: Array<{ id: string; role?: string; aspectRatio?: string }> }
        }>('GET', '/api/canvas/state')
        let holder = state.document.shapes.find((shape) => shape.role === 'image_holder')
        if (!holder) {
          const size = holderSize(parsed.aspectRatio, parsed.w, parsed.h)
          holder = await api<{ id: string; aspectRatio?: string }>('POST', '/api/canvas/holder', {
            label: parsed.label,
            aspectRatio: parsed.aspectRatio,
            x: parsed.x,
            y: parsed.y,
            ...size
          })
        }
        if (!holder) throw new Error('Failed to create image holder.')
        return {
          ...opened,
          holderShapeId: holder.id,
          outputDir: path.join(opened.storagePath, 'assets', 'images'),
          suggestedPrompt: buildGenerationPrompt({
            request: parsed.request,
            aspectRatio: parsed.aspectRatio,
            intendedUse: parsed.intendedUse
          })
        }
      })
  )

  server.registerTool(
    'visual_fill',
    {
      title: 'Fill Visual Slot',
      description: 'Copy a local image into board assets and place it in a holder.',
      inputSchema: visualFillSchema
    },
    async (input) => runTool(() => api('POST', '/api/canvas/insert', visualFillSchema.parse(input)))
  )

  server.registerTool(
    'visual_import',
    {
      title: 'Import Visual',
      description: 'Import an image from a local file, URL, or clipboard data URL.',
      inputSchema: visualImportSchema
    },
    async (input) =>
      runTool(async () => {
        const parsed = visualImportSchema.parse(input)
        await ensureBoardSession(parsed)
        if (parsed.source === 'file') {
          if (!parsed.inputPath) throw new Error('inputPath is required for file import.')
          return api('POST', '/api/canvas/import-file', {
            sourcePath: parsed.inputPath,
            title: parsed.title,
            placement: parsed.placement,
            x: parsed.x,
            y: parsed.y,
            w: parsed.w,
            h: parsed.h
          })
        }
        const state = await api<{ storagePath: string }>('GET', '/api/canvas/state')
        if (parsed.source === 'url') {
          if (!parsed.url) throw new Error('url is required for url import.')
          const temp = path.join(state.storagePath, 'assets', 'images', `url_${Date.now()}.png`)
          const response = await fetch(parsed.url)
          if (!response.ok) throw new Error(`Download failed: ${parsed.url}`)
          await mkdir(path.dirname(temp), { recursive: true })
          await writeFile(temp, Buffer.from(await response.arrayBuffer()))
          return api('POST', '/api/canvas/import-file', { sourcePath: temp, title: parsed.title })
        }
        if (!parsed.dataUrl) throw new Error('dataUrl is required for paste import.')
        const temp = path.join(state.storagePath, 'assets', 'images', `clip_${Date.now()}.png`)
        const base64 = parsed.dataUrl.slice(parsed.dataUrl.indexOf(',') + 1)
        await mkdir(path.dirname(temp), { recursive: true })
        await writeFile(temp, Buffer.from(base64, 'base64'))
        return api('POST', '/api/canvas/import-file', { sourcePath: temp, title: parsed.title })
      })
  )

  server.registerTool(
    'visual_revise',
    {
      title: 'Add Visual Revision',
      description: 'Place an edited image as a new version linked to a source visual.',
      inputSchema: visualReviseSchema
    },
    async (input) => runTool(() => api('POST', '/api/canvas/version', visualReviseSchema.parse(input)))
  )

  server.registerTool(
    'mark_prepare_edit',
    {
      title: 'Prepare Mark Edit',
      description: 'Run the full mark pipeline and return edit readiness, plan, and editPrompt.',
      inputSchema: markPrepareEditSchema
    },
    async (input) =>
      runTool(async () => {
        const parsed = markPrepareEditSchema.parse(input)
        await ensureBoardSession(parsed)
        const state = await api<{ document: import('@ai-image-canvas/shared').CanvasDocument }>('GET', '/api/canvas/state')
        const raw = extractRawAnnotations({
          document: state.document,
          targetShapeId: parsed.targetShapeId,
          radius: parsed.radius,
          includeUnbound: parsed.includeUnbound
        })
        const plan = normalizeAnnotationsToPlan({
          document: state.document,
          targetShapeId: parsed.targetShapeId,
          radius: parsed.radius,
          raw: raw as never
        })
        const interpreted = interpretAnnotationPlan({
          plan,
          confidenceThreshold: parsed.confidenceThreshold
        })
        const editPrompt = buildEditPromptFromPlan({
          userRequest: parsed.userRequest,
          resolvedPlan: interpreted.resolvedPlan as AnnotationInstruction[]
        })
        return {
          raw,
          plan,
          readyToEdit: interpreted.readyToEdit,
          canEdit: interpreted.readyToEdit,
          needsClarification: interpreted.needsClarification,
          resolvedPlan: interpreted.resolvedPlan,
          issues: interpreted.issues,
          editPrompt
        }
      })
  )

  server.registerTool(
    'task_watch',
    {
      title: 'Watch Tasks',
      description: 'Poll for the next queued job or list open tasks.',
      inputSchema: taskWatchSchema
    },
    async (input) =>
      runTool(async () => {
        const parsed = taskWatchSchema.parse(input)
        await ensureBoardSession(parsed)
        if (parsed.action === 'list') {
          return api('GET', `/api/jobs?includeCompleted=${parsed.includeCompleted}`)
        }
        const deadline = Date.now() + parsed.waitMs
        while (Date.now() < deadline) {
          const job = await api('POST', '/api/jobs/next', { kind: parsed.kind, claim: parsed.claim })
          if (job) return { job, timedOut: false }
          await new Promise((resolve) => setTimeout(resolve, 500))
        }
        return { job: undefined, timedOut: true }
      })
  )

  server.registerTool(
    'task_manage',
    {
      title: 'Manage Task',
      description: 'Get, update, cancel, or complete an edit task.',
      inputSchema: taskManageSchema
    },
    async (input) =>
      runTool(async () => {
        const parsed = taskManageSchema.parse(input)
        await ensureBoardSession(parsed)
        if (parsed.action === 'get') {
          return api('GET', `/api/jobs/${parsed.requestId}`)
        }
        if (parsed.action === 'cancel') {
          return api('POST', `/api/jobs/${parsed.requestId}/cancel`)
        }
        if (parsed.action === 'complete_edit') {
          const job = await api('POST', `/api/jobs/${parsed.requestId}`, {
            status: parsed.status ?? 'completed',
            result: { newVersionShapeId: parsed.newVersionShapeId, ...parsed.result }
          })
          await api('POST', '/api/canvas/save')
          return { job, nextStep: 'Call task_watch to wait for the next edit submission.' }
        }
        if (!parsed.status) throw new Error('status is required for update action.')
        return api('POST', `/api/jobs/${parsed.requestId}`, {
          status: parsed.status,
          error: parsed.error,
          result: parsed.result
        })
      })
  )

  server.registerTool(
    'workflow_run',
    {
      title: 'Run Workflow',
      description: 'List, plan, enqueue, or fetch board workflow runs.',
      inputSchema: workflowRunSchema
    },
    async (input) =>
      runTool(async () => {
        const parsed = workflowRunSchema.parse(input)
        await ensureBoardSession(parsed)
        if (parsed.action === 'list') {
          const suffix = parsed.category ? `?category=${encodeURIComponent(parsed.category)}` : ''
          return api('GET', `/api/skills${suffix}`)
        }
        if (parsed.action === 'plan') {
          if (!parsed.skillId) throw new Error('skillId is required for plan action.')
          return api('POST', '/api/skills/prepare-run', {
            skillId: parsed.skillId,
            userRequest: parsed.userRequest
          })
        }
        if (parsed.action === 'enqueue') {
          if (!parsed.skillId) throw new Error('skillId is required for enqueue action.')
          return api('POST', '/api/jobs', {
            kind: 'skill',
            payload: {
              skillId: parsed.skillId,
              userRequest: parsed.userRequest,
              brief: parsed.brief
            }
          })
        }
        if (!parsed.runId) throw new Error('runId is required for fetch action.')
        const run = await api('GET', `/api/skills/runs/${parsed.runId}`)
        return {
          run,
          message: 'Process run.jobs with the host image tool, then place results with visual_revise or visual_fill.'
        }
      })
  )

  server.registerTool(
    'library_manage',
    {
      title: 'Manage Library',
      description: 'List, tag, or delete assets in the board media library.',
      inputSchema: libraryManageSchema
    },
    async (input) =>
      runTool(async () => {
        const parsed = libraryManageSchema.parse(input)
        await ensureBoardSession(parsed)
        if (parsed.action === 'tag') {
          if (!parsed.assetId || !parsed.tags?.length) {
            throw new Error('assetId and tags are required for tag action.')
          }
          return api('POST', '/api/assets/tag', { assetId: parsed.assetId, tags: parsed.tags })
        }
        if (parsed.action === 'delete') {
          if (!parsed.assetId) throw new Error('assetId is required for delete action.')
          return api('DELETE', `/api/assets/${parsed.assetId}`)
        }
        const suffix = parsed.tag ? `?tag=${encodeURIComponent(parsed.tag)}` : ''
        return api('GET', `/api/assets${suffix}`)
      })
  )
}

export function registerPrompts(server: McpServer) {
  server.registerPrompt(
    'brief_new_visual',
    {
      title: 'New Visual Brief',
      description: 'English template for first-pass visual generation on the board.',
      argsSchema: {
        request: z.string(),
        aspectRatio: z.string().default('5:7')
      }
    },
    async ({ request, aspectRatio }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: buildGenerationPrompt({ request, aspectRatio })
          }
        }
      ]
    })
  )

  server.registerPrompt(
    'brief_edit_from_marks',
    {
      title: 'Edit Brief From Marks',
      description: 'English template for mark-driven visual revisions.',
      argsSchema: {
        userRequest: z.string().optional(),
        annotationList: z.string().default('')
      }
    },
    async ({ userRequest, annotationList }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: buildEditPromptFromPlan({ userRequest, resolvedPlan: [] }).replace(
              /No reliable marks were detected[\s\S]*$/m,
              annotationList
            )
          }
        }
      ]
    })
  )

  server.registerPrompt(
    'brief_workflow_run',
    {
      title: 'Workflow Run Brief',
      description: 'English template for executing a board workflow.',
      argsSchema: {
        skillName: z.string(),
        userRequest: z.string().default('')
      }
    },
    async ({ skillName, userRequest }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: buildSkillPrompt({ skillName, userRequest })
          }
        }
      ]
    })
  )
}

export async function registerResources(server: McpServer) {
  server.registerResource(
    'board-document',
    'ai-image-canvas://board/document',
    {
      title: 'Board Document',
      description: 'Readable snapshot of the active board document.',
      mimeType: 'application/json'
    },
    async () => {
      const state = await api('GET', '/api/canvas/state')
      return {
        contents: [
          {
            uri: 'ai-image-canvas://board/document',
            mimeType: 'application/json',
            text: JSON.stringify(state, null, 2)
          }
        ]
      }
    }
  )

  server.registerResource(
    'media-library',
    'ai-image-canvas://library/media',
    {
      title: 'Media Library',
      description: 'Asset library index for the active board.',
      mimeType: 'application/json'
    },
    async () => {
      const assets = await api('GET', '/api/assets')
      return {
        contents: [
          {
            uri: 'ai-image-canvas://library/media',
            mimeType: 'application/json',
            text: JSON.stringify(assets, null, 2)
          }
        ]
      }
    }
  )

  server.registerResource(
    'workflow-catalog',
    'ai-image-canvas://workflows/catalog',
    {
      title: 'Workflow Catalog',
      description: 'Built-in and custom workflow definitions.',
      mimeType: 'application/json'
    },
    async () => {
      const skills = await api('GET', '/api/skills')
      return {
        contents: [
          {
            uri: 'ai-image-canvas://workflows/catalog',
            mimeType: 'application/json',
            text: JSON.stringify(skills, null, 2)
          }
        ]
      }
    }
  )

  server.registerResource(
    'task-history',
    'ai-image-canvas://tasks/history',
    {
      title: 'Task History',
      description: 'Recent task and workflow runs for the active board.',
      mimeType: 'application/json'
    },
    async () => {
      const jobs = await api('GET', '/api/jobs?includeCompleted=true')
      return {
        contents: [
          {
            uri: 'ai-image-canvas://tasks/history',
            mimeType: 'application/json',
            text: JSON.stringify(jobs, null, 2)
          }
        ]
      }
    }
  )
}
