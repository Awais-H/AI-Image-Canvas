import { CanvasService } from './service.js'
import { startServer } from './http.js'

const workspaceRoot = process.argv.includes('--workspace-root')
  ? process.argv[process.argv.indexOf('--workspace-root') + 1]
  : process.cwd()

const port = Number(
  process.argv.includes('--port')
    ? process.argv[process.argv.indexOf('--port') + 1]
    : process.env.AI_IMAGE_CANVAS_PORT ?? 43219
)

async function main() {
  const service = new CanvasService({ workspaceRoot, port })
  const { url } = await startServer(service, port)
  console.log(`AI Image Canvas service listening on ${url}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
