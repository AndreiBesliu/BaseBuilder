import { defineConfig } from 'vite'

export default defineConfig({
  root: 'viewer',
  server: { port: 5175, strictPort: true },
  build: { outDir: '../dist-viewer', emptyOutDir: true },
})
