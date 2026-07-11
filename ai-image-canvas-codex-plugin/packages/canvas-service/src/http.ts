import express from 'express'
import path from 'node:path'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { isCanvasError } from '@ai-image-canvas/shared'
import { CanvasService } from './service.js'

function clientRoot() {
  const baseDir =
    typeof __dirname !== 'undefined'
      ? __dirname
      : path.dirname(fileURLToPath(import.meta.url))

  const candidates = [
    path.join(baseDir, 'client'),
    path.join(baseDir, '..', 'dist', 'client'),
    path.join(baseDir, 'dist', 'client')
  ]

  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, 'index.html'))) {
      return candidate
    }
  }

  return path.join(baseDir, 'client')
}

export function createApp(service: CanvasService) {
  const app = express()
  app.use(express.json({ limit: '25mb' }))

  app.use((error: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (res.headersSent) return next(error)
    if (isCanvasError(error)) {
      return res.status(400).json({ error: error.error })
    }
    return res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : String(error),
        retryable: false
      }
    })
  })

  const wrap =
    (handler: (req: express.Request) => Promise<unknown>) =>
    async (req: express.Request, res: express.Response, next: express.NextFunction) => {
      try {
        res.json(await handler(req))
      } catch (error) {
        if (isCanvasError(error)) return res.status(400).json({ error: error.error })
        next(error)
      }
    }

  app.get('/api/health', wrap(async () => service.health()))

  app.post('/api/canvas/open', wrap(async (req) => service.openCanvas(req.body ?? {})))
  app.post('/api/canvas/close', wrap(async () => service.close()))
  app.get('/api/canvas/list', wrap(async () => service.listCanvases()))
  app.get('/api/canvas/info', wrap(async () => service.getInfo()))
  app.get('/api/canvas/state', wrap(async () => service.getState()))
  app.get('/api/canvas/selection', wrap(async () => service.getSelection()))
  app.post('/api/canvas/save', wrap(async () => service.saveSnapshot()))
  app.post('/api/canvas/shapes/find', wrap(async (req) => service.findShapes(req.body ?? {})))
  app.post('/api/canvas/shapes/move', wrap(async (req) => service.moveShape(req.body ?? {})))
  app.post('/api/canvas/shapes/delete', wrap(async (req) => service.deleteShape(req.body.shapeId)))
  app.post('/api/canvas/annotate', wrap(async (req) => service.annotateBoard(req.body ?? {})))
  app.post('/api/canvas/holder', wrap(async (req) => service.createImageHolder(req.body)))
  app.post('/api/canvas/import-file', wrap(async (req) => service.importImageFile(req.body)))
  app.post('/api/canvas/import-paste', wrap(async (req) => service.importImageFromPaste(req.body ?? {})))
  app.get('/api/canvas/asset', async (req, res, next) => {
    try {
      const assetPath = req.query.path
      if (typeof assetPath !== 'string' || !assetPath) {
        return res.status(400).json({ error: { code: 'FILE_NOT_READABLE', message: 'path query is required.' } })
      }
      res.sendFile(service.resolveAssetFile(assetPath))
    } catch (error) {
      if (isCanvasError(error)) return res.status(400).json({ error: error.error })
      next(error)
    }
  })
  app.post('/api/canvas/insert', wrap(async (req) => service.insertImageIntoHolder(req.body)))
  app.post('/api/canvas/version', wrap(async (req) => service.createImageVersion(req.body)))
  app.post('/api/canvas/layout', wrap(async (req) => service.arrangeLayout(req.body)))
  app.post('/api/canvas/export', wrap(async (req) => service.exportCanvas(req.body)))
  app.post('/api/canvas/compare-versions', wrap(async (req) =>
    service.compareVersions(req.body.sourceShapeId, req.body.targetShapeId)
  ))
  app.post('/api/canvas/revert', wrap(async (req) => service.revertToVersion(req.body.shapeId)))

  app.get('/api/jobs', wrap(async (req) => service.listJobs(req.query.includeCompleted === 'true')))
  app.post('/api/jobs', wrap(async (req) => service.enqueueJob(req.body.kind, req.body.payload ?? {})))
  app.post('/api/jobs/next', wrap(async (req) => service.nextJob(req.body ?? {})))
  app.get('/api/jobs/:id', wrap(async (req) => service.getJob(req.params.id)))
  app.post('/api/jobs/:id', wrap(async (req) => service.updateJob(req.params.id, req.body)))
  app.post('/api/jobs/:id/cancel', wrap(async (req) => service.cancelJob(req.params.id)))

  app.get('/api/assets', wrap(async (req) => service.listAssets(req.query.tag as string | undefined)))
  app.post('/api/assets/tag', wrap(async (req) => service.tagAsset(req.body.assetId, req.body.tags)))
  app.delete('/api/assets/:id', wrap(async (req) => service.deleteAsset(req.params.id)))

  app.get('/api/skills', wrap(async (req) => service.listSkills(req.query.category as string | undefined)))
  app.post('/api/skills', wrap(async (req) => service.createSkill(req.body)))
  app.patch('/api/skills/:id', wrap(async (req) => service.updateSkill(req.params.id, req.body)))
  app.delete('/api/skills/:id', wrap(async (req) => service.deleteSkill(req.params.id)))
  app.post('/api/skills/prepare-run', wrap(async (req) => service.prepareSkillRun(req.body.skillId, req.body.userRequest)))
  app.get('/api/skills/runs/:id', wrap(async (req) => service.getSkillRun(req.params.id)))

  app.get('/api/drawing', wrap(async () => service.getDrawing()))
  app.put('/api/drawing', wrap(async (req) => service.saveDrawing(req.body)))

  const uiRoot = clientRoot()
  if (existsSync(uiRoot)) {
    app.use(express.static(uiRoot))
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next()
      res.sendFile(path.join(uiRoot, 'index.html'))
    })
  }

  return app
}

export function startServer(service: CanvasService, port: number) {
  const app = createApp(service)
  return new Promise<{ url: string; close: () => Promise<void> }>((resolve) => {
    const server = app.listen(port, '127.0.0.1', () => {
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise((done, reject) => {
            server.close((error) => (error ? reject(error) : done()))
          })
      })
    })
  })
}
