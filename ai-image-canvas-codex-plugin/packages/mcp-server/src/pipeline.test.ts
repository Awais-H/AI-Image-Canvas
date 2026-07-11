import { describe, expect, it } from 'vitest'
import {
  interpretAnnotationPlan,
  normalizeAnnotationsToPlan,
  type CanvasDocument
} from '@ai-image-canvas/shared'

const baseDocument: CanvasDocument = {
  metadata: {
    canvasId: 'c1',
    title: 'Test',
    workspaceRoot: '/tmp',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    width: 1000,
    height: 800
  },
  shapes: [
    {
      id: 'img1',
      type: 'image',
      role: 'ai_image',
      bounds: { x: 100, y: 100, w: 400, h: 400 },
      assetPath: 'assets/images/a.png'
    },
    {
      id: 'arrow1',
      type: 'arrow',
      role: 'annotation_arrow',
      bounds: { x: 450, y: 200, w: 80, h: 40 },
      arrowEnd: { x: 300, y: 220 }
    },
    {
      id: 'text1',
      type: 'text',
      role: 'annotation_text',
      bounds: { x: 500, y: 180, w: 120, h: 30 },
      text: 'make logo larger'
    }
  ],
  selection: ['img1']
}

describe('annotation pipeline', () => {
  it('normalizes raw shapes into plan json', () => {
    const plan = normalizeAnnotationsToPlan({ document: baseDocument, radius: 300 })
    expect(plan.schemaVersion).toBe('1')
    expect(plan.targetShapeId).toBe('img1')
    expect(plan.annotationPlan.length).toBeGreaterThan(0)
  })

  it('flags low-confidence annotations during interpretation', () => {
    const plan = normalizeAnnotationsToPlan({ document: baseDocument, radius: 300 })
    const interpreted = interpretAnnotationPlan({ plan, confidenceThreshold: 0.99 })
    expect(interpreted.readyToEdit).toBe(false)
    expect(interpreted.needsClarification.length).toBeGreaterThan(0)
  })
})
