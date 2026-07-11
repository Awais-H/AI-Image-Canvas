import type {
  AnnotationInstruction,
  AnnotationPlanV1,
  CanvasDocument,
  InterpretPlanResult,
  RawAnnotationShape,
  RawAnnotationsResult,
  Shape
} from '../types.js'
import {
  boundsToRelativeRegion,
  center,
  distance,
  expanded,
  intersection,
  intersects,
  normalizeRelativeRegion,
  pointToRelativeRegion,
  regionsOverlap
} from '../geometry.js'

function isImage(shape: Shape) {
  return shape.role === 'ai_image' || shape.type === 'image'
}

function isAnnotationShape(shape: Shape) {
  return (
    shape.role === 'annotation_arrow' ||
    shape.role === 'annotation_text' ||
    shape.role === 'annotation_mark' ||
    shape.type === 'arrow' ||
    (shape.type === 'text' && shape.role !== 'image_holder')
  )
}

function chooseTarget(document: CanvasDocument, targetShapeId?: string) {
  const images = document.shapes.filter(isImage)
  if (targetShapeId) {
    return {
      target: document.shapes.find((shape) => shape.id === targetShapeId),
      images,
      reason: undefined as string | undefined
    }
  }
  const selected = document.selection
    .map((id) => document.shapes.find((shape) => shape.id === id))
    .filter((shape): shape is Shape => Boolean(shape))
    .find(isImage)
  if (selected) return { target: selected, images, reason: undefined }
  if (images.length === 1) return { target: images[0], images, reason: undefined }
  if (images.length > 1) {
    return {
      target: undefined,
      images,
      reason: 'Multiple images on canvas; provide targetShapeId.'
    }
  }
  return { target: undefined, images, reason: 'No image found on canvas.' }
}

function nearestText(point: { x: number; y: number }, texts: Shape[], maxDistance: number) {
  return texts
    .map((text) => ({ text, d: distance(point, center(text.bounds)) }))
    .filter((entry) => entry.d <= maxDistance)
    .sort((a, b) => a.d - b.d)[0]?.text
}

export function extractRawAnnotations(input: {
  document: CanvasDocument
  targetShapeId?: string
  radius: number
  includeUnbound?: boolean
}): RawAnnotationsResult {
  const { target, reason } = chooseTarget(input.document, input.targetShapeId)
  const searchCenter = target ? center(target.bounds) : { x: 0, y: 0 }
  const searchBounds = target
    ? expanded(target.bounds, input.radius)
    : { x: -1e9, y: -1e9, w: 2e9, h: 2e9 }

  const nearby = input.document.shapes.filter((shape) => {
    if (target && shape.id === target.id) return false
    if (!isAnnotationShape(shape) && !(input.includeUnbound && shape.type === 'text')) return false
    return intersects(shape.bounds, searchBounds)
  })

  const shapes: RawAnnotationShape[] = nearby.map((shape) => ({
    id: shape.id,
    type: shape.type,
    role: shape.role,
    bounds: shape.bounds,
    text: shape.text,
    color: shape.color,
    arrowStart: shape.arrowStart,
    arrowEnd: shape.arrowEnd
  }))

  return {
    targetShapeId: target?.id,
    targetImagePath: target?.assetPath,
    radius: input.radius,
    shapes,
    ...(reason ? {} : {})
  }
}

