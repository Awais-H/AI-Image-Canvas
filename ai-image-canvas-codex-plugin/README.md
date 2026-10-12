# AI Image Canvas Codex Plugin

Fresh MCP server implementation built to the AI Image Canvas design spec. English-only.

## Packages

| Package | Role |
|---------|------|
| `@ai-image-canvas/shared` | Types, Zod schemas, annotation pipeline, prompt templates |
| `@ai-image-canvas/canvas-service` | Local HTTP API + file storage on `127.0.0.1` |
| `@ai-image-canvas/mcp-server` | MCP tools, resources, prompts |
| `@ai-image-canvas/board-ui` | Browser board (React), built into and served by canvas-service |

## MCP surface

### Tools

| Tool | What it does |
|------|--------------|
| `board_open` | Open, list, or close boards; `action: "health"` checks the local service |
| `board_read` | Document, summary, selection, and shape queries |
| `board_save` | Force-persist the current board |
| `board_annotate` | Create, update, delete, or list text notes, arrows, and region marks |
| `visual_plan` | Create or regenerate an image holder and get a generation prompt |
| `visual_fill` | Place a local image into a holder |
| `visual_import` | Import an image from a file, URL, or clipboard data URL |
| `visual_revise` | Add an edited image as a new version of a source visual |
| `mark_prepare_edit` | Run the mark pipeline and return the plan plus an edit prompt |
| `task_watch` / `task_manage` | Poll, inspect, update, cancel, or complete queued jobs |
| `workflow_run` | List, plan, enqueue, or fetch workflow runs |
| `library_manage` | List, tag, or delete media library assets |

### Resources

- `ai-image-canvas://board/document`
- `ai-image-canvas://library/media`
- `ai-image-canvas://workflows/catalog`
- `ai-image-canvas://tasks/history`

### Prompts

- `brief_new_visual`
- `brief_edit_from_marks`
- `brief_workflow_run`

Templates are embedded in `packages/mcp-server/src/promptTemplates.ts` (English only).
`prompts/*.md` are readable copies of the same text; update both together.

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
