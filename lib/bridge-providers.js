import { CodexBridgeAdapter } from './codex-bridge-adapter.js'
import { localEndpoint } from './bridge-endpoints.js'
import { requireValue } from './workspace-schema.js'

export const codexBridgeProvider = Object.freeze({
  id: 'codex-app-server',
  capabilities: Object.freeze({ completionCleanup: true }),
  validateMapping(mapping) {
    requireValue(mapping.sessionOwner === 'bridge', 'Use a dedicated bridge-owned session; Desktop-owned tasks are not qualified')
    requireValue(mapping.expectedPolicy && ['approvalPolicy', 'approvalsReviewer', 'sandbox'].every(key => Object.hasOwn(mapping.expectedPolicy, key)),
      'Pin expectedPolicy to the approvalPolicy, approvalsReviewer, and sandbox returned by the authorized Codex session')
    mapping.endpoint = localEndpoint(mapping.endpoint, ['ws:']).href
  },
  connectionIdentity: mapping => ({ endpoint: mapping.endpoint }),
  create: mapping => new CodexBridgeAdapter(mapping),
  inspectionMapping(flags) {
    requireValue(flags.session && flags.worktree, 'Supply --session and --worktree for a dedicated Codex session')
    return { endpoint: flags.endpoint, threadId: flags.session, worktree: flags.worktree }
  },
})

// Providers are code-defined contracts, not modules loaded from private config.
// Only registered implementations may validate, inspect, or dispatch a mapping.
export class BridgeProviders {
  constructor(providers) {
    this.providers = new Map()
    for (const provider of providers) {
      requireValue(typeof provider.id === 'string' && /^[a-z][a-z0-9-]*$/.test(provider.id)
        && !this.providers.has(provider.id), 'Provider IDs must be valid and unique')
      for (const method of ['validateMapping', 'connectionIdentity', 'create', 'inspectionMapping']) {
        requireValue(typeof provider[method] === 'function', `Provider ${provider.id} requires ${method}`)
      }
      this.providers.set(provider.id, provider)
    }
  }

  get(id) {
    const provider = this.providers.get(id)
    requireValue(provider, `Bridge adapter ${id} is not implemented`, 'UNSUPPORTED_BRIDGE_ADAPTER')
    return provider
  }

  async validate(mapping, { completionCleanup } = {}) {
    const provider = this.get(mapping.adapter)
    requireValue(!completionCleanup || provider.capabilities?.completionCleanup === true,
      `Adapter ${mapping.adapter} does not support completion cleanup`, 'UNSUPPORTED_BRIDGE_CLEANUP')
    await provider.validateMapping(mapping)
  }

  route(mapping) {
    return { actorId: mapping.actorId, adapter: mapping.adapter, sessionOwner: mapping.sessionOwner,
      threadId: mapping.threadId, worktree: mapping.worktree, expectedPolicy: mapping.expectedPolicy,
      connection: this.get(mapping.adapter).connectionIdentity(mapping) }
  }

  create(mapping) { return this.get(mapping.adapter).create(mapping) }

  async inspect(flags, mapping) {
    const provider = this.get(mapping?.adapter ?? flags.adapter ?? 'codex-app-server')
    const target = mapping ?? await provider.inspectionMapping(flags)
    const adapter = provider.create(target)
    try { return await adapter.describe(target) }
    finally { await adapter.close() }
  }
}

export const bridgeProviders = new BridgeProviders([codexBridgeProvider])
