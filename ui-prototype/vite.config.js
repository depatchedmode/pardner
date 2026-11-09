import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const allowedHosts = (process.env.PARDNER_UI_ALLOWED_HOSTS || 'localhost,127.0.0.1')
  .split(',')
  .map(host => host.trim())
  .filter(Boolean)

// Development against a local client:
//   pardner client open --data <dir> --output-file <file>   (starts the client if needed;
//                                                              its URL is in <dir>/client-connection.json)
//   PARDNER_CLIENT_URL=<that URL> npm run dev --prefix ui-prototype
// then open the one-time grant URL from <file> with its origin replaced by this dev
// server's (http://127.0.0.1:5174/pardner/#grant=…) within a minute; run open again for a fresh one. The proxy presents the client's own
// Origin and Host for requests that come from this dev page, so the client's
// origin-bound grant, cookie session and socket tickets work unchanged. A request
// from any other origin keeps its Origin and is rejected by the client.
// Without PARDNER_CLIENT_URL the dev server serves the UI only.
export function clientProxy(target) {
  if (!target) return undefined
  const clientOrigin = new URL(target).origin
  const presentAsClient = (outgoing, incoming) => {
    if (incoming.headers.origin === `http://${incoming.headers.host}`) outgoing.setHeader('origin', clientOrigin)
  }
  const route = ws => ({
    target: clientOrigin,
    changeOrigin: true,
    ws,
    configure: proxy => {
      proxy.on('proxyReq', presentAsClient)
      proxy.on('proxyReqWs', presentAsClient)
    },
  })
  return { '/pardner/config': route(false), '^/pardner/client/': route(true) }
}

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
    proxy: clientProxy(process.env.PARDNER_CLIENT_URL)
  },
  build: {
    target: 'esnext'
  }
})
