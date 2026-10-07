import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { bridgeConfig } from '../lib/agent-bridge.js'
import { startClaudeChannel } from '../lib/claude-channel-server.js'
import { requireValue } from '../lib/workspace-schema.js'

// Claude Code starts this MCP subprocess after the user opts in in the local UI.
const [configPath, actorId, ...extra] = process.argv.slice(2)
requireValue(configPath && actorId && !extra.length, 'Usage: node scripts/claude-channel.js CONFIG ACTOR')
const config = await bridgeConfig(configPath)
const mapping = config.mappings.find(value => value.actorId === actorId)
requireValue(mapping?.adapter === 'claude-code-channel' && mapping.enabled, 'Select an enabled Claude channel mapping')
const channel = await startClaudeChannel({ mapping, config, transport: new StdioServerTransport() })
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void channel.close() })
