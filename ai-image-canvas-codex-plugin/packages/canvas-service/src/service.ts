import { mkdir, readFile, readdir, rename, rm, stat, writeFile, copyFile, access } from 'node:fs/promises'
import { createWriteStream, existsSync } from 'node:fs'
import path from 'node:path'
import { nanoid } from 'nanoid'
import {
  canvasError,
  compareVersionPlans,
  interpretAnnotationPlan,
  normalizeAnnotationsToPlan,
  type AnnotationPlanV1,
  type AssetRecord,
  type CanvasDocument,
  type CanvasJob,
  type CanvasSummary,
  type JobKind,
  type JobStatus,
  type Shape,
  type SkillDefinition,
  type SkillRun,
  type BoardDrawingDocument,
  defaultDrawingPreferences,
  defaultDrawingState
} from '@ai-image-canvas/shared'

const APP_VERSION = '0.2.0'
const CLAIM_TTL_MS = 5 * 60 * 1000

export interface ServiceConfig {
  workspaceRoot: string
  homeDir?: string
  port: number
}

export function storageRoot(workspaceRoot: string, homeDir = process.env.AI_IMAGE_CANVAS_HOME) {
  return path.join(homeDir ?? workspaceRoot, '.ai-image-canvas')
}

export function assertInWorkspace(filePath: string, workspaceRoot: string) {
  const absolute = path.resolve(filePath)
  const root = path.resolve(workspaceRoot)
  const rel = path.relative(root, absolute)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw canvasError('PATH_OUTSIDE_WORKSPACE', `Path escapes workspace: ${absolute}`)
  }
  return absolute
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, 'utf8')) as T
}

