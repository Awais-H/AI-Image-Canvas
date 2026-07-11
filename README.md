# AI Image Canvas
<img width="1533" height="1026" alt="image" src="https://github.com/user-attachments/assets/6b9f7544-add1-4e10-acc2-86d03cb1aa01" />

Codex plugin with an MCP server for board-based visual workflows.

Will be adding more task specific tools soon (i.e creating marketing material, youtube thumbnails)

## What it's for

A visual board where you paste images, draw marks, and add text notes, then an AI agent generates or edits images based on what you put on the canvas. Built for iterative image work (posters, product shots, revisions from feedback) rather than one-shot prompts.

## How it works

You use a local **board UI** in the browser. An **MCP server** lets the AI agent read the board, import images, parse your marks into edit instructions, and place results back. The agent calls MCP tools; those talk to a local HTTP service that updates the board and stores files on disk.

## Quick start

Install the plugin once, then use it from Codex chat — the agent gets MCP tools to open the board and work with your canvas.

```bash
cd ai-image-canvas-codex-plugin
npm run setup

cd ..
codex plugin marketplace add .
codex plugin add ai-image-canvas-codex-plugin@ai-image-canvas
```

Restart Codex. Then select the plugin from the '+' icon.

See `ai-image-canvas-codex-plugin/README.md` for the tool catalog.

## License

MIT
