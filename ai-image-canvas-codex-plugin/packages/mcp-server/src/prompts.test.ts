import { describe, expect, it } from 'vitest'
import type { AnnotationInstruction } from '@ai-image-canvas/shared'
import { buildEditPromptFromAnnotationList, buildEditPromptFromPlan } from './prompts.js'

const instruction: AnnotationInstruction = {
  id: 'ann_1',
  type: 'arrow_to_region',
  region: { x: 0.25, y: 0.5, w: 0.1, h: 0.1 },
  instruction: 'make logo larger',
  sourceShapeIds: ['arrow1'],
  confidence: 0.9
}

describe('edit prompts', () => {
  it('keeps the constraints section when a custom annotation list is supplied', () => {
    const prompt = buildEditPromptFromAnnotationList({
      userRequest: 'warmer tones',
      annotationList: '1. make logo bigger'
    })
    expect(prompt).toContain('1. make logo bigger')
    expect(prompt).toContain('warmer tones')
    expect(prompt).toContain('Leave every unmarked area unchanged')
  })

  it('falls back to the no-marks message for an empty annotation list', () => {
    const prompt = buildEditPromptFromAnnotationList({ annotationList: '   ' })
    expect(prompt).toContain('No reliable marks were detected')
    expect(prompt).toContain('Constraints:')
    expect(prompt).not.toContain('{{')
  })

  it('formats resolved plan entries with their regions', () => {
    const prompt = buildEditPromptFromPlan({ resolvedPlan: [instruction] })
    expect(prompt).toContain('1. Region x=0.25, y=0.50, w=0.10, h=0.10: make logo larger')
  })
})
