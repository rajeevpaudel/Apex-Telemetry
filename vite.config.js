import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const chUrl = env.VITE_CLICKHOUSE_URL

  return {
  plugins: [react()],
  server: {
    proxy: chUrl ? {
      '/ch': {
        target: chUrl,
        changeOrigin: true,
        rewrite: path => path.replace(/^\/ch/, ''),
      },
    } : {},
  },
  build: {
    rolldownOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('three')) return 'three'
          if (id.includes('react')) return 'react'
        },
      },
    },
  },
  }
})
