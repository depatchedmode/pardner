#!/usr/bin/env node
// Produce a sanitized copy of verification artifacts (Playwright trace archives, reports, logs) that
// captured disposable credentials. Originals are never modified; the copy records its transformation.
import { createHash } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, realpathSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { crc32, deflateRawSync, inflateRawSync } from 'node:zlib'

export const REDACTED = '[REDACTED]'
const credentialKey = /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|x-auth-token|token|ticket|claim_?token|hub_?token|access_?token|refresh_?token|secret|password|credential|api_?key|pairing_?code)$/i
const credentialSelector = /token|password|secret|credential|ticket|pairing/i
const inputMethods = new Set(['fill', 'type', 'press', 'insertText', 'pressSequentially'])
const credentialQuery = /([?&](?:ticket|token|code|key|secret|claim_token|hub_token|access_token)=)(?!\[REDACTED\])([^&"'\s\\<>]+)/gi
const bearer = /(\bBearer\s+)([A-Za-z0-9._~+/=-]{8,})/gi
const imageEntry = /\.(jpe?g|png|webp|gif|bmp)$/i
const jsonLines = /\.(trace|network|stacks|jsonl)$/

// --- Minimal ZIP support (stored and deflated entries, no zip64) ---------------------------------
export function readZip(buffer) {
  const eocdSignature = 0x06054b50
  let eocd = -1
  for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 22 - 65535); offset--) {
    if (buffer.readUInt32LE(offset) === eocdSignature) { eocd = offset; break }
  }
  if (eocd < 0) throw new Error('Not a ZIP archive (no end-of-central-directory record)')
  const count = buffer.readUInt16LE(eocd + 10)
  const directoryOffset = buffer.readUInt32LE(eocd + 16)
  if (count === 0xffff || directoryOffset === 0xffffffff) throw new Error('Unsupported zip64 archive')
  const entries = []
  let offset = directoryOffset
  for (let index = 0; index < count; index++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('Corrupt ZIP central directory')
    const method = buffer.readUInt16LE(offset + 10)
    const compressedSize = buffer.readUInt32LE(offset + 20)
    const size = buffer.readUInt32LE(offset + 24)
    const nameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    const localOffset = buffer.readUInt32LE(offset + 42)
    if (compressedSize === 0xffffffff || size === 0xffffffff || localOffset === 0xffffffff) throw new Error('Unsupported zip64 archive')
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf8')
    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error(`Corrupt ZIP local header for ${name}`)
    const dataOffset = localOffset + 30 + buffer.readUInt16LE(localOffset + 26) + buffer.readUInt16LE(localOffset + 28)
    const compressed = buffer.subarray(dataOffset, dataOffset + compressedSize)
    let data
    if (method === 0) data = compressed
    else if (method === 8) data = inflateRawSync(compressed)
    else throw new Error(`Unsupported ZIP compression method ${method} for ${name}`)
    if (data.length !== size) throw new Error(`ZIP entry ${name} size mismatch`)
    entries.push({ name, data })
    offset += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

export function writeZip(entries) {
  const locals = [], directory = []
  let offset = 0
  for (const { name, data } of entries) {
    const nameBuffer = Buffer.from(name, 'utf8')
    const compressed = deflateRawSync(data)
    const checksum = crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8)
    local.writeUInt16LE(0, 10); local.writeUInt16LE(0x21, 12); local.writeUInt32LE(checksum, 14)
    local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBuffer.length, 26); local.writeUInt16LE(0, 28)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(8, 10)
    central.writeUInt16LE(0, 12); central.writeUInt16LE(0x21, 14); central.writeUInt32LE(checksum, 16); central.writeUInt32LE(compressed.length, 20)
    central.writeUInt32LE(data.length, 24); central.writeUInt16LE(nameBuffer.length, 28); central.writeUInt16LE(0, 30); central.writeUInt16LE(0, 32)
    central.writeUInt16LE(0, 34); central.writeUInt16LE(0, 36); central.writeUInt32LE(0, 38); central.writeUInt32LE(offset, 42)
    locals.push(local, nameBuffer, compressed)
    directory.push(central, nameBuffer)
    offset += local.length + nameBuffer.length + compressed.length
  }
  const directoryBuffer = Buffer.concat(directory)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(directoryBuffer.length, 12); end.writeUInt32LE(offset, 16); end.writeUInt16LE(0, 20)
  return Buffer.concat([...locals, directoryBuffer, end])
}

