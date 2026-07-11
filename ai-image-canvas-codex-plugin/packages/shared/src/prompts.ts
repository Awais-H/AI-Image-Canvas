import type { AnnotationInstruction } from './types.js'
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

export function buildEditPromptFromPlan(input: {
  userRequest?: string
  resolvedPlan: AnnotationInstruction[]
}) {
  const annotationList = input.resolvedPlan.length
    ? input.resolvedPlan.map((item, index) => formatAnnotation(item, index)).join('\n')
    : 'No reliable marks were detected. Keep the source visual unchanged.'

  return renderPromptTemplate(PROMPT_TEMPLATES.editFromMarks, {
    userRequest: input.userRequest ?? '',
    annotationList
  })
}

export function buildSkillPrompt(input: { skillName: string; userRequest: string }) {
  return renderPromptTemplate(PROMPT_TEMPLATES.workflowRun, {
    skillName: input.skillName,
    userRequest: input.userRequest
  })
}
