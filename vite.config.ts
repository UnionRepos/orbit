import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { orbitApiPlugin } from './server/vite-plugin.ts'

export default defineConfig({
  plugins: [react(), orbitApiPlugin()],
  server: {
    port: 5173,
    host: true,
  },
  preview: {
    port: 4173,
  },
  build: {
    target: 'es2022',
    sourcemap: false,
  },
})