// --- Credential collection and redaction ---------------------------------------------------------
const decoder = new TextDecoder('utf-8', { fatal: true })
const asText = buffer => { try { return decoder.decode(buffer) } catch { return null } }
const headerValue = value => value.replace(/^(Bearer|Basic|Digest|Token)\s+/i, '')
// Collected values plus a count of in-place redactions, so a file is reported as rewritten only when
// something was redacted, not when JSON was merely reformatted.
const tracker = () => ({ values: new Set(), redactions: 0, add(value) {
  if (!value || value === REDACTED) return
  this.values.add(value)
  this.redactions++
} })

function collectCredential(name, value, secrets) {
  secrets.add(headerValue(value))
  if (!/^(cookie|set-cookie)$/i.test(name)) return
  for (const line of value.split(/\r?\n/)) {
    const pairs = /^set-cookie$/i.test(name) ? [line.split(';')[0]] : line.split(';')
    for (const pair of pairs) {
      const equals = pair.indexOf('=')
      if (equals < 0) continue
      const cookie = pair.slice(equals + 1).trim()
      secrets.add(cookie.startsWith('"') && cookie.endsWith('"') ? cookie.slice(1, -1) : cookie)
    }
  }
}

// Walk a JSON value, collecting credential values from structured positions and replacing them in place.
function redactValue(value, secrets, context = {}) {
  if (Array.isArray(value)) {
    // Playwright DOM snapshots are nested arrays: [tag, attributes, ...children].
    if (typeof value[0] === 'string' && value[1] && typeof value[1] === 'object' && !Array.isArray(value[1])) {
      const attributes = value[1]
      if (/^input$/i.test(value[0]) && /^password$/i.test(attributes.type ?? '') && typeof attributes.__playwright_value_ === 'string') {
        secrets.add(attributes.__playwright_value_)
        attributes.__playwright_value_ = REDACTED
      }
    }
    for (let index = 0; index < value.length; index++) value[index] = redactValue(value[index], secrets, context)
    return value
  }
  if (!value || typeof value !== 'object') return typeof value === 'string' ? redactText(value, secrets) : value
  if (context.cookie && typeof value.value === 'string') {
    secrets.add(value.value)
    value.value = REDACTED
  } else if (typeof value.name === 'string' && typeof value.value === 'string' && credentialKey.test(value.name)) {
    collectCredential(value.name, value.value, secrets)
    value.value = REDACTED
  }
  const method = typeof value.method === 'string' ? value.method : context.method
  for (const key of Object.keys(value)) {
    const child = value[key]
    if (typeof child === 'string' && credentialKey.test(key)) {
      collectCredential(key, child, secrets)
      value[key] = REDACTED
    } else if (key.toLowerCase() === 'cookies' && Array.isArray(child)) {
      value[key] = redactValue(child, secrets, { method, cookie: true })
    } else if (key === 'params' && child && typeof child === 'object' && inputMethods.has(method ?? '') && typeof child.selector === 'string' && credentialSelector.test(child.selector)) {
      for (const field of ['value', 'text', 'key']) if (typeof child[field] === 'string') { secrets.add(child[field]); child[field] = REDACTED }
      value[key] = redactValue(child, secrets, { method })
    } else {
      value[key] = redactValue(child, secrets, { method })
    }
  }
  return value
}

// Pattern-based collection inside free text: bearer schemes and credential query parameters.
function redactText(text, secrets) {
  return text
    .replace(bearer, (_, prefix, token) => { secrets.add(token); return `${prefix}${REDACTED}` })
    .replace(credentialQuery, (_, prefix, token) => { secrets.add(token); return `${prefix}${REDACTED}` })
}

