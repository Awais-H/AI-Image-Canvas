# AI Image Canvas Codex Plugin

Fresh MCP server implementation built to the AI Image Canvas design spec. English-only.

## Packages

| Package | Role |
|---------|------|
| `@ai-image-canvas/shared` | Types, Zod schemas, annotation pipeline, prompt templates |
| `@ai-image-canvas/canvas-service` | Local HTTP API + file storage on `127.0.0.1` |
| `@ai-image-canvas/mcp-server` | MCP tools, resources, prompts |

## MCP surface

### Tools (prefix conventions)

| Prefix | Domain |
|--------|--------|
| `board_*` | Board lifecycle, document, layout, export |
| `visual_*` | Image slots, rendering, revisions, imports |
| `mark_*` | Mark extraction, plan validation, edit briefs |
| `task_*` | Unified job queue |
| `workflow_*` | Workflow catalog and runs |
| `library_*` | Media library |
| `service_health` | Runtime health |

### Resources

- `ai-image-canvas://board/document`
- `ai-image-canvas://library/media`
- `ai-image-canvas://workflows/catalog`
- `ai-image-canvas://tasks/history`

### Prompts

- `brief_new_visual`
- `brief_edit_from_marks`
- `brief_workflow_run`

Templates live in `prompts/*.md` (English only).

## Setup

```bash
npm run setup
```

## Install in Codex

```bash
cd ..
codex plugin marketplace add .
codex plugin add ai-image-canvas-codex-plugin@ai-image-canvas
```
