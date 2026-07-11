---
name: auto-mark-edit-mode
description: "Use when the user wants AI Image Canvas to automatically process mark-driven edit jobs, including enable auto mark edit mode, keep watching the board for edits, continue mark edits, or process the next board edit task."
---

# Auto Mark Edit Mode

Keep Codex ready after the first visual is on the board. The user marks up the board, then asks Codex to revise from marks or submits an edit task.

## Tool Availability Gate

This workflow must use `task_watch`, `mark_prepare_edit`, `visual_revise`, `board_save`, and `task_manage`. If these tools are not callable, stop and tell the user to fully quit and reopen Codex.

## Workflow

### A. When the user asks to revise from marks

1. Call `board_open` if needed.
2. Call `board_read` with `include: ["document", "selection"]` to locate the target image.
3. Call `mark_prepare_edit` with the target shape id and optional user request.
4. If `canEdit` is false, ask one concise clarification from `needsClarification` and stop.
5. Edit the source image with the host image-editing capability using `editPrompt`.
6. Save the edited file under the board `storagePath` assets area.
7. Call `visual_revise` with `sourceShapeId`, the edited image path, and placement `right`.
8. Call `board_save`.

### B. When watching the task queue

1. Call `task_watch` with `action: "wait"`, `kind: "edit"`, `claim: true`, and `waitMs` around 30000–45000.
2. If timed out, keep polling when the user asked for continuous mode.
3. When a job arrives:
   - Call `task_manage` with `action: "get"` if more detail is needed.
   - Run `mark_prepare_edit` from the job context.
   - Edit with the host image tool.
   - Call `visual_revise` and `board_save`.
   - Call `task_manage` with `action: "complete_edit"`.
4. Continue watching when the user asked for continuous mode.

## Stop Behavior

When the user says stop watching, stop polling `task_watch` and tell them how to resume later.

## Failure Handling

- If image editing fails, call `task_manage` with `action: "update"` and status `failed` when a job id exists.
- Never overwrite old versions. New edits create versions to the right.