function redactDocument(text, secrets) {
  let parsed
  try { parsed = JSON.parse(text) } catch { return redactText(text, secrets) }
  const indent = /^[[{]\r?\n( +)/.exec(text)?.[1].length
  return JSON.stringify(redactValue(parsed, secrets), null, indent) + (text.endsWith('\n') ? '\n' : '')
}

function redactEntry(name, text, secrets) {
  if (!jsonLines.test(name)) return redactDocument(text, secrets)
  return text.split('\n').map(line => line === '' ? line : redactDocument(line, secrets)).join('\n')
}

const replaceAll = (text, values) => {
  for (const value of values) text = text.split(value).join(REDACTED)
  return text
}

function mapStrings(value, transform) {
  if (typeof value === 'string') return transform(value)
  if (Array.isArray(value)) return value.map(child => mapStrings(child, transform))
  if (!value || typeof value !== 'object') return value
  const entries = Object.entries(value).map(([key, child]) => [transform(key), mapStrings(child, transform)])
  if (new Set(entries.map(([key]) => key)).size !== entries.length) throw new Error('Redaction would collide JSON keys; no artifact was written')
  return Object.fromEntries(entries)
}

// Work on decoded strings so quotes, backslashes and other JSON escapes cannot conceal a copy.
function replaceDocument(text, values) {
  let parsed
  try { parsed = JSON.parse(text) } catch { return replaceAll(text, values) }
  const indent = /^[[{]\r?\n( +)/.exec(text)?.[1].length
  return JSON.stringify(mapStrings(parsed, value => replaceAll(value, values)), null, indent) + (text.endsWith('\n') ? '\n' : '')
}

function replaceEntry(name, text, values) {
  return jsonLines.test(name) ? text.split('\n').map(line => replaceDocument(line, values)).join('\n') : replaceDocument(text, values)
}

function decodedTexts(name, text) {
  const texts = [text]
  for (const document of jsonLines.test(name) ? text.split('\n') : [text]) {
    let parsed
    try { parsed = JSON.parse(document) } catch { continue }
    mapStrings(parsed, value => { texts.push(value); return value })
  }
  return texts
}

const sha256 = buffer => createHash('sha256').update(buffer).digest('hex')

// --- Tree processing -----------------------------------------------------------------------------
function listFiles(root) {
  const stat = lstatSync(root)
  if (!stat.isDirectory()) return [{ path: basename(root), absolute: root, stat }]
  const found = []
  const walk = directory => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = join(directory, entry.name)
      const stat = lstatSync(absolute)
      if (stat.isDirectory()) walk(absolute)
      else found.push({ path: relative(root, absolute), absolute, stat })
    }
  }
  walk(root)
  return found
}

function sanitizeArchive(buffer, secrets) {
  const entries = readZip(buffer)
  const counts = { total: entries.length, textRewritten: 0, imagesRemoved: 0, recordsRemoved: 0, unrecognizedRemoved: 0 }
  const kept = []
  const removedResources = new Set()
  for (const { name, data } of entries) {
    if (imageEntry.test(name)) { counts.imagesRemoved++; removedResources.add(name.split('/').at(-1)); continue }
    const text = asText(data)
    if (text === null) { counts.unrecognizedRemoved++; removedResources.add(name.split('/').at(-1)); continue }
    kept.push({ name, text })
  }
  const output = []
  for (const { name, text } of kept) {
    const redactionsBefore = secrets.redactions
    let next = redactEntry(name, text, secrets)
    if (jsonLines.test(name)) {
      // Drop records that only reference removed binary frames (screencast frames) so the trace stays consistent.
      const lines = next.split('\n')
      const filtered = lines.filter(line => {
        if (line === '') return true
        try {
          const record = JSON.parse(line)
          const references = record.type === 'screencast-frame' || (typeof record.sha1 === 'string' && removedResources.has(record.sha1))
          if (references) counts.recordsRemoved++
          return !references
        } catch { return true }
      })
      next = filtered.join('\n')
    }
    output.push({ name, next, redacted: secrets.redactions > redactionsBefore })
  }
  return { counts, output }
}

// Resolve existing ancestors too: a new target below a symlink must not alias the source.
function canonicalPath(path) {
  path = resolve(path)
  return existsSync(path) ? realpathSync(path) : join(canonicalPath(dirname(path)), basename(path))
}

function checkPaths(paths) {
  const seen = new Set()
  for (const path of paths) {
    if (!path || path.startsWith('/') || path.includes('\\') || path.split('/').some(part => part === '..' || part === '.')) throw new Error('Unsafe artifact path; no artifact was written')
    // Copies may be shared across case-insensitive and Unicode-normalizing filesystems.
    const portable = path.normalize('NFC').toLowerCase()
    if (seen.has(portable)) throw new Error('Redaction would collide artifact paths; no artifact was written')
    seen.add(portable)
  }
  for (const path of seen) {
    const parts = path.split('/')
    while (parts.length > 1) {
      parts.pop()
      if (seen.has(parts.join('/'))) throw new Error('Redaction would collide a file and directory; no artifact was written')
    }
  }
}

export function sanitizeTree({ source, target }) {
  source = resolve(source)
  if (!existsSync(source)) throw new Error(`Source does not exist: ${source}`)
  source = realpathSync(source)
  target = canonicalPath(target)
  if (source === target) throw new Error('Refusing to sanitize in place: target must differ from source')
  const inside = (child, parent) => child === parent || child.startsWith(parent + sep)
  if (inside(target, source) || inside(source, target)) throw new Error('Source and target must not contain each other')
  if (existsSync(target) && readdirSync(target).length) throw new Error(`Target must be empty or absent: ${target}`)
  const startedAt = new Date().toISOString()
  const secrets = tracker()
  const files = listFiles(source)
  // Pass 1: structural collection and redaction of every text artifact, in memory.
  const prepared = []
  for (const file of files) {
    const record = { path: file.path }
    if (file.stat.isSymbolicLink()) { record.kind = 'symlink-not-copied'; record.target = readlinkSync(file.absolute); prepared.push({ record }); continue }
    const buffer = readFileSync(file.absolute)
    record.sha256Before = sha256(buffer)
    record.bytesBefore = buffer.length
    if (/\.zip$/i.test(file.absolute)) {
      try {
        const { counts, output } = sanitizeArchive(buffer, secrets)
        prepared.push({ record: { ...record, kind: 'archive', entries: counts }, output })
      } catch (error) {
        prepared.push({ record: { ...record, kind: 'unrecognized-archive-not-copied', error: error.message } })
      }
      continue
    }
    const text = asText(buffer)
    if (text === null) { prepared.push({ record: { ...record, kind: 'binary-not-copied' } }); continue }
    const redactionsBefore = secrets.redactions
    const next = redactEntry(file.absolute.split(/[\\/]/).at(-1), text, secrets)
    prepared.push({ record: { ...record, kind: 'text' }, next, redacted: secrets.redactions > redactionsBefore })
  }
  // Metadata can contain the same credential patterns as artifact bodies.
  const metadata = redactValue({ source, target, files: prepared.map(item => item.record) }, secrets)
  // Pass 2: replace every collected value, including short values, across content and names.
  const global = [...secrets.values].sort((a, b) => b.length - a.length)
  const scrub = text => replaceAll(text, global)
  for (const item of prepared) {
    for (const key of ['path', 'target', 'error']) if (typeof item.record[key] === 'string') item.record[key] = scrub(item.record[key])
  }
  const manifest = {
    schemaVersion: 1, source: scrub(metadata.source), target: scrub(metadata.target), startedAt, outcome: 'sanitized', credentialValues: secrets.values.size,
    credentialValuesReplacedGlobally: global.length, credentialValuesRedactedInPlaceOnly: 0, files: [],
    policy: 'Collected credential values from structured positions (authorization headers, individual cookie values in headers and HAR arrays, credential-named JSON keys, credential input actions, password inputs in DOM snapshots, bearer schemes, and credential query parameters), redacted them in place, then replaced every collected value in retained text, decoded JSON strings, artifact names and metadata. Image frames, records that reference them, and any entry or file that is not UTF-8 text were removed rather than copied. Path collisions or a residual value prevent all output.',
    limitations: ['Sanitized copies are not the original traces: screenshot playback and removed binary entries are unavailable.', 'Collection depends on recognizable positions and patterns; a credential that appears only in an unrecognized form is not detected. Review the manifest counts against what the run captured.', 'Originals remain where they were and still contain credentials; keep them private.'],
  }
  const written = []
  for (const item of prepared) {
    const { record } = item
    manifest.files.push(record)
    if (record.kind === 'archive') {
      const entries = item.output.map(({ name, next, redacted }) => {
        const final = replaceEntry(name, next, global)
        if (redacted || final !== next) record.entries.textRewritten++
        return { name: scrub(name), data: Buffer.from(final, 'utf8') }
      })
      checkPaths(entries.map(entry => entry.name))
      const buffer = writeZip(entries)
      record.sha256After = sha256(buffer)
      record.bytesAfter = buffer.length
      written.push({ path: record.path, buffer, texts: entries.flatMap(entry => [entry.name, ...decodedTexts(entry.name, entry.data.toString('utf8'))]) })
    } else if (record.kind === 'text') {
      const final = replaceEntry(record.path, item.next, global)
      record.rewritten = item.redacted || final !== item.next
      const buffer = Buffer.from(final, 'utf8')
      record.sha256After = sha256(buffer)
      record.bytesAfter = buffer.length
      written.push({ path: record.path, buffer, texts: decodedTexts(record.path, final) })
    }
  }
  // Residual check on the exact bytes about to be written. Nothing is written if a collected value survives.
  const residual = { passed: true, occurrences: 0, patternMatches: 0 }
  manifest.finishedAt = new Date().toISOString()
  manifest.residualCheck = residual
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`
  checkPaths(['sanitization.json', ...written.map(item => item.path)])
  for (const text of [...written.flatMap(item => [item.path, ...item.texts]), ...decodedTexts('sanitization.json', manifestText)]) {
    for (const value of global) residual.occurrences += text.split(value).length - 1
    residual.patternMatches += (text.match(bearer)?.length ?? 0) + (text.match(credentialQuery)?.length ?? 0)
  }
  residual.passed = residual.occurrences === 0 && residual.patternMatches === 0
  if (!residual.passed) throw new Error('A collected credential or credential pattern survived sanitization; no artifact was written')
  mkdirSync(target, { recursive: true })
  for (const item of written) {
    const destination = join(target, item.path)
    mkdirSync(dirname(destination), { recursive: true })
    writeFileSync(destination, item.buffer, { mode: 0o600, flag: 'wx' })
  }
  writeFileSync(join(target, 'sanitization.json'), manifestText, { mode: 0o600, flag: 'wx' })
  return manifest
}

export function parseArguments(args) {
  const usage = 'Usage: node scripts/verify-sanitize.js --source DIR_OR_FILE --target DIR'
  const options = {}
  for (let index = 0; index < args.length; index += 2) {
    const [name, value] = [args[index], args[index + 1]]
    if (!['--source', '--target'].includes(name) || value === undefined || name.slice(2) in options) throw new Error(usage)
    options[name.slice(2)] = value
  }
  if (!options.source || !options.target) throw new Error(usage)
  return options
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const manifest = sanitizeTree(parseArguments(process.argv.slice(2)))
    const { outcome, credentialValues, residualCheck, files, target } = manifest
    console.log(JSON.stringify({ outcome, credentialValues, residualCheck, files: files.length, manifest: join(target, 'sanitization.json') }))
    if (outcome !== 'sanitized') process.exitCode = 1
  } catch (error) {
    console.error(`Cannot sanitize: ${error.message}`)
    process.exitCode = 1
  }
}
