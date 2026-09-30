import type { AnnotationInstruction } from '@ai-image-canvas/shared'
import { PROMPT_TEMPLATES, renderPromptTemplate } from './promptTemplates.js'

function formatAnnotation(annotation: AnnotationInstruction, index: number) {
  const region = annotation.region
  const coords = `x=${region.x.toFixed(2)}, y=${region.y.toFixed(2)}, w=${region.w.toFixed(2)}, h=${region.h.toFixed(2)}`
  return `${index + 1}. Region ${coords}: ${annotation.instruction}`
}

export function buildGenerationPrompt(input: {
  request: string
  aspectRatio: string
  intendedUse?: string
}) {
  return renderPromptTemplate(PROMPT_TEMPLATES.visualCreate, {
    request: input.request,
    aspectRatio: input.aspectRatio,
    intendedUse: input.intendedUse ?? 'unspecified'
  })
}

const NO_MARKS_MESSAGE = 'No reliable marks were detected. Keep the source visual unchanged.'

export function buildEditPromptFromAnnotationList(input: { userRequest?: string; annotationList?: string }) {
  return renderPromptTemplate(PROMPT_TEMPLATES.editFromMarks, {
    userRequest: input.userRequest ?? '',
    annotationList: input.annotationList?.trim() || NO_MARKS_MESSAGE
  })
}

export function buildEditPromptFromPlan(input: {
  userRequest?: string
  resolvedPlan: AnnotationInstruction[]
}) {
  return buildEditPromptFromAnnotationList({
    userRequest: input.userRequest,
    annotationList: input.resolvedPlan.map((item, index) => formatAnnotation(item, index)).join('\n')
  })
}

export function buildSkillPrompt(input: { skillName: string; userRequest: string }) {
  return renderPromptTemplate(PROMPT_TEMPLATES.workflowRun, {
    skillName: input.skillName,
    userRequest: input.userRequest
  })
}
