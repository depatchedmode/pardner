import { requireValue } from './workspace-schema.js'

/** Require a loopback URL with an allowed protocol and no credentials, query, or hash. */
export function localEndpoint(value, protocols) {
  const url = new URL(value)
  requireValue(protocols.includes(url.protocol) && ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname)
    && !url.username && !url.password && !url.search && !url.hash,
  'Bridge endpoints must be local loopback URLs without credentials or query parameters')
  return url
}
