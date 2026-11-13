import { canonical, digest, recordId } from './workspace-schema.js'

export { digest, recordId, isRecordId } from './workspace-schema.js'

/** Stable stored operation id derived from the client request id and request fingerprint. */
export function storedOperationId(requestId, fingerprint) {
  return `op-${digest(canonical([requestId, fingerprint]))}`
}

export function operationFingerprint({ type, actorId, payload }) {
  return digest(canonical({ type, actorId, payload }))
}

export function storedOperationIdFromRequest(request) {
  const fingerprint = operationFingerprint({
    type: request.type,
    actorId: request.actorId,
    payload: request.payload,
  })
  return storedOperationId(request.operationId, fingerprint)
}

export function taskIdForRequest(request) {
  return recordId('task', storedOperationIdFromRequest(request))
}
