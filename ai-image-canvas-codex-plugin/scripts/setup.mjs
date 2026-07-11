#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const marketplaceRoot = path.dirname(pluginRoot)
const pnpm = 'pnpm@10.13.1'

function run(args) {
  console.log(`\n> npx --yes ${pnpm} ${args.join(' ')}`)
  execFileSync('npx', ['--yes', pnpm, ...args], { cwd: pluginRoot, stdio: 'inherit' })
}

if (Number(process.versions.node.split('.')[0]) < 20) {
  throw new Error(`Node.js 20+ required. Current: ${process.version}`)
}

run(['install'])
run(['-r', '--filter', '@ai-image-canvas/shared', '--filter', '@ai-image-canvas/board-ui', '--filter', '@ai-image-canvas/canvas-service', '--filter', '@ai-image-canvas/mcp-server', 'build'])

for (const file of ['packages/mcp-server/dist/index.js', 'packages/canvas-service/dist/index.cjs', 'packages/canvas-service/dist/client/index.html']) {
  if (!existsSync(path.join(pluginRoot, file))) throw new Error(`Missing build artifact: ${file}`)
}

console.log(`
AI Image Canvas setup complete.

Install:
  cd "${marketplaceRoot}"
  codex plugin marketplace add .
  codex plugin add ai-image-canvas-codex-plugin@ai-image-canvas

After installing the plugin and restarting Codex, try:
Open the board and make a ramen shop poster.
`)
