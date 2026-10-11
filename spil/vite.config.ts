import { defineConfig } from 'vite'

// Relative base so the build works under GitHub Pages' /AI-MAGIC/ subpath.
export default defineConfig({
  base: './',
  server: { host: true },
})
