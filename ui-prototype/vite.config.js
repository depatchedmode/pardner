import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { DEFAULT_HTTP_PORT, DEFAULT_WS_PORT } from '../lib/sync-protocol.js'

const allowedHosts = (process.env.PARDNER_UI_ALLOWED_HOSTS || 'localhost,127.0.0.1')
  .split(',')
  .map(host => host.trim())
  .filter(Boolean)
const apiHost = process.env.PARDNER_API_HOST || 'localhost'
const apiHttpPort = process.env.PARDNER_HTTP_PORT || String(DEFAULT_HTTP_PORT)
const apiWsPort = process.env.PARDNER_WS_PORT || String(DEFAULT_WS_PORT)
const uiRoot = fileURLToPath(new URL('.', import.meta.url))
const sharedRoot = fileURLToPath(new URL('../shared', import.meta.url))
const syncProtocol = fileURLToPath(new URL('../lib/sync-protocol.js', import.meta.url))

export default defineConfig({
  plugins: [react()],
  base: '/pardner/',
  resolve: {
    alias: {
      '@pardner/domain-vocab': fileURLToPath(new URL('../shared/domain-vocab.js', import.meta.url)),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5174,
    allowedHosts,
    fs: {
      strict: true,
      allow: [uiRoot, sharedRoot, syncProtocol],
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
