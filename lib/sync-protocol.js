/** Hub ↔ replica HTTP/WS contract shared by the sync server, runtime, and peers. */

export const DEFAULT_HTTP_PORT = 8004
export const DEFAULT_WS_PORT = 8005

/** WebSocket path for Automerge Repo native (CBOR) sync — distinct from JSON UI subscriptions. */
export const NATIVE_AUTOMERGE_WS_PATH = '/automerge'

export const REPLICA_TOKEN_HEADER = 'x-pardner-replica-token'

export const TICKET_PURPOSE = Object.freeze({ ui: 'ui', replica: 'replica' })

export const AUTOMERGE_PATHS = Object.freeze({
  url: '/automerge/url',
  wsTicket: '/automerge/ws-ticket',
  syncAck: '/automerge/sync-ack',
  doc: '/automerge/doc',
  status: '/automerge/status',
  operations: '/automerge/operations',
  deliveries: '/automerge/deliveries',
  deliveriesClaim: '/automerge/deliveries/claim',
  deliveriesAck: '/automerge/deliveries/ack',
  deliveriesRelease: '/automerge/deliveries/release',
})

export function defaultHttpUrl(env = process.env) {
  return `http://127.0.0.1:${env.PARDNER_HTTP_PORT ?? DEFAULT_HTTP_PORT}`
}

export function replicaTicketHeaders(replicaToken) {
  return {
    'Content-Type': 'application/json',
    [REPLICA_TOKEN_HEADER]: replicaToken ?? '',
  }
}
