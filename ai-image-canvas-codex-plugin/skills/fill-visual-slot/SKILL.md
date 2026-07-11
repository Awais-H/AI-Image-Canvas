---
name: fill-visual-slot
description: "Use when the user asks AI Image Canvas to generate, create, fill, or design an image on the board, including phrases like fill the holder, generate a poster, make an ad visual, or create a cover image."
---

# Fill Visual Slot

Use this skill for the first image-generation loop on AI Image Canvas. The user should speak in normal language, not tool names.

## Tool Availability Gate

This workflow must use AI Image Canvas MCP tools. If `visual_plan`, `visual_fill`, or `board_save` are not callable in the current Codex thread, stop and tell the user:

```text
The AI Image Canvas plugin is installed, but its tools are not loaded in this thread. Fully quit and reopen Codex, then send the same request again. You do not need to reinstall the plugin.
```

Do not inspect plugin files, run curl, check ports, or start local services by hand during a normal image request.

## Workflow

1. Call `visual_plan` with `mode: "create"` and the user's original request.
2. Choose an aspect ratio when missing:
   - Banner, hero, wide cover: `16:9`
   - Portrait poster, social cover: `5:7`
   - Avatar, square product shot: `1:1`
   - Unknown: `5:7`
3. If the result includes `boardUrl`, show it as a clickable link.
4. Generate the image with the host image-generation capability and the returned `suggestedPrompt`.
5. Save the generated image under the returned `outputDir`.
6. Call `visual_fill` with the holder id and local image path.
7. Call `board_save`.
8. Tell the user the image is on the board, then hand off to marking: open the board link, draw marks, then say **Revise the selected visual using my board marks**.
9. Continue with `auto-mark-edit-mode` when the user wants continuous edit handling.

## User-Facing Tone

- "I'll open the board and prepare an image slot."
- "I'll generate the visual and place it on the board."
- "The image is on the board. Open the link, add your marks, then ask me to revise from those marks."

Do not expose raw MCP JSON, shape ids, or file paths unless the user asks for debugging.
