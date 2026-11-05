import assert from 'node:assert/strict'
import { CloudError } from '../lib/cursor-cloud-client.js'

const stamp = '2026-11-04T00:00:00.000Z'
export class FakeCursorCloud {
  constructor() { this.reads = []; this.submissions = []; this.records = []; this.cancels = []; this.events = []; this.eventTrace = []; this.downloads = new Map([['patch.txt', Buffer.from('original')]]) }
  async create(body) {
    this.submissions.push(body)
    this.identity = { id: body.agentId, status: 'ACTIVE', env: { type: 'cloud' }, repos: body.repos }
    return { agent: { ...this.identity }, run: this.newRun() }
  }
  newRun() {
    const run = { id: `run-${this.records.length + 1}`, agentId: this.identity.id, status: 'RUNNING', createdAt: stamp, updatedAt: stamp }
    this.records.push(run); this.identity.latestRunId = run.id; this.identity.status = 'ACTIVE'
    return { ...run }
  }
  async followUp(id, body) { assert.equal(id, this.identity.id); this.submissions.push(body); return { run: this.newRun() } }
  async agent(id) { assert.equal(id, this.identity.id); this.reads.push({ at: Date.now(), agentId: id, agent: structuredClone(this.identity) }); return structuredClone(this.identity) }
  async run(id, runId) { assert.equal(id, this.identity.id); this.reads.push({ at: Date.now(), agentId: id, runId, run: structuredClone(this.records.find(row => row.id === runId)) }); return structuredClone(this.records.find(row => row.id === runId)) }
  async runs() { return structuredClone(this.records) }
  end(status = 'FINISHED') { Object.assign(this.records.at(-1), { status, result: 'partial output', git: { branches: [{ branch: 'mutable' }] } }); this.identity.status = 'IDLE' }
  async cancel(id, runId) {
    this.cancels.push({ id, runId })
    const row = this.records.find(row => row.id === runId)
    if (row.status === 'FINISHED') throw new CloudError(409, 'run_not_cancellable')
    row.status = 'CANCELLED'; row.result = 'partial output'; this.identity.status = 'IDLE'
    return { id: runId }
  }
  async artifacts() { return { items: [...this.downloads].map(([path, bytes]) => ({ path, sizeBytes: bytes.length, updatedAt: stamp })) } }
  async download(id, path) { return this.downloads.get(path) }
  async *stream(id, runId, options) { this.resume = options.lastEventId; for (const event of this.events) { this.eventTrace.push({ ...structuredClone(event), receivedAt: Date.now() }); yield event } }
}
