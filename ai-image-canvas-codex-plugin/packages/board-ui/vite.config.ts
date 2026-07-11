import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const root = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {
    outDir: path.resolve(root, '../canvas-service/dist/client'),
    emptyOutDir: true
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:43219'
    }
  }
})
