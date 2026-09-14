import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig({
  root: 'viewer',
  server: { port: 5175, strictPort: true },
  build: {
    outDir: '../dist-viewer',
    emptyOutDir: true,
    // Doua pagini: viewerul (care se masoara) si spike-ul de aspect (care nu).
    // Separate deliberat — spike-ul nu are voie sa intre in nicio cifra de gate.
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'viewer/index.html'),
        spike: resolve(__dirname, 'viewer/spike.html'),
      },
    },
  },
})
