import { defineConfig } from 'vite'

export default defineConfig({
  publicDir: 'public',
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
        },
      },
    },
  },
})
