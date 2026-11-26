import { createHash } from 'node:crypto'
import { HandshakeError, SEQUENCE_HEADER, SESSION_HEADER, SIGNATURE_HEADER } from './machine-handshake.js'
import { publicKeyFromMachineId, verify } from './machine-key.js'
import { canonical } from './workspace-schema.js'

const DOMAIN = 'pardner/response/v2'
const SIGNER = 'x-pardner-responder'
const SIGNATURE = 'x-pardner-response-signature'
const digest = value => createHash('sha256').update(canonical(value)).digest('base64url')

/** Normalize a request before it is signed, sent, and used to verify the response. */
export function jsonRequestBody(body) { return JSON.parse(JSON.stringify(body)) }

function responseBytes(request, status, body) {
  const { projectId, method, suffix, body: input, headers = {} } = request
  const binding = digest({ method, suffix, body: input ?? null, session: headers[SESSION_HEADER] ?? null,
    seq: headers[SEQUENCE_HEADER] ?? null, signature: headers[SIGNATURE_HEADER] ?? null })
  return Buffer.from(canonical({ projectId, request: binding, status, body: digest(body) }))
}

export function machineAnswer(key, request, status, body) {
  const value = JSON.parse(JSON.stringify(body))
  return { status, body: value, signer: key.machineId, signature: key.sign(DOMAIN, responseBytes(request, status, value)).toString('base64url') }
}

export function signJsonResponse(req, res, key, projectId, suffix, fields = {}) {
  const json = res.json.bind(res)
  res.set('Cache-Control', 'no-store')
  res.json = body => {
    const request = { projectId, method: req.method, suffix, headers: req.headers,
      body: ['GET', 'HEAD'].includes(req.method) ? null : req.body ?? {} }
    const answer = machineAnswer(key, request, res.statusCode, { ...body, ...fields })
    res.set({ [SIGNER]: answer.signer, [SIGNATURE]: answer.signature })
    return json(answer.body)
  }
}

function unavailable(details) {
  return new HandshakeError('HUB_UNAVAILABLE', 'Project authority unavailable; retry this attempt', details)
}

export async function fetchMachineResponse(url, { method, headers, body, timeoutMs = 3000, signal }) {
  const deadline = AbortSignal.timeout(timeoutMs)
  let response
  try {
    response = await fetch(url, { method, headers: { 'Content-Type': 'application/json', ...headers }, redirect: 'error',
      signal: signal ? AbortSignal.any([signal, deadline]) : deadline, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    return { status: response.status, body: await response.json(), signer: response.headers.get(SIGNER), signature: response.headers.get(SIGNATURE) }
  } catch (error) {
    throw unavailable(response ? { status: response.status } : { cause: error.message })
  }
}

export function verifyMachineAnswer(answer, request, expectedSigner) {
  const { status, body, signer, signature } = answer
  if (signer !== expectedSigner || typeof signature !== 'string' || !/^[A-Za-z0-9_-]{86}$/.test(signature)
    || !body || typeof body !== 'object' || Array.isArray(body)) throw unavailable({ status })
  let valid = false
  try { valid = verify(publicKeyFromMachineId(signer), DOMAIN, responseBytes(request, status, body), Buffer.from(signature, 'base64url')) } catch {}
  if (!valid) throw unavailable({ status })
  return body
}

export function answerValue(status, body) {
  if (status >= 200 && status < 300) return body
  if (status >= 500 || typeof body.code !== 'string') throw unavailable({ status,
    ...(typeof body.code === 'string' ? { code: body.code } : {}) })
  throw new HandshakeError(body.code, body.error ?? 'Project request failed', body.details)
}
