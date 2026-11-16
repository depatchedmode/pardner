import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'
import { invitationData } from '../lib/client-invites.js'

/**
 * Test-only: joins `invitation` from one client and approves it from another, the way two people do. The joiner
 * sends its request; the approver opens it (adding the nonce); both sides derive the confirmation code, which must
 * match; the approver approves with that code; the joiner then finishes enrolling.
 *
 * `join(body)` posts `/join` on the joiner's client and `approver(path, body)` calls the approver's client API;
 * each returns the parsed response and throws on failure. Returns the joiner's final `{ project }` response.
 * A join that needs no approval (an Agent invitation on a machine already in the project) returns at once.
 */
export async function joinApproved({ join, approver, invitation, operationId, agent, timeoutMs = 20000 }) {
  const body = { invitation, operationId, ...(agent ? { agent } : {}) }
  const first = await join(body)
  if (first.project) return first
  const { projectId } = invitationData(invitation)
  const { requestId } = first.join
  const opened = await approver(`/projects/${projectId}/join-requests/${requestId}/code`, {})
  const deadline = Date.now() + timeoutMs
  let waiting = first
  while (!waiting.join?.code) {
    assert.ok(Date.now() < deadline, 'The joiner never showed a confirmation code')
    await delay(25)
    waiting = await join(body)
    if (waiting.project) return waiting
  }
  assert.equal(waiting.join.code, opened.request.code, 'Both screens show the same confirmation code')
  await approver(`/projects/${projectId}/join-requests/${requestId}/approve`, { code: opened.request.code })
  for (;;) {
    const result = await join(body)
    if (result.project) return result
    assert.ok(Date.now() < deadline, 'The approved join did not finish')
    await delay(25)
  }
}

/** Adapts a client-API `call(path, body)` that returns `{ result }` (as some fixtures do) to one that returns the result. */
export const unwrap = call => async (path, body) => (await call(path, body)).result
