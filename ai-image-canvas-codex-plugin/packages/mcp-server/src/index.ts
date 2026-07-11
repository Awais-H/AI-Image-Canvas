import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { ensureService } from './runtime.js'
import { registerPrompts, registerResources, registerTools } from './register.js'

const server = new McpServer({
  name: 'ai-image-canvas-mcp',
  version: '0.2.0'
})

registerTools(server)
registerPrompts(server)
await registerResources(server)

await ensureService(process.cwd())

const transport = new StdioServerTransport()
await server.connect(transport)
