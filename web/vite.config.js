import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [svelte(), tailwindcss()],
  // fixed names: scripts/server.py serves exactly these files
  // one file on purpose (STATIC); three.js makes it big, and it is only ever served from localhost
  build: { chunkSizeWarningLimit: 1000, rollupOptions: { output: { entryFileNames: 'app.js', assetFileNames: 'app[extname]' } } },
  // npm run dev: the API comes from a running scripts/server.py
  server: { proxy: { '/api': 'http://127.0.0.1:4610' } },
})
