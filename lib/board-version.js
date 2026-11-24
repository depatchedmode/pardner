import { OperationError, requireValue } from './workspace-schema.js'

export const WAIT_TIMEOUT_EXIT_CODE = 2

export function encodeBoardVersion({ workspaceId, heads }) {
  return Buffer.from(JSON.stringify([1, workspaceId, heads])).toString('base64url')
}

export function decodeBoardVersion(boardVersion, workspaceId) {
  const invalid = () => new OperationError('INVALID_BOARD_VERSION', 'Pass the boardVersion returned by a Pardner read')
  if (typeof boardVersion !== 'string' || !/^[A-Za-z0-9_-]+$/.test(boardVersion)) throw invalid()
  let value
  try { value = JSON.parse(Buffer.from(boardVersion, 'base64url').toString('utf8')) } catch { throw invalid() }
  if (!Array.isArray(value) || value.length !== 3) throw invalid()
  const [format, project, heads] = value
  if (format !== 1 || typeof project !== 'string' || !Array.isArray(heads) || !heads.length
    || !heads.every(head => typeof head === 'string' && /^[a-f0-9]{64}$/.test(head))) throw invalid()
  requireValue(project === workspaceId, 'This board version belongs to another project. Read a version from this project.', 'WORKSPACE_MISMATCH')
  return heads
}

export function validateWaitTimeout(milliseconds) {
  requireValue(milliseconds === undefined || (Number.isInteger(milliseconds) && milliseconds > 0 && milliseconds <= 2_147_483_647),
    'Supply a positive --timeout in seconds, up to 2147483.647')
  return milliseconds
}
