import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const allowedHosts = (process.env.PARDNER_UI_ALLOWED_HOSTS || 'localhost,127.0.0.1')
  .split(',')
  .map(host => host.trim())
  .filter(Boolean)
const apiHost = process.env.PARDNER_API_HOST || 'localhost'
const apiHttpPort = process.env.PARDNER_HTTP_PORT || '8004'
const apiWsPort = process.env.PARDNER_WS_PORT || '8005'

export default defineConfig({
  plugins: [react()],
  base: '/pardner/',
  server: {
    host: '127.0.0.1',
    port: 5174,
    allowedHosts,
    fs: {
      strict: true,
      allow: [fileURLToPath(new URL('.', import.meta.url))],
      deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.pardner/**', '**/.mission-control/**', '**/.agent-trace/**']
    },
    proxy: {
      '/pardner/config': { target: `http://${apiHost}:${apiHttpPort}` },
      '/pardner-ws': {
        target: `ws://${apiHost}:${apiWsPort}`,
        ws: true,
        rewrite: (path) => path.replace(/^\/pardner-ws/, '')
      },
      '/pardner-api': {
        target: `http://${apiHost}:${apiHttpPort}`,
        rewrite: (path) => path.replace(/^\/pardner-api/, '')
      }
    }
  },
  build: {
    target: 'esnext'
  }
})
