#!/usr/bin/env node
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const hash = bytes => createHash('sha256').update(bytes).digest('hex')
// The frozen standalone tool has no candidate-code imports. Fixtures compare this
// encoding against actual CursorCloudExecution capture hashes (including Unicode).
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
    : JSON.stringify(value)

function trustedJson(path, expected) {
  assert.match(expected, /^[a-f0-9]{64}$/, 'Supply an independently retained SHA-256')
  const bytes = readFileSync(path)
  assert.equal(hash(bytes), expected, 'External evidence digest mismatch')
  return JSON.parse(bytes)
}

export function bindCloudReceipt({ snapshotPath, snapshotHash, executionId, receiptPath, receiptHash }) {
  const snapshot = trustedJson(snapshotPath, snapshotHash)
  const receipt = trustedJson(receiptPath, receiptHash)
  assert.equal(receipt.version, 1)
  assert.ok(['B', 'C'].includes(receipt.phase))
  assert.equal(receipt.checkerVerdict, 'accepted', 'Independent artifact check must pass')
  assert.match(receipt.sha, /^[a-f0-9]{40}$/)
  assert.deepEqual(Object.keys(receipt.files).sort(), ['candidate.mjs', 'checks.json', 'diff.patch'])
  const artifacts = Object.fromEntries(Object.entries(receipt.files).map(([name, sha]) => {
    const bytes = readFileSync(join(dirname(receiptPath), name))
    assert.equal(hash(bytes), sha, `Checker artifact changed: ${name}`)
    return [name, bytes]
  }))
  const matches = snapshot.cloud.executions.filter(row => row.executionId === executionId)
  assert.equal(matches.length, 1, 'Choose one exact execution')
  const row = matches[0]
  assert.equal(row.state, 'terminal', 'Capture is not completion proof')
  assert.equal(row.outcome, 'FINISHED', 'Only successful B/C runs can bind to artifact acceptance')
  const capture = row.evidence
  assert.ok(capture, 'Missing immutable Cloud capture')
  const { sha256, ...data } = capture
  assert.equal(hash(canonical(data)), sha256, 'Cloud capture integrity mismatch')
  for (const key of ['executionId', 'contextId', 'agentId', 'runId']) {
    assert.ok(typeof row[key] === 'string' && row[key].length > 0, `Missing ${key}`)
    assert.equal(capture[key], row[key], `Cloud capture ${key} differs from execution`)
  }
  assert.equal(capture.commit, receipt.sha, 'Cloud commit differs from checked SHA')
  assert.equal(capture.diff, artifacts['diff.patch'].toString('utf8'), 'Cloud diff differs from checked diff')
  assert.equal(capture.tests, artifacts['checks.json'].toString('utf8'), 'Cloud tests differ from independent results')
  for (const artifact of capture.artifacts) {
    assert.equal(typeof artifact.base64, 'string')
    const bytes = Buffer.from(artifact.base64, 'base64')
    assert.equal(bytes.toString('base64'), artifact.base64, 'Noncanonical artifact encoding')
    assert.equal(bytes.length, artifact.sizeBytes, 'Cloud artifact size mismatch')
    assert.equal(hash(bytes), artifact.sha256, 'Cloud artifact digest mismatch')
  }
  for (const time of [row.createdAt, row.acceptedAt, row.observedAt, capture.capturedAt, receipt.checkedAt]) {
    assert.ok(Number.isSafeInteger(time) && time > 0, 'Missing observation time')
  }
  assert.ok(row.createdAt <= row.acceptedAt && row.acceptedAt <= row.observedAt)
  assert.ok(capture.capturedAt >= receipt.checkedAt, 'Freeze independent results before the Cloud capture')
  return { version: 1, kind: 'offline-cloud-checker-binding', executionId, contextId: row.contextId,
    agentId: row.agentId, runId: row.runId, commitSha: receipt.sha,
    intentAt: row.createdAt, acceptedAt: row.acceptedAt, freshReadAt: row.observedAt,
    checkerFrozenAt: capture.capturedAt, snapshotSha256: snapshotHash, cloudEvidenceSha256: sha256,
    checkerReceiptSha256: receiptHash, durableSubmissionCount: row.submissions,
    executionVerdict: 'completed', checkerVerdict: 'accepted', humanVerdict: 'not-recorded',
    recoveryVerdict: row.intervention ? 'manual-intervention' : 'not-established',
    liveVerdict: 'requires-independent-evidence-and-human-review' }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ options: Object.fromEntries(['snapshot', 'snapshot-sha', 'execution', 'receipt', 'receipt-sha'].map(key => [key, { type: 'string' }])) })
    for (const key of ['snapshot', 'snapshot-sha', 'execution', 'receipt', 'receipt-sha']) assert.ok(values[key], `Missing --${key}`)
    console.log(JSON.stringify(bindCloudReceipt({ snapshotPath: values.snapshot, snapshotHash: values['snapshot-sha'], executionId: values.execution,
      receiptPath: values.receipt, receiptHash: values['receipt-sha'] }), null, 2))
  } catch (error) {
    // Do not echo private capture values or diff/test bodies in diagnostics.
    console.error(JSON.stringify({ error: error.code === 'ERR_ASSERTION' ? error.message.split('\n')[0] : 'Cannot read or validate offline evidence', checkerVerdict: 'not-established' }))
    process.exitCode = 2
  }
}