async function writeJson(filePath: string, value: unknown) {
  await writeFile(filePath, JSON.stringify(value, null, 2), 'utf8')
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

export class CanvasService {
  readonly config: ServiceConfig
  private activeCanvasId?: string
  private startedAt = Date.now()
  private lastError?: string

  constructor(config: ServiceConfig) {
    this.config = config
  }

  root() {
    return storageRoot(this.config.workspaceRoot)
  }

  canvasDir(canvasId: string) {
    return path.join(this.root(), 'canvases', canvasId)
  }

  async ensureRoot() {
    await mkdir(this.root(), { recursive: true })
    await mkdir(path.join(this.root(), 'canvases'), { recursive: true })
    await mkdir(path.join(this.root(), 'skills'), { recursive: true })
  }

  async listCanvases(): Promise<CanvasSummary[]> {
    await this.ensureRoot()
    const dir = path.join(this.root(), 'canvases')
    const entries = await readdir(dir, { withFileTypes: true })
    const summaries: CanvasSummary[] = []
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const metaPath = path.join(dir, entry.name, 'metadata.json')
      if (!existsSync(metaPath)) continue
      const meta = await readJson<CanvasDocument['metadata']>(metaPath)
      const doc = await this.loadDocument(entry.name)
      summaries.push({
        canvasId: meta.canvasId,
        title: meta.title,
        shapeCount: doc.shapes.length,
        updatedAt: meta.updatedAt,
        workspaceRoot: meta.workspaceRoot
      })
    }
    return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  async openCanvas(input: { canvasId?: string; title?: string }) {
    await this.ensureRoot()
    const existing = input.canvasId
      ? await this.tryLoad(input.canvasId)
      : this.activeCanvasId
        ? await this.tryLoad(this.activeCanvasId)
        : undefined

    if (existing) {
      this.activeCanvasId = existing.metadata.canvasId
      return {
        canvasId: existing.metadata.canvasId,
        storagePath: this.canvasDir(existing.metadata.canvasId),
        boardUrl: this.boardUrl(existing.metadata.canvasId),
        alreadyOpen: true
      }
    }

    const canvasId = input.canvasId ?? `canvas_${nanoid(8)}`
    const now = new Date().toISOString()
    const dir = this.canvasDir(canvasId)
    await mkdir(path.join(dir, 'assets', 'images'), { recursive: true })
    await mkdir(path.join(dir, 'exports'), { recursive: true })
    await mkdir(path.join(dir, 'plans'), { recursive: true })
    await mkdir(path.join(dir, 'jobs'), { recursive: true })
    await mkdir(path.join(dir, 'runs'), { recursive: true })

    const document: CanvasDocument = {
      metadata: {
        canvasId,
        title: input.title ?? 'Untitled canvas',
        workspaceRoot: this.config.workspaceRoot,
        createdAt: now,
        updatedAt: now,
        width: 4000,
        height: 3000
      },
      shapes: [],
      selection: []
    }
    await writeJson(path.join(dir, 'metadata.json'), document.metadata)
    await writeJson(path.join(dir, 'document.json'), document)
    this.activeCanvasId = canvasId
    await this.saveDrawing({
      layerId: 'main',
      drawing: defaultDrawingState(),
      preferences: defaultDrawingPreferences(),
      updatedAt: now
    })
    return {
      canvasId,
      storagePath: dir,
      boardUrl: this.boardUrl(canvasId),
      alreadyOpen: false
    }
  }

  boardUrl(canvasId: string) {
    return `http://127.0.0.1:${this.config.port}/?board=${encodeURIComponent(canvasId)}`
  }

  drawingFile() {
    return path.join(this.canvasDir(this.requireActive()), 'drawing.json')
  }

  async getDrawing(): Promise<BoardDrawingDocument> {
    const file = this.drawingFile()
    if (!existsSync(file)) {
      const now = new Date().toISOString()
      const doc: BoardDrawingDocument = {
        layerId: 'main',
        drawing: defaultDrawingState(),
        preferences: defaultDrawingPreferences(),
        updatedAt: now
      }
      await this.saveDrawing(doc)
      return doc
    }
    return readJson<BoardDrawingDocument>(file)
  }

  async saveDrawing(document: BoardDrawingDocument) {
    const next = { ...document, updatedAt: new Date().toISOString() }
    await writeJson(this.drawingFile(), next)
    const canvas = await this.loadDocument(this.requireActive())
    canvas.metadata.updatedAt = next.updatedAt
    await this.saveDocument(canvas)
    return next
  }

  private async tryLoad(canvasId: string) {
    try {
      return await this.loadDocument(canvasId)
    } catch {
      return undefined
    }
  }

  async loadDocument(canvasId: string): Promise<CanvasDocument> {
    const file = path.join(this.canvasDir(canvasId), 'document.json')
    if (!existsSync(file)) throw canvasError('CANVAS_NOT_OPEN', `Canvas not found: ${canvasId}`)
    return readJson<CanvasDocument>(file)
  }

  async saveDocument(document: CanvasDocument) {
    document.metadata.updatedAt = new Date().toISOString()
    const dir = this.canvasDir(document.metadata.canvasId)
    await writeJson(path.join(dir, 'metadata.json'), document.metadata)
    await writeJson(path.join(dir, 'document.json'), document)
  }

  requireActive() {
    if (!this.activeCanvasId) throw canvasError('CANVAS_NOT_OPEN', 'No canvas is open.')
    return this.activeCanvasId
  }

  async getState() {
    const canvasId = this.requireActive()
    const document = await this.loadDocument(canvasId)
    return {
      canvasId,
      storagePath: this.canvasDir(canvasId),
      document
    }
  }

  async getInfo() {
    const { canvasId, document, storagePath } = await this.getState()
    return {
      canvasId,
      storagePath,
      title: document.metadata.title,
      shapeCount: document.shapes.length,
      selectionCount: document.selection.length,
      updatedAt: document.metadata.updatedAt,
      workspaceRoot: document.metadata.workspaceRoot,
      dimensions: { width: document.metadata.width, height: document.metadata.height }
    }
  }

  async getSelection() {
    const { canvasId, document } = await this.getState()
    const shapes = document.shapes.filter((shape) => document.selection.includes(shape.id))
    return { canvasId, selectedShapeIds: document.selection, shapes }
  }

  async saveSnapshot() {
    const document = await this.loadDocument(this.requireActive())
    await this.saveDocument(document)
    return { saved: true, updatedAt: document.metadata.updatedAt }
  }

  private isAnnotationShape(shape: Shape) {
    return (
      shape.role === 'annotation_text' ||
      shape.role === 'annotation_arrow' ||
      shape.role === 'annotation_mark' ||
      shape.type === 'text' ||
      shape.type === 'arrow' ||
      (shape.type === 'geo' && shape.role === 'annotation_mark')
    )
  }

  private boundsFromPoints(start: { x: number; y: number }, end: { x: number; y: number }) {
    const x = Math.min(start.x, end.x)
    const y = Math.min(start.y, end.y)
    const w = Math.max(8, Math.abs(end.x - start.x))
    const h = Math.max(8, Math.abs(end.y - start.y))
    return { x, y, w, h }
  }

  private estimateTextBounds(text: string, x: number, y: number, w?: number, h?: number) {
    const trimmed = text.trim()
    const width = w ?? Math.max(80, Math.min(480, trimmed.length * 8 + 24))
    const height = h ?? Math.max(28, Math.ceil(trimmed.length / 48) * 24 + 8)
    return { x, y, w: width, h: height }
  }

  private shapeFromAnnotationInput(input: {
    kind: 'text' | 'arrow' | 'mark'
    text?: string
    x: number
    y: number
    w?: number
    h?: number
    color?: string
    arrowStart?: { x: number; y: number }
    arrowEnd?: { x: number; y: number }
  }): Shape {
    if (input.kind === 'text') {
      const text = input.text?.trim() ?? ''
      if (!text) throw canvasError('INVALID_ANNOTATION', 'Text annotations require non-empty text.')
      return {
        id: `shape_${nanoid(10)}`,
        type: 'text',
        role: 'annotation_text',
        bounds: this.estimateTextBounds(text, input.x, input.y, input.w, input.h),
        text,
        color: input.color ?? '#111111'
      }
    }

    if (input.kind === 'arrow') {
      const arrowStart = input.arrowStart ?? { x: input.x, y: input.y }
      const arrowEnd = input.arrowEnd ?? { x: input.x + 80, y: input.y + 40 }
      return {
        id: `shape_${nanoid(10)}`,
        type: 'arrow',
        role: 'annotation_arrow',
        bounds: this.boundsFromPoints(arrowStart, arrowEnd),
        arrowStart,
        arrowEnd,
        color: input.color ?? '#ef4444'
      }
    }

    const w = input.w ?? 120
    const h = input.h ?? 80
    return {
      id: `shape_${nanoid(10)}`,
      type: 'geo',
      role: 'annotation_mark',
      bounds: { x: input.x, y: input.y, w, h },
      color: input.color ?? '#eab308'
    }
  }

  async annotateBoard(input: {
    action: 'create' | 'update' | 'delete' | 'list'
    annotations?: Array<{
      kind: 'text' | 'arrow' | 'mark'
      text?: string
      x: number
      y: number
      w?: number
      h?: number
      color?: string
      arrowStart?: { x: number; y: number }
      arrowEnd?: { x: number; y: number }
    }>
    shapeId?: string
    shapeIds?: string[]
    text?: string
    bounds?: { x: number; y: number; w: number; h: number }
    color?: string
    role?: string
    type?: string
  }) {
    const document = await this.loadDocument(this.requireActive())

    if (input.action === 'list') {
      return document.shapes.filter((shape) => {
        if (!this.isAnnotationShape(shape)) return false
        if (input.role && shape.role !== input.role) return false
        if (input.type && shape.type !== input.type) return false
        return true
      })
    }

    if (input.action === 'create') {
      if (!input.annotations?.length) {
        throw canvasError('INVALID_ANNOTATION', 'annotations is required for create action.')
      }
      const created = input.annotations.map((annotation) => this.shapeFromAnnotationInput(annotation))
      document.shapes.push(...created)
      document.selection = created.map((shape) => shape.id)
      await this.saveDocument(document)
      return { shapes: created }
    }

    if (input.action === 'update') {
      if (!input.shapeId) throw canvasError('INVALID_ANNOTATION', 'shapeId is required for update action.')
      const shape = document.shapes.find((item) => item.id === input.shapeId)
      if (!shape || !this.isAnnotationShape(shape)) {
        throw canvasError('TARGET_NOT_FOUND', `Annotation not found: ${input.shapeId}`)
      }
      if (input.text !== undefined) {
        if (shape.type !== 'text') {
          throw canvasError('INVALID_ANNOTATION', 'text can only be updated on text annotations.')
        }
        shape.text = input.text.trim()
        if (!shape.text) throw canvasError('INVALID_ANNOTATION', 'Text annotations require non-empty text.')
        shape.bounds = this.estimateTextBounds(
          shape.text,
          input.bounds?.x ?? shape.bounds.x,
          input.bounds?.y ?? shape.bounds.y,
          input.bounds?.w ?? shape.bounds.w,
          input.bounds?.h ?? shape.bounds.h
        )
      } else if (input.bounds) {
        shape.bounds = { ...input.bounds }
      }
      if (input.color) shape.color = input.color
      document.selection = [shape.id]
      await this.saveDocument(document)
      return { shape }
    }

    if (input.action === 'delete') {
      const ids = input.shapeIds?.length ? input.shapeIds : input.shapeId ? [input.shapeId] : []
      if (!ids.length) throw canvasError('INVALID_ANNOTATION', 'shapeId or shapeIds is required for delete action.')
      const removed: string[] = []
      document.shapes = document.shapes.filter((shape) => {
        if (!ids.includes(shape.id)) return true
        if (!this.isAnnotationShape(shape)) return true
        removed.push(shape.id)
        return false
      })
      document.selection = document.selection.filter((id) => !removed.includes(id))
      await this.saveDocument(document)
      return { deleted: removed }
    }

    throw canvasError('INVALID_ANNOTATION', `Unsupported annotate action: ${input.action}`)
  }

  async findShapes(query: {
    role?: string
    type?: string
    label?: string
    near?: { x: number; y: number; radius: number }
  }) {
    const { document } = await this.getState()
    return document.shapes.filter((shape) => {
      if (query.role && shape.role !== query.role) return false
      if (query.type && shape.type !== query.type) return false
      if (query.label && shape.label !== query.label) return false
      if (query.near) {
        const cx = shape.bounds.x + shape.bounds.w / 2
        const cy = shape.bounds.y + shape.bounds.h / 2
        const d = Math.hypot(cx - query.near.x, cy - query.near.y)
        if (d > query.near.radius) return false
      }
      return true
    })
  }

  async moveShape(input: {
    shapeId: string
    x: number
    y: number
    w?: number
    h?: number
  }) {
    const document = await this.loadDocument(this.requireActive())
    const shape = document.shapes.find((item) => item.id === input.shapeId)
    if (!shape) throw canvasError('TARGET_NOT_FOUND', `Shape not found: ${input.shapeId}`)
    shape.bounds = {
      x: input.x,
      y: input.y,
      w: input.w ?? shape.bounds.w,
      h: input.h ?? shape.bounds.h
    }
    document.selection = [shape.id]
    await this.saveDocument(document)
    return shape
  }

  async deleteShape(shapeId: string) {
    const document = await this.loadDocument(this.requireActive())
    const shape = document.shapes.find((item) => item.id === shapeId)
    if (!shape) throw canvasError('TARGET_NOT_FOUND', `Shape not found: ${shapeId}`)
    if (shape.type !== 'image' && shape.role !== 'ai_image') {
      throw canvasError('INVALID_ANNOTATION', `Shape cannot be deleted: ${shapeId}`)
    }
    document.shapes = document.shapes.filter((item) => item.id !== shapeId)
    document.selection = document.selection.filter((id) => id !== shapeId)
    await this.saveDocument(document)
    return { deleted: shapeId }
  }

  async createImageHolder(input: {
    label: string
    aspectRatio: string
    x: number
    y: number
    w?: number
    h?: number
  }) {
    const document = await this.loadDocument(this.requireActive())
    const size = holderSize(input.aspectRatio, input.w, input.h)
    const shape: Shape = {
      id: `shape_${nanoid(10)}`,
      type: 'geo',
      role: 'image_holder',
      label: input.label,
      bounds: { x: input.x, y: input.y, ...size },
      aspectRatio: input.aspectRatio
    }
    document.shapes.push(shape)
    document.selection = [shape.id]
    await this.saveDocument(document)
    return shape
  }

  async importImageFile(input: {
    sourcePath: string
    title: string
    placement?: string
    x?: number
    y?: number
    w?: number
    h?: number
  }) {
    const absolute = assertInWorkspace(input.sourcePath, this.config.workspaceRoot)
    await access(absolute)
    const document = await this.loadDocument(this.requireActive())
    const dir = this.canvasDir(document.metadata.canvasId)
    const filename = `${nanoid(8)}${path.extname(absolute) || '.png'}`
    const assetPath = path.join('assets', 'images', filename)
    await copyFile(absolute, path.join(dir, assetPath))
    const size = holderSize('5:7', input.w, input.h)
    const shape: Shape = {
      id: `shape_${nanoid(10)}`,
      type: 'image',
      role: 'ai_image',
      label: input.title,
      bounds: {
        x: input.x ?? 140,
        y: input.y ?? 120,
        w: size.w,
        h: size.h
      },
      assetPath
    }
    document.shapes.push(shape)
    document.selection = [shape.id]
    await this.saveDocument(document)
    await this.upsertAsset({
      id: `asset_${nanoid(8)}`,
      path: assetPath,
      filename,
      mimeType: 'image/png',
      tags: [],
      createdAt: new Date().toISOString(),
      sourceShapeId: shape.id
    })
    return shape
  }

  async importImageFromPaste(input: {
    dataUrl: string
    title?: string
    x?: number
    y?: number
    w?: number
    h?: number
  }) {
    if (!input.dataUrl.startsWith('data:image/')) {
      throw canvasError('FILE_NOT_READABLE', 'Clipboard payload must be an image data URL.')
    }

    const document = await this.loadDocument(this.requireActive())
    const dir = this.canvasDir(document.metadata.canvasId)
    const mimeMatch = input.dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);/)
    const mime = mimeMatch?.[1] ?? 'image/png'
    const ext =
      mime === 'image/jpeg'
        ? '.jpg'
        : mime === 'image/webp'
          ? '.webp'
          : mime === 'image/gif'
            ? '.gif'
            : '.png'
    const filename = `${nanoid(8)}${ext}`
    const assetPath = path.join('assets', 'images', filename)
    const absolute = path.join(dir, assetPath)
    await mkdir(path.dirname(absolute), { recursive: true })
    await writeDataUrlToFile(input.dataUrl, absolute)

    const w = input.w ?? 420
    const h = input.h ?? Math.round((w * 3) / 4)
    const shape: Shape = {
      id: `shape_${nanoid(10)}`,
      type: 'image',
      role: 'ai_image',
      label: input.title ?? 'Pasted image',
      bounds: {
        x: input.x ?? 140,
        y: input.y ?? 120,
        w,
        h
      },
      assetPath
    }
    document.shapes.push(shape)
    document.selection = [shape.id]
    await this.saveDocument(document)
    await this.upsertAsset({
      id: `asset_${nanoid(8)}`,
      path: assetPath,
      filename,
      mimeType: mime,
      tags: ['paste'],
      createdAt: new Date().toISOString(),
      sourceShapeId: shape.id
    })
    return shape
  }

  resolveAssetFile(relativePath: string) {
    const normalized = relativePath.replace(/\\/g, '/')
    if (!normalized.startsWith('assets/') || normalized.includes('..')) {
      throw canvasError('PATH_OUTSIDE_WORKSPACE', `Invalid asset path: ${relativePath}`)
    }
    const absolute = path.join(this.canvasDir(this.requireActive()), normalized)
    if (!existsSync(absolute)) {
      throw canvasError('FILE_NOT_READABLE', `Asset not found: ${relativePath}`)
    }
    return absolute
  }

  async insertImageIntoHolder(input: {
    holderShapeId: string
    imagePath: string
    title: string
    idempotencyKey?: string
  }) {
    const absolute = assertInWorkspace(input.imagePath, this.config.workspaceRoot)
    await access(absolute)
    const document = await this.loadDocument(this.requireActive())
    const holder = document.shapes.find((shape) => shape.id === input.holderShapeId)
    if (!holder) throw canvasError('HOLDER_NOT_FOUND', `Holder not found: ${input.holderShapeId}`)
    const dir = this.canvasDir(document.metadata.canvasId)
    const filename = `${nanoid(8)}${path.extname(absolute) || '.png'}`
    const assetPath = path.join('assets', 'images', filename)
    await copyFile(absolute, path.join(dir, assetPath))
    const image: Shape = {
      id: `shape_${nanoid(10)}`,
      type: 'image',
      role: 'ai_image',
      label: input.title,
      bounds: { ...holder.bounds },
      assetPath,
      aspectRatio: holder.aspectRatio
    }
    document.shapes.push(image)
    document.selection = [image.id]
    await this.saveDocument(document)
    return image
  }

  async createImageVersion(input: {
    sourceShapeId: string
    imagePath: string
    placement: 'right' | 'replace'
    title: string
    resolvedPlanId?: string
    idempotencyKey?: string
  }) {
    const absolute = assertInWorkspace(input.imagePath, this.config.workspaceRoot)
    await access(absolute)
    const document = await this.loadDocument(this.requireActive())
    const source = document.shapes.find((shape) => shape.id === input.sourceShapeId)
    if (!source) throw canvasError('TARGET_NOT_FOUND', `Source shape not found: ${input.sourceShapeId}`)
    const dir = this.canvasDir(document.metadata.canvasId)
    const filename = `${nanoid(8)}${path.extname(absolute) || '.png'}`
    const assetPath = path.join('assets', 'images', filename)
    await copyFile(absolute, path.join(dir, assetPath))
    const version = (source.version ?? 1) + 1
    const bounds =
      input.placement === 'right'
        ? {
            x: source.bounds.x + source.bounds.w + 40,
            y: source.bounds.y,
            w: source.bounds.w,
            h: source.bounds.h
          }
        : { ...source.bounds }
    const shape: Shape = {
      id: `shape_${nanoid(10)}`,
      type: 'image',
      role: 'ai_image',
      label: input.title,
      bounds,
      assetPath,
      version,
      parentShapeId: source.id,
      resolvedPlanId: input.resolvedPlanId
    }
    document.shapes.push(shape)
    document.selection = [shape.id]
    await this.saveDocument(document)
    return shape
  }

  async savePlan(plan: AnnotationPlanV1) {
    const canvasId = this.requireActive()
    const id = `plan_${nanoid(8)}`
    await writeJson(path.join(this.canvasDir(canvasId), 'plans', `${id}.json`), plan)
    return id
  }

  async loadPlan(planId: string) {
    const file = path.join(this.canvasDir(this.requireActive()), 'plans', `${planId}.json`)
    if (!existsSync(file)) throw canvasError('REQUEST_NOT_FOUND', `Plan not found: ${planId}`)
    return readJson<AnnotationPlanV1>(file)
  }

  async compareVersions(sourceShapeId: string, targetShapeId: string) {
    const { document } = await this.getState()
    const source = document.shapes.find((shape) => shape.id === sourceShapeId)
    const target = document.shapes.find((shape) => shape.id === targetShapeId)
    if (!source || !target) throw canvasError('TARGET_NOT_FOUND', 'Version shapes not found.')
    const sourcePlan = source.resolvedPlanId ? await this.loadPlan(source.resolvedPlanId).catch(() => undefined) : undefined
    const targetPlan = target.resolvedPlanId ? await this.loadPlan(target.resolvedPlanId).catch(() => undefined) : undefined
    return compareVersionPlans({ sourceShapeId, targetShapeId, sourcePlan, targetPlan })
  }

  async revertToVersion(shapeId: string) {
    const document = await this.loadDocument(this.requireActive())
    const shape = document.shapes.find((item) => item.id === shapeId)
    if (!shape) throw canvasError('TARGET_NOT_FOUND', `Shape not found: ${shapeId}`)
    document.selection = [shapeId]
    await this.saveDocument(document)
    return { revertedTo: shapeId, selection: document.selection }
  }

  private jobsDir() {
    return path.join(this.canvasDir(this.requireActive()), 'jobs')
  }

  async enqueueJob(kind: JobKind, payload: Record<string, unknown>) {
    const now = new Date().toISOString()
    const job: CanvasJob = {
      id: `job_${nanoid(10)}`,
      kind,
      status: 'queued',
      createdAt: now,
      updatedAt: now,
      payload
    }
    await writeJson(path.join(this.jobsDir(), `${job.id}.json`), job)
    return job
  }

  async listJobs(includeCompleted = false) {
    const dir = this.jobsDir()
    if (!existsSync(dir)) return []
    const files = await readdir(dir)
    const jobs: CanvasJob[] = []
    for (const file of files) {
      if (!file.endsWith('.json')) continue
      const job = await readJson<CanvasJob>(path.join(dir, file))
      if (!includeCompleted && (job.status === 'completed' || job.status === 'cancelled')) continue
      jobs.push(job)
    }
    return jobs.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  async nextJob(input: { kind?: JobKind; claim: boolean; claimBy?: string }) {
    const jobs = await this.listJobs(false)
    const candidate = jobs.find((job) => {
      if (input.kind && job.kind !== input.kind) return false
      if (job.status !== 'queued') return false
      if (job.claimExpiresAt && Date.now() > Date.parse(job.claimExpiresAt) && job.status === 'processing') {
        return true
      }
      return true
    })
    if (!candidate) return undefined
    if (input.claim) {
      candidate.status = 'processing'
      candidate.claimedBy = input.claimBy ?? 'mcp-client'
      candidate.claimExpiresAt = new Date(Date.now() + CLAIM_TTL_MS).toISOString()
      candidate.updatedAt = new Date().toISOString()
      await writeJson(path.join(this.jobsDir(), `${candidate.id}.json`), candidate)
    }
    return candidate
  }

  async getJob(requestId: string) {
    const file = path.join(this.jobsDir(), `${requestId}.json`)
    if (!existsSync(file)) throw canvasError('REQUEST_NOT_FOUND', `Job not found: ${requestId}`)
    return readJson<CanvasJob>(file)
  }

  async updateJob(requestId: string, patch: Partial<CanvasJob>) {
    const job = await this.getJob(requestId)
    Object.assign(job, patch, { updatedAt: new Date().toISOString() })
    await writeJson(path.join(this.jobsDir(), `${requestId}.json`), job)
    return job
  }

  async cancelJob(requestId: string) {
    return this.updateJob(requestId, { status: 'cancelled', error: 'Cancelled by client' })
  }

  async arrangeLayout(input: { shapeIds: string[]; layout: string; gap: number }) {
    const document = await this.loadDocument(this.requireActive())
    const shapes = input.shapeIds
      .map((id) => document.shapes.find((shape) => shape.id === id))
      .filter(Boolean) as Shape[]
    if (!shapes.length) throw canvasError('TARGET_NOT_FOUND', 'No shapes to arrange.')
    let x = shapes[0].bounds.x
    let y = shapes[0].bounds.y
    const gap = input.gap
    shapes.forEach((shape, index) => {
      if (input.layout === 'row') {
        shape.bounds.x = x + index * (shape.bounds.w + gap)
        shape.bounds.y = y
      } else if (input.layout === 'grid') {
        const cols = Math.ceil(Math.sqrt(shapes.length))
        const row = Math.floor(index / cols)
        const col = index % cols
        shape.bounds.x = x + col * (shape.bounds.w + gap)
        shape.bounds.y = y + row * (shape.bounds.h + gap)
      } else {
        shape.bounds.x = x + (index % 3) * (shape.bounds.w + gap)
        shape.bounds.y = y + Math.floor(index / 3) * (shape.bounds.h + gap)
      }
    })
    await this.saveDocument(document)
    return { arranged: shapes.map((shape) => shape.id) }
  }

  async exportCanvas(input: { shapeIds?: string[]; format: string }) {
    const { document, storagePath } = await this.getState()
    const ids = input.shapeIds ?? document.shapes.map((shape) => shape.id)
    const exportId = `export_${nanoid(8)}.${input.format === 'svg' ? 'svg' : 'png'}`
    const exportPath = path.join(storagePath, 'exports', exportId)
    const manifest = { shapeIds: ids, format: input.format, createdAt: new Date().toISOString() }
    await writeJson(`${exportPath}.json`, manifest)
    return { exportPath: path.join('exports', `${exportId}.json`), absolutePath: `${exportPath}.json`, manifest }
  }

  private assetsFile() {
    return path.join(this.canvasDir(this.requireActive()), 'assets', 'index.json')
  }

  async listAssets(tag?: string) {
    if (!existsSync(this.assetsFile())) return [] as AssetRecord[]
    const assets = await readJson<AssetRecord[]>(this.assetsFile())
    return tag ? assets.filter((asset) => asset.tags.includes(tag)) : assets
  }

  async upsertAsset(asset: AssetRecord) {
    const assets = existsSync(this.assetsFile()) ? await readJson<AssetRecord[]>(this.assetsFile()) : []
    assets.push(asset)
    await writeJson(this.assetsFile(), assets)
    return asset
  }

  async tagAsset(assetId: string, tags: string[]) {
    const assets = await this.listAssets()
    const asset = assets.find((item) => item.id === assetId)
    if (!asset) throw canvasError('REQUEST_NOT_FOUND', `Asset not found: ${assetId}`)
    asset.tags = [...new Set([...asset.tags, ...tags])]
    await writeJson(this.assetsFile(), assets)
    return asset
  }

  async deleteAsset(assetId: string) {
    const assets = await this.listAssets()
    const next = assets.filter((item) => item.id !== assetId)
    await writeJson(this.assetsFile(), next)
    return { deleted: assetId }
  }

  skillsDir() {
    return path.join(this.root(), 'skills')
  }

  async listSkills(category?: string) {
    await this.ensureRoot()
    const builtin: SkillDefinition[] = [
      {
        id: 'social-cover',
        name: 'Social cover',
        category: 'social_media',
        description: 'Generate a social media cover image.',
        aspectRatios: ['3:4', '16:9'],
        promptTemplate: 'Create a social cover for {{userRequest}}.',
        builtin: true,
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString()
      },
      {
        id: 'product-set',
        name: 'Product marketing set',
        category: 'e_commerce',
        description: 'Generate a small product image set.',
        aspectRatios: ['1:1', '4:3'],
        promptTemplate: 'Create product marketing images for {{userRequest}}.',
        builtin: true,
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString()
      }
    ]
    const customDir = this.skillsDir()
    const custom: SkillDefinition[] = []
    if (existsSync(customDir)) {
      for (const file of await readdir(customDir)) {
        if (!file.endsWith('.json')) continue
        custom.push(await readJson<SkillDefinition>(path.join(customDir, file)))
      }
    }
    const all = [...builtin, ...custom]
    return category ? all.filter((skill) => skill.category === category) : all
  }

  async createSkill(skill: SkillDefinition) {
    await mkdir(this.skillsDir(), { recursive: true })
    const file = path.join(this.skillsDir(), `${skill.id}.json`)
    if (existsSync(file)) throw canvasError('STORAGE_WRITE_FAILED', `Skill already exists: ${skill.id}`)
    await writeJson(file, skill)
    return skill
  }

  async updateSkill(id: string, patch: Partial<SkillDefinition>) {
    const file = path.join(this.skillsDir(), `${id}.json`)
    if (!existsSync(file)) throw canvasError('REQUEST_NOT_FOUND', `Skill not found: ${id}`)
    const current = await readJson<SkillDefinition>(file)
    const next = { ...current, ...patch, id, updatedAt: new Date().toISOString() }
    await writeJson(file, next)
    return next
  }

  async deleteSkill(id: string) {
    const file = path.join(this.skillsDir(), `${id}.json`)
    if (!existsSync(file)) throw canvasError('REQUEST_NOT_FOUND', `Skill not found: ${id}`)
    await rm(file)
    return { deleted: id }
  }

  async prepareSkillRun(skillId: string, userRequest?: string) {
    const skills = await this.listSkills()
    const skill = skills.find((item) => item.id === skillId)
    if (!skill) throw canvasError('REQUEST_NOT_FOUND', `Skill not found: ${skillId}`)
    const run: SkillRun = {
      id: `run_${nanoid(8)}`,
      skillId,
      status: 'queued',
      jobs: skill.aspectRatios.map((aspectRatio, index) => ({
        id: `job_${index + 1}`,
        prompt: skill.promptTemplate.replace('{{userRequest}}', userRequest ?? ''),
        aspectRatio
      })),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    await writeJson(path.join(this.canvasDir(this.requireActive()), 'runs', `${run.id}.json`), run)
    return run
  }

  async getSkillRun(runId: string) {
    const file = path.join(this.canvasDir(this.requireActive()), 'runs', `${runId}.json`)
    if (!existsSync(file)) throw canvasError('REQUEST_NOT_FOUND', `Skill run not found: ${runId}`)
    return readJson<SkillRun>(file)
  }

  async health(): Promise<import('@ai-image-canvas/shared').ServerHealth> {
    const jobs = this.activeCanvasId ? await this.listJobs(true).catch(() => []) : []
    let storageBytes = 0
    try {
      const walk = async (dir: string) => {
        for (const entry of await readdir(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name)
          if (entry.isDirectory()) await walk(full)
          else storageBytes += (await stat(full)).size
        }
      }
      if (existsSync(this.root())) await walk(this.root())
    } catch {
      // ignore
    }
    return {
      ok: true,
      version: APP_VERSION,
      uptimeMs: Date.now() - this.startedAt,
      canvasOpen: Boolean(this.activeCanvasId),
      activeCanvasId: this.activeCanvasId,
      queueDepths: {
        queued: jobs.filter((job) => job.status === 'queued').length,
        processing: jobs.filter((job) => job.status === 'processing').length
      },
      storageBytes,
      lastError: this.lastError
    }
  }

  buildAnnotationPlan(targetShapeId?: string, radius = 300) {
    const document = this.loadDocument(this.requireActive())
    return document.then((doc) => normalizeAnnotationsToPlan({ document: doc, targetShapeId, radius }))
  }

  interpretPlan(plan: AnnotationPlanV1, confidenceThreshold?: number) {
    return interpretAnnotationPlan({ plan, confidenceThreshold })
  }

  close() {
    this.activeCanvasId = undefined
    return { closed: true }
  }
}

export async function downloadUrlToFile(url: string, destination: string) {
  const response = await fetch(url)
  if (!response.ok) throw canvasError('FILE_NOT_READABLE', `Failed to download ${url}`)
  const buffer = Buffer.from(await response.arrayBuffer())
  await writeFile(destination, buffer)
}

export async function writeDataUrlToFile(dataUrl: string, destination: string) {
  const comma = dataUrl.indexOf(',')
  const base64 = dataUrl.slice(comma + 1)
  await writeFile(destination, Buffer.from(base64, 'base64'))
}
