import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { requestJson, SyncRequestError } from './sync-client.js'
import { AUTOMERGE_PATHS } from './sync-protocol.js'

// A wait can outlast fetch's response timeouts. Use one HTTP connection with no socket timeout.
function fetchWait(url, { method, headers, body, signal }) {
  const address = new URL(url)
  const transport = address.protocol === 'https:' ? httpsRequest : httpRequest
  return new Promise((resolve, reject) => {
    const request = transport(address, { method, headers, signal, agent: false }, async message => {
      try {
        const chunks = []
        for await (const chunk of message) chunks.push(chunk)
        resolve(new Response(chunks.length ? Buffer.concat(chunks) : null, {
          status: message.statusCode, statusText: message.statusMessage,
          headers: { 'Content-Type': message.headers['content-type'] ?? '' },
        }))
      } catch (error) { reject(error) }
    })
    request.once('error', reject)
    request.end(body)
  })
}

export async function requestWorkspaceWait(base, input, { token, signal, workspaceId } = {}) {
  try {
    return await requestJson(base, AUTOMERGE_PATHS.wait, { method: 'POST', token, signal, fetchImpl: fetchWait,
      headers: { 'Content-Type': 'application/json', ...(workspaceId ? { 'x-pardner-workspace': workspaceId } : {}) },
      body: JSON.stringify(input),
    })
  } catch (error) {
    signal?.throwIfAborted()
    if (error.isTransport) throw new SyncRequestError('Lost connection to the local Pardner service while waiting', { isTransport: true, cause: error })
    throw error
  }
}
