import { createHash } from 'node:crypto'
import { lstat } from 'node:fs/promises'
import { join } from 'node:path'
import { BridgeInbox } from './bridge-inbox.js'
import { ChannelLedger } from './claude-channel-server.js'
import { channelIdentity, privateChannelDirectory } from './claude-channel-adapter.js'
import { acquireStorageLease } from './storage-lease.js'
import { canonical, requireValue } from './workspace-schema.js'

const digest = value => `sha256:${createHash('sha256').update(value).digest('hex')}`
const identity = (mapping, config) => ({ ...channelIdentity(mapping), workspaceId: config.workspaceId,
  replicaId: config.replicaId, dataDirectory: config.dataDirectory })
const receiptOf = channel => ['accepted', 'completed'].includes(channel.state) ? channel.receipt : null
// Explicit projections keep revisions and audit records stable when either schema gains columns.
const evidence = (row, channel) => ({
  inbox: { id: row.id, actor: row.actor, state: row.state, reason: row.reason, turnId: row.turn_id, prompt: digest(row.prompt) },
  channel: { state: channel.state, receipt: receiptOf(channel), taskId: channel.task_id, prompt: digest(channel.prompt) },
})
const executionOutcome = 'unverified; abandonment is not evidence of non-execution or completion'

// Offline operator actions never connect to Claude, fabricate acceptance, or replay a notification.
// `step` lets tests stop the process between durable commits.
export async function runClaudeDisposition(target, flags, config, providers, { step = () => {} } = {}) {
  const mapping = config.mappings.find(value => value.actorId === flags.actor)
  requireValue(mapping?.adapter === 'claude-code-channel', 'Select a Claude channel --actor mapping', 'UNSUPPORTED_BRIDGE_ADAPTER')
  requireValue(typeof flags.delivery === 'string' && flags.delivery.length, 'Supply --delivery')
  for (const [directory, filename] of [[config.inboxDirectory, 'inbox.sqlite'], [mapping.channelDirectory, 'deliveries.sqlite']]) {
    await privateChannelDirectory(directory)
    const file = await lstat(join(directory, filename))
    requireValue(file.isFile() && !file.isSymbolicLink() && file.uid === process.getuid(), 'Use existing owned disposition storage', 'CHANNEL_DIRECTORY_UNSAFE')
  }
  let inboxLease, channelLease, inbox, ledger
  try {
    inboxLease = await acquireStorageLease(config.inboxDirectory)
    channelLease = await acquireStorageLease(mapping.channelDirectory)
    inbox = new BridgeInbox(join(config.inboxDirectory, 'inbox.sqlite'), { workspaceId: config.workspaceId, replicaId: config.replicaId })
    ledger = new ChannelLedger(join(mapping.channelDirectory, 'deliveries.sqlite'), identity(mapping, config))
    const row = inbox.rows().find(value => value.id === flags.delivery)
    const channel = ledger.get(flags.delivery)
    requireValue(row && channel && row.actor === mapping.actorId, 'Delivery must exist in both mapped stores', 'NOT_FOUND')
    requireValue(canonical(providers.route(row.mapping)) === canonical(providers.route(mapping)), 'Restore the original delivery route before disposition', 'MAPPING_CHANGED')
    requireValue(row.prompt === channel.prompt && row.mention.taskId === channel.task_id, 'Inbox and channel delivery records differ', 'INVALID_BRIDGE_STATE')
    const binding = { ...identity(mapping, config), inboxDirectory: config.inboxDirectory, route: providers.route(mapping) }
    const prior = evidence(row, channel)
    const revision = digest(canonical({ binding, prior }))
    const current = inbox.dispositionFor(row.id)
    if (target === 'disposition') return { delivery: row.id, actor: row.actor, revision,
      inboxState: row.state, channelState: channel.state, promptDigest: digest(row.prompt), cooperativeReceipt: receiptOf(channel),
      disposition: current && { operationId: current.operationId, state: current.state, request: current.request, prior: current.prior },
      executionOutcome,
      requires: current?.state === 'pending' ? `Rerun bridge dispose with --operation-id ${current.operationId} and its original request`
        : 'Stop the bridge, channel server and native client/effects before an explicit abandonment.' }
    requireValue(flags.decision === 'abandon', 'Only explicit --decision abandon is supported; no automatic retry')
    requireValue(flags['confirm-client-stopped'] === true, 'Confirm the native client and possible effects have stopped with --confirm-client-stopped')
    requireValue(typeof flags.evidence === 'string' && flags.evidence.trim(), 'Supply disposition evidence')
    requireValue(typeof flags['operation-id'] === 'string' && flags['operation-id'].trim(), 'Supply a stable disposition --operation-id')
    requireValue(typeof flags['expected-revision'] === 'string' && flags['expected-revision'].length, 'Supply the inspected --expected-revision')
    const request = { operationId: flags['operation-id'], deliveryId: row.id, decision: 'abandon',
      expectedRevision: flags['expected-revision'], evidence: flags.evidence, clientStopped: true, binding }
    let saved = inbox.disposition(request.operationId)
    if (saved) {
      // A resumed operation skips the revision check: Claude may legitimately accept between commits.
      requireValue(saved.deliveryId === row.id && canonical(saved.request) === canonical(request),
        'Disposition operation ID was reused with another payload', 'OPERATION_ID_REUSED')
    } else {
      requireValue(!current, `Delivery already has disposition ${current?.operationId}`, 'INVALID_BRIDGE_STATE')
      requireValue(mapping.allowedTaskIds.includes(row.mention.taskId) && mapping.allowedFromActorIds.includes(row.mention.fromActorId),
        'Delivery is outside the mapped task or sender scope', 'CHANNEL_SCOPE_DENIED')
      requireValue(revision === request.expectedRevision, 'Delivery evidence changed; inspect again', 'STALE_DISPOSITION')
      requireValue(['queued', 'dispatching', 'uncertain', 'accepted'].includes(row.state) && ['notified', 'accepted'].includes(channel.state),
        'Only previously dispatched, outstanding channel work can be abandoned', 'INVALID_BRIDGE_STATE')
      // Commit 1: the pending disposition is the durable barrier for every later step.
      saved = inbox.recordDisposition(request, prior)
      step('recorded')
    }
    if (saved.state === 'pending') {
      // Commit 2 is guarded and idempotent. Completion first means there is nothing left to abandon.
      if (ledger.abandon(row.id) === 'completed') saved = inbox.withdrawDisposition(request.operationId)
      else {
        step('abandoned')
        // Commit 3: tombstone the inbox row and finalize the disposition together.
        saved = inbox.abandon(request.operationId, `Operator abandonment; execution outcome remains uncertain: ${request.evidence}`)
      }
    }
    return saved.state === 'finalized'
      ? { disposed: true, delivery: row.id, decision: 'abandon', operationId: request.operationId, disposition: 'finalized', executionOutcome: 'unverified' }
      : { disposed: false, delivery: row.id, decision: 'abandon', operationId: request.operationId, disposition: 'withdrawn',
        executionOutcome: 'unverified', reason: 'Claude reported completion before the abandonment applied; nothing was abandoned' }
  } finally {
    try { ledger?.close() }
    finally {
      try { inbox?.close() }
      finally { try { channelLease?.close() } finally { inboxLease?.close() } }
    }
  }
}
