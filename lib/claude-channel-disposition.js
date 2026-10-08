import { createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { lstat } from 'node:fs/promises'
import { join } from 'node:path'
import { ChannelLedger } from './claude-channel-server.js'
import { channelIdentity, privateChannelDirectory } from './claude-channel-adapter.js'
import { openBridgeInbox } from './agent-bridge.js'
import { acquireStorageLease } from './storage-lease.js'
import { canonical, requireValue } from './workspace-schema.js'

const digest = value => `sha256:${createHash('sha256').update(value).digest('hex')}`
const identity = (mapping, config) => ({ ...channelIdentity(mapping), workspaceId: config.workspaceId,
  replicaId: config.replicaId, dataDirectory: config.dataDirectory })

export async function requireNoClaudeDisposition(row) {
  if (row?.mapping.adapter !== 'claude-code-channel') return
  const database = new DatabaseSync(join(row.mapping.channelDirectory, 'deliveries.sqlite'), { readOnly: true })
  try {
    if (database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'dispositions'").get()) {
      requireValue(!database.prepare('SELECT 1 FROM dispositions WHERE delivery_id = ?').get(row.id),
        'A recorded channel abandonment must be finalized with its original operation; reconciliation cannot revive it', 'INVALID_BRIDGE_STATE')
    }
  } finally { database.close() }
}

// Offline operator actions never connect to Claude, fabricate acceptance, or replay a notification.
export async function runClaudeDisposition(target, flags, config, providers) {
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
    inbox = await openBridgeInbox(config)
    ledger = new ChannelLedger(join(mapping.channelDirectory, 'deliveries.sqlite'), identity(mapping, config))
    const row = inbox.rows().find(value => value.id === flags.delivery)
    const channel = ledger.get(flags.delivery)
    requireValue(row && channel && row.actor === mapping.actorId, 'Delivery must exist in both mapped stores', 'NOT_FOUND')
    requireValue(canonical(providers.route(row.mapping)) === canonical(providers.route(mapping)), 'Restore the original delivery route before disposition', 'MAPPING_CHANGED')
    requireValue(row.prompt === channel.prompt && row.mention.taskId === channel.task_id
      && mapping.allowedTaskIds.includes(row.mention.taskId) && mapping.allowedFromActorIds.includes(row.mention.fromActorId),
    'Delivery evidence or authorization differs', 'CHANNEL_SCOPE_DENIED')
    const binding = { ...identity(mapping, config), inboxDirectory: config.inboxDirectory, route: providers.route(mapping) }
    const revision = digest(canonical({ binding, inbox: row, channel }))
    const saved = ledger.dispositionFor(flags.delivery)
    const savedIntent = inbox.dispositionIntentFor(flags.delivery)
    const inspectedDecision = saved ?? savedIntent
    if (target === 'disposition') return { delivery: row.id, actor: row.actor, revision,
      inboxState: row.state, channelState: channel.state, promptDigest: digest(row.prompt),
      cooperativeReceipt: ['accepted', 'completed'].includes(channel.state) ? channel.receipt : null,
      disposition: inspectedDecision ? { operationId: inspectedDecision.operation_id,
        finalized: Boolean(inspectedDecision.finalized) && (!savedIntent || Boolean(savedIntent.finalized)), request: inspectedDecision.request } : null,
      executionOutcome: 'unverified; abandonment is not evidence of non-execution or completion',
      requires: 'Stop the bridge, channel server and native client/effects before an explicit abandonment.' }
    requireValue(flags.decision === 'abandon', 'Only explicit --decision abandon is supported; no automatic retry')
    requireValue(flags['confirm-client-stopped'] === true, 'Confirm the native client and possible effects have stopped with --confirm-client-stopped')
    requireValue(typeof flags.evidence === 'string' && flags.evidence.trim(), 'Supply disposition evidence')
    requireValue(typeof flags['operation-id'] === 'string' && flags['operation-id'].trim(), 'Supply a stable disposition --operation-id')
    requireValue(typeof flags['expected-revision'] === 'string' && flags['expected-revision'].length, 'Supply the inspected --expected-revision')
    const request = { operationId: flags['operation-id'], deliveryId: row.id, decision: 'abandon',
      expectedRevision: flags['expected-revision'], evidence: flags.evidence, clientStopped: true, binding }
    const priorOperation = ledger.disposition(request.operationId)
    const priorInboxOperation = inbox.disposition(request.operationId)
    const priorInboxDelivery = inbox.dispositionFor(row.id)
    const priorIntent = inbox.dispositionIntent(request.operationId)
    if (savedIntent) requireValue(savedIntent.operation_id === request.operationId
      && canonical(savedIntent.request) === canonical(request), 'Inbox delivery has another disposition intent', 'OPERATION_ID_REUSED')
    if (priorIntent) requireValue(priorIntent.delivery_id === row.id && canonical(priorIntent.request) === canonical(request),
      'Inbox disposition intent operation was reused with another payload', 'OPERATION_ID_REUSED')
    if (priorInboxDelivery) requireValue(priorInboxDelivery.operation_id === request.operationId
      && canonical(priorInboxDelivery.request) === canonical(request), 'Inbox delivery has another disposition', 'OPERATION_ID_REUSED')
    if (priorInboxOperation) requireValue(priorInboxOperation.delivery_id === row.id
      && canonical(priorInboxOperation.request) === canonical(request),
    'Inbox disposition operation was reused with another payload', 'OPERATION_ID_REUSED')
    if (priorOperation) requireValue(priorOperation.delivery_id === row.id && canonical(priorOperation.request) === canonical(request),
      'Disposition operation was reused with another payload', 'OPERATION_ID_REUSED')
    else {
      requireValue(!saved, 'Delivery already has a different disposition', 'INVALID_BRIDGE_STATE')
      requireValue(revision === request.expectedRevision, 'Delivery evidence changed; inspect again', 'STALE_DISPOSITION')
      requireValue(['queued', 'dispatching', 'uncertain', 'accepted'].includes(row.state)
        && typeof row.prompt === 'string' && row.prompt.length && ['notified', 'accepted'].includes(channel.state),
      'Only previously dispatched, outstanding channel work can be abandoned', 'INVALID_BRIDGE_STATE')
    }
    // Record the original decision in the inbox before either store changes delivery evidence.
    // Recovery and all dispatch paths respect this barrier even if the channel commit never happens.
    const intent = inbox.prepareAbandon(row.id, request, priorOperation?.prior.inbox ?? row, priorOperation?.prior.channel ?? channel)
    const decision = priorOperation ?? ledger.abandon(row.id, request, intent.prior.inbox)
    requireValue(canonical(ledger.get(row.id)) === canonical({ ...decision.prior.channel, state: 'abandoned' }),
      'Channel evidence changed since the disposition decision', 'STALE_DISPOSITION')
    // Release both barriers only after applying the identical decision to both stores.
    // Any crash retains the original evidence for an explicit same-ID retry.
    inbox.abandon(row.id, request, decision.prior.inbox)
    ledger.finalizeDisposition(request.operationId)
    inbox.finalizeDispositionIntent(request.operationId)
    return { disposed: true, delivery: row.id, decision: 'abandon', operationId: request.operationId,
      finalized: true, executionOutcome: 'unverified', retried: false, originalEvidenceRetained: true }
  } finally {
    try { ledger?.close() }
    finally {
      try { inbox?.close() }
      finally { try { channelLease?.close() } finally { inboxLease?.close() } }
    }
  }
}
