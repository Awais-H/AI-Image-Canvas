---
name: board-art-director
description: "Use for end-to-end AI Image Canvas workflows: opening the board, generating visuals into slots, reading marks, revising images, and running board workflows from natural language."
---

# Board Art Director

Turn natural language into an AI Image Canvas workflow without exposing MCP plumbing.

## First-Time User Path

1. Install the AI Image Canvas plugin once.
2. Restart Codex or open a new chat.
3. Invoke with `@AI Image Canvas` when supported.
4. Say: `Open the board and make a ramen shop poster.`
5. Open the board link, add marks, then say `Revise the selected visual using my board marks`.

## Core Tools

| Intent | Tool |
|--------|------|
| Open / list / health | `board_open` |
| Read state / find shapes | `board_read` |
| Save | `board_save` |
| Plan generation | `visual_plan` |
| Insert image | `visual_fill` |
| Import image | `visual_import` |
| Add edited version | `visual_revise` |
| Prepare mark edit | `mark_prepare_edit` |
| Watch queue | `task_watch` |
| Manage jobs | `task_manage` |
| Workflows | `workflow_run` |
| Assets | `library_manage` |

## Tool Availability Gate

If core tools are not callable, stop and tell the user to fully quit and reopen Codex.

## Natural Generation Flow

1. Follow `fill-visual-slot`.
2. Offer the board link and explain the mark → revise loop.
3. Use `auto-mark-edit-mode` for continuous edits.

## Natural Edit Flow

1. `mark_prepare_edit` → host image edit → `visual_revise` → `board_save`.
2. Use `task_watch` + `task_manage` for queued edit jobs.

## Image Generation Boundary

MCP does not render pixels. The host image tool generates or edits files locally.

```text
visual_plan → host image generate → visual_fill → board_save
mark_prepare_edit → host image edit → visual_revise → board_save
```

## Workflow Runs

1. `workflow_run` with `action: "list"`
2. `workflow_run` with `action: "plan"`
3. Process outputs with the host image tool
4. Place with `visual_fill` or `visual_revise`
5. `board_save`
