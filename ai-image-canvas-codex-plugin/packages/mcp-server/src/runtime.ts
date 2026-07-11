import { spawn, type ChildProcess } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export type Runtime = {
  url: string
  port: number
  child?: ChildProcess
}

let runtime: Runtime | undefined
let child: ChildProcess | undefined

export function getRuntime() {
  return runtime
}

function pluginRoot() {
  let current = path.dirname(fileURLToPath(import.meta.url))
  for (let i = 0; i < 8; i += 1) {
    const pkg = path.join(current, 'package.json')
    if (existsSync(pkg)) {
      const name = JSON.parse(readFileSync(pkg, 'utf8')).name
      if (name === 'ai-image-canvas-codex-plugin') return current
    }
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
}

async function waitForHealth(url: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/api/health`)
      if (response.ok) return
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`Canvas service did not become healthy at ${url}`)
}

export async function ensureService(workspaceRoot: string, port?: number) {
  const resolvedPort = port ?? Number(process.env.AI_IMAGE_CANVAS_PORT ?? 43219)
  const url = `http://127.0.0.1:${resolvedPort}`
  try {
    await waitForHealth(url, 500)
    runtime = { url, port: resolvedPort, child }
    return runtime
  } catch {
    const root = pluginRoot()
    const entry = path.join(root, 'packages/canvas-service/dist/index.cjs')
    child = spawn(process.execPath, [entry, '--port', String(resolvedPort), '--workspace-root', workspaceRoot], {
      cwd: root,
      stdio: 'pipe',
      env: { ...process.env, AI_IMAGE_CANVAS_PORT: String(resolvedPort) }
    })
    child.stderr?.on('data', (chunk) => {
      process.stderr.write(`[ai-image-canvas-canvas] ${chunk}`)
    })
    await waitForHealth(url, 10_000)
    runtime = { url, port: resolvedPort, child }
    return runtime
  }
}

export async function api<T>(method: string, route: string, body?: unknown) {
  if (!runtime) throw new Error('Canvas service is not running.')
  const response = await fetch(`${runtime.url}${route}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  })
  const text = await response.text()
  const json = text ? JSON.parse(text) : {}
  if (!response.ok) {
    const message = json?.error?.message ?? text ?? response.statusText
    throw new Error(message)
  }
  return json as T
}

export async function closeService() {
  if (child) {
    child.kill('SIGTERM')
    child = undefined
  }
  if (runtime) {
    await api('POST', '/api/canvas/close').catch(() => undefined)
  }
  runtime = undefined
  return { closed: true }
}
