import { defineConfig } from 'vite'

// Relative base so the build works under GitHub Pages' /AI-MAGIC/ subpath.
export default defineConfig({
  base: './',
  server: { host: true },
  define: {
    // Shown in the corner so we can tell which deploy the iPad is actually running.
    __BUILD__: JSON.stringify(
      new Date().toLocaleString('da-DK', { timeZone: 'Europe/Copenhagen', dateStyle: 'short', timeStyle: 'short' }),
    ),
  },
})