export function normalizeAnnotationsToPlan(input: {
  document: CanvasDocument
  targetShapeId?: string
  radius: number
  raw?: RawAnnotationsResult
}): AnnotationPlanV1 {
  const raw =
    input.raw ??
    extractRawAnnotations({
      document: input.document,
      targetShapeId: input.targetShapeId,
      radius: input.radius,
      includeUnbound: true
    })

  const target = input.document.shapes.find((shape) => shape.id === raw.targetShapeId)
  const instructions: AnnotationInstruction[] = []
  const clarificationReasons: string[] = []

  if (!target) {
    return {
      schemaVersion: '1',
      annotationPlan: [],
      needsClarification: [],
      readyToEdit: false,
      clarificationReasons: ['No target image resolved.']
    }
  }

  const texts = raw.shapes.filter((shape) => shape.type === 'text' || shape.role === 'annotation_text')
  const arrows = raw.shapes.filter((shape) => shape.type === 'arrow' || shape.role === 'annotation_arrow')
  const marks = raw.shapes.filter(
    (shape) => shape.role === 'annotation_mark' || shape.type === 'draw' || shape.type === 'geo'
  )

  for (const arrow of arrows) {
    const tip = arrow.arrowEnd ?? center(arrow.bounds)
    const region = normalizeRelativeRegion(pointToRelativeRegion(tip, target.bounds))
    const paired = nearestText(tip, texts as Shape[], input.radius)
    instructions.push({
      id: `ann_arrow_${arrow.id}`,
      type: 'arrow_to_region',
      region,
      instruction: paired?.text?.trim() || 'Apply the indicated change in this region.',
      sourceShapeIds: paired ? [arrow.id, paired.id] : [arrow.id],
      confidence: paired?.text ? 0.86 : 0.52
    })
  }

  for (const mark of marks) {
    const overlap = intersection(mark.bounds, target.bounds)
    if (!overlap) continue
    const region = normalizeRelativeRegion(boundsToRelativeRegion(overlap, target.bounds))
    const paired = nearestText(center(mark.bounds), texts as Shape[], input.radius * 0.8)
    const type = mark.type === 'geo' ? 'box_text' : 'draw_mark'
    instructions.push({
      id: `ann_mark_${mark.id}`,
      type,
      region,
      instruction: paired?.text?.trim() || 'Modify this marked region.',
      sourceShapeIds: paired ? [mark.id, paired.id] : [mark.id],
      confidence: paired?.text ? 0.8 : 0.55
    })
  }

  for (const text of texts) {
    if (instructions.some((item) => item.sourceShapeIds.includes(text.id))) continue
    if (!intersects(text.bounds, expanded(target.bounds, input.radius * 0.5))) continue
    instructions.push({
      id: `ann_text_${text.id}`,
      type: 'text_near_image',
      region: { x: 0, y: 0, w: 1, h: 1 },
      instruction: text.text?.trim() || 'Follow nearby text note.',
      sourceShapeIds: [text.id],
      confidence: text.text && text.text.trim().length >= 3 ? 0.62 : 0.45
    })
  }

  if (!instructions.length) clarificationReasons.push('No annotations found near the target image.')

  return {
    schemaVersion: '1',
    targetShapeId: target.id,
    targetImagePath: target.assetPath,
    annotationPlan: instructions,
    needsClarification: [],
    readyToEdit: instructions.length > 0,
    clarificationReasons: clarificationReasons.length ? clarificationReasons : undefined
  }
}

export function interpretAnnotationPlan(input: {
  plan: AnnotationPlanV1
  confidenceThreshold?: number
}): InterpretPlanResult {
  const threshold = input.confidenceThreshold ?? 0.55
  const issues = [...(input.plan.clarificationReasons ?? [])]
  const needsClarification: AnnotationInstruction[] = []
  const resolvedPlan: AnnotationInstruction[] = []

  if (!input.plan.targetShapeId) issues.push('Missing targetShapeId.')
  if (!input.plan.targetImagePath) issues.push('Missing target image asset path.')

  const accepted: AnnotationInstruction[] = []
  for (const annotation of input.plan.annotationPlan) {
    if (annotation.confidence < threshold) {
      needsClarification.push(annotation)
      issues.push(`Low confidence (${annotation.confidence.toFixed(2)}): ${annotation.instruction}`)
      continue
    }
    const overlaps = accepted.some((other) => regionsOverlap(other.region, annotation.region))
    if (overlaps) {
      needsClarification.push(annotation)
      issues.push(`Overlapping instruction: ${annotation.instruction}`)
      continue
    }
    accepted.push(annotation)
    resolvedPlan.push(annotation)
  }

  const readyToEdit =
    Boolean(input.plan.targetShapeId) &&
    Boolean(input.plan.targetImagePath) &&
    resolvedPlan.length > 0 &&
    needsClarification.length === 0 &&
    issues.length === 0

  return { readyToEdit, needsClarification, resolvedPlan, issues }
}

export function compareVersionPlans(input: {
  sourcePlan?: AnnotationPlanV1
  targetPlan?: AnnotationPlanV1
  sourceShapeId: string
  targetShapeId: string
}) {
  const sourceLines = input.sourcePlan?.annotationPlan.map((a) => a.instruction) ?? []
  const targetLines = input.targetPlan?.annotationPlan.map((a) => a.instruction) ?? []
  const added = targetLines.filter((line) => !sourceLines.includes(line))
  const removed = sourceLines.filter((line) => !targetLines.includes(line))
  return {
    sourceShapeId: input.sourceShapeId,
    targetShapeId: input.targetShapeId,
    sourcePlanId: input.sourcePlan?.targetShapeId,
    targetPlanId: input.targetPlan?.targetShapeId,
    summary:
      added.length || removed.length
        ? `Version delta: ${added.length} new instruction(s), ${removed.length} removed.`
        : 'No instruction differences recorded between versions.',
    instructionDiff: [...added.map((line) => `+ ${line}`), ...removed.map((line) => `- ${line}`)]
  }
}
