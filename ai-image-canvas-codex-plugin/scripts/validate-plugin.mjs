#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = path.dirname(pluginRoot)
const failures = []

function readJson(rel, root = pluginRoot) {
  const target = path.join(root, rel)
  if (!existsSync(target)) return failures.push(`Missing ${rel}`), undefined
  return JSON.parse(readFileSync(target, 'utf8'))
}

const manifest = readJson('.codex-plugin/plugin.json')
const mcp = readJson('.mcp.json')
const marketplace = readJson('.agents/plugins/marketplace.json', repoRoot)

if (manifest && !manifest.interface?.displayName) failures.push('plugin displayName missing')
if (mcp && !mcp.mcpServers?.['ai-image-canvas']) failures.push('ai-image-canvas MCP entry missing')
if (marketplace) {
  const entry = marketplace.plugins?.find((p) => p.name === 'ai-image-canvas-codex-plugin')
  if (!entry) failures.push('marketplace plugin entry missing')
}

for (const prompt of ['packages/mcp-server/src/promptTemplates.ts']) {
  if (!existsSync(path.join(pluginRoot, prompt))) failures.push(`Missing embedded prompt source ${prompt}`)
}

for (const skill of ['fill-visual-slot/SKILL.md', 'auto-mark-edit-mode/SKILL.md', 'board-art-director/SKILL.md']) {
  if (!existsSync(path.join(pluginRoot, 'skills', skill))) failures.push(`Missing skill ${skill}`)
}

import { readdirSync, statSync } from 'node:fs'

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules') continue
      walk(full)
      continue
    }
    if (/\.zh\.md$/i.test(entry) || /zh-CN|zh-TW|zh_CN|zh_TW/i.test(entry)) {
      failures.push(`Chinese locale file found: ${full.replace(pluginRoot + path.sep, '')}`)
      continue
    }
    if (!/\.(md|ts|tsx|json|mjs)$/i.test(entry)) continue
    if (full.endsWith('validate-plugin.mjs')) continue
    const text = readFileSync(full, 'utf8')
    if (/[\u3400-\u9fff]/.test(text)) {
      failures.push(`Chinese characters found: ${full.replace(pluginRoot + path.sep, '')}`)
    }
  }
}
walk(pluginRoot)

if (failures.length) {
  console.error('Validation failed:')
  failures.forEach((f) => console.error(`- ${f}`))
  process.exit(1)
}

console.log('AI Image Canvas plugin validation passed.')
