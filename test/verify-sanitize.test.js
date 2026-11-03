import { it } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArguments, readZip, REDACTED, sanitizeTree, writeZip } from '../scripts/verify-sanitize.js'

const script = fileURLToPath(new URL('../scripts/verify-sanitize.js', import.meta.url))
// Disposable values shaped like the ones the acceptance runner captures. None is a real credential.
const secrets = {
  token: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2',
  ticket: 'ticket-9f8e7d6c5b4a39281706f5e4d3c2b1a0',
  claim: 'claim-token-0123456789abcdef0123456789abcdef',
  hub: 'hub-token-fedcba9876543210fedcba9876543210',
}
const lines = records => records.map(record => JSON.stringify(record)).join('\n') + '\n'
const html = ['HTML', {}, ['BODY', {}, ['FORM', {}, ['LABEL', {}, 'Local service token', ['INPUT', { type: 'password', __playwright_value_: secrets.token }]],
  ['LABEL', {}, 'Actor', ['INPUT', { type: 'text', __playwright_value_: 'alice' }]], ['A', { href: `/pairing?ticket=${secrets.ticket}` }, 'Open']]]]

// A fixture shaped like output/acceptance/<run>/seed-N: two trace archives, a report, service logs, a screenshot.
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'pardner-sanitize-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const source = join(root, 'seed-1')
  mkdirSync(source)
  const trace = lines([
    { type: 'context-options', browserName: 'chromium', options: { viewport: { width: 1360, height: 900 } } },
    { type: 'before', callId: 'call@12', class: 'Frame', method: 'fill', params: { selector: 'internal:label="Local service token"i', strict: true, value: secrets.token, timeout: 30000 } },
    { type: 'log', callId: 'call@12', message: `  fill("${secrets.token}")` },
    { type: 'input', callId: 'call@12', inputSnapshot: 'input@call@12' },
    { type: 'after', callId: 'call@12' },
    { type: 'before', callId: 'call@13', class: 'Frame', method: 'fill', params: { selector: 'internal:label="Comment"i', value: 'Human 1 authored offline.' } },
    { type: 'before', callId: 'call@20', class: 'Request', method: 'fetch', params: { url: 'http://127.0.0.1:1/automerge/status', headers: { authorization: `Bearer ${secrets.token}` } } },
    { type: 'log', callId: 'call@20', message: `  authorization: Bearer ${secrets.token}` },
    { type: 'frame-snapshot', snapshot: { callId: 'call@13', snapshotName: 'before@call@13', html, viewport: { width: 1360, height: 900 } } },
    { type: 'screencast-frame', pageId: 'page@1', sha1: 'frame-1.jpeg', width: 800, height: 600, timestamp: 1 },
    { type: 'screencast-frame', pageId: 'page@1', sha1: 'frame-2.jpeg', width: 800, height: 600, timestamp: 2 },
    { type: 'console', messageType: 'info', text: 'ready' },
  ])
  const network = lines([
    { type: 'resource-snapshot', snapshot: { request: { method: 'GET', url: 'http://127.0.0.1:1/automerge/ws-ticket', headers: [{ name: 'Authorization', value: `Bearer ${secrets.token}` }, { name: 'Accept', value: '*/*' }], queryString: [], cookies: [] },
      response: { status: 200, statusText: 'OK', headers: [{ name: 'Content-Type', value: 'application/json' }], content: { mimeType: 'application/json', _sha1: 'r1.json' }, cookies: [] } } },
    { type: 'resource-snapshot', snapshot: { request: { method: 'GET', url: `ws://127.0.0.1:1/?ticket=${secrets.ticket}&replica=2`, headers: [], queryString: [{ name: 'ticket', value: secrets.ticket }, { name: 'replica', value: '2' }], cookies: [] },
      response: { status: 101, statusText: 'Switching Protocols', headers: [], content: {}, cookies: [] } } },
    { type: 'resource-snapshot', snapshot: { request: { method: 'POST', url: 'http://127.0.0.1:1/automerge/operations', headers: [{ name: 'Authorization', value: `Bearer ${secrets.token}` }], postData: { mimeType: 'application/json', text: '{"operationId":"op-1"}' } },
      response: { status: 200, statusText: 'OK', headers: [], content: { mimeType: 'application/json', _sha1: 'r2.json' } } } },
  ])
  const archive = writeZip([
    { name: 'trace.trace', data: Buffer.from(trace) },
    { name: 'trace.network', data: Buffer.from(network) },
    { name: 'trace.stacks', data: Buffer.from('{"files":["acceptance.js"],"stacks":[]}\n') },
    { name: 'resources/r1.json', data: Buffer.from(JSON.stringify({ ticket: secrets.ticket, url: `ws://127.0.0.1:1/?ticket=${secrets.ticket}` })) },
    { name: 'resources/r2.json', data: Buffer.from(JSON.stringify({ acknowledged: true, operationId: 'op-1' })) },
    { name: 'resources/frame-1.jpeg', data: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0xff, 0xd9]) },
    { name: 'resources/frame-2.jpeg', data: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) },
    { name: 'resources/blob.bin', data: Buffer.from([0x00, 0xff, 0xfe, 0x80, 0x81, 0xc0]) },
    { name: 'resources/page.html', data: Buffer.from(`<html><body data-token="${secrets.token}">page</body></html>`) },
  ])
  writeFileSync(join(source, 'browser-0.zip'), archive)
  writeFileSync(join(source, 'browser-1.zip'), writeZip([{ name: 'trace.trace', data: Buffer.from(lines([{ type: 'context-options', browserName: 'chromium' }])) }]))
  writeFileSync(join(source, 'report.json'), JSON.stringify({ seed: 1, scenarioPassed: true, agentEvidence: [{ inbox: [{ id: 'd1', claim_token: secrets.claim, complete: 1 }] }],
    timings: { localAckMs: 12.5 } }, null, 2))
  writeFileSync(join(source, 'service-0.log'), JSON.stringify(['Pardner sync on 127.0.0.1:1', 'Auth mode: token required', 'Allowed CORS origins: http://localhost'], null, 2))
  writeFileSync(join(source, 'notes.txt'), `Plain text with an unparseable line and Bearer ${secrets.token} inside.\nSecond line ${secrets.claim}.\n`)
  writeFileSync(join(source, 'screenshot.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]))
  symlinkSync('../elsewhere', join(source, 'linked'))
  return { root, source, target: join(root, 'sanitized') }
}

function everyText(directory) {
  const texts = []
  for (const entry of readdirSync(directory, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue
    const path = join(entry.parentPath ?? entry.path, entry.name)
    const buffer = readFileSync(path)
    if (path.endsWith('.zip')) for (const { name, data } of readZip(buffer)) texts.push({ path: `${path}:${name}`, text: data.toString('utf8') })
    else texts.push({ path, text: buffer.toString('utf8') })
  }
  return texts
}

it('round-trips ZIP archives it writes and rejects what it cannot read', () => {
  const entries = [{ name: 'a.txt', data: Buffer.from('alpha') }, { name: 'dir/b.json', data: Buffer.alloc(70000, 'x') }]
  assert.deepEqual(readZip(writeZip(entries)).map(({ name, data }) => [name, data.toString()]), entries.map(({ name, data }) => [name, data.toString()]))
  assert.throws(() => readZip(Buffer.from('not an archive at all, long enough to scan')), /Not a ZIP archive/)
})

it('removes every captured credential from a sanitized copy while keeping the verification evidence', t => {
  const { source, target } = fixture(t)
  const before = everyText(source).length
  const manifest = sanitizeTree({ source, target })
  assert.equal(manifest.outcome, 'sanitized')
  assert.equal(manifest.residualCheck.passed, true)
  assert.equal(manifest.credentialValues, 3, 'token, ticket, and claim token')
  assert.equal(everyText(source).length, before, 'the source is untouched')
  for (const { path, text } of everyText(target)) {
    for (const [kind, value] of Object.entries(secrets)) assert.equal(text.includes(value), false, `${kind} survives in ${path}`)
  }
  assert.ok(everyText(source).some(({ text }) => text.includes(secrets.token)), 'the original still holds the credential and stays private')
  assert.equal(existsSync(join(target, 'screenshot.png')), false, 'uninspectable binaries are not copied')
  assert.equal(existsSync(join(target, 'linked')), false, 'links are not followed or copied')
  const entries = readZip(readFileSync(join(target, 'browser-0.zip')))
  const names = entries.map(entry => entry.name)
  assert.deepEqual(names, ['trace.trace', 'trace.network', 'trace.stacks', 'resources/r1.json', 'resources/r2.json', 'resources/page.html'])
  const trace = entries[0].data.toString().trim().split('\n').map(line => JSON.parse(line))
  assert.deepEqual(trace.map(record => record.type), ['context-options', 'before', 'log', 'input', 'after', 'before', 'before', 'log', 'frame-snapshot', 'console'])
  assert.deepEqual(trace[1].params, { selector: 'internal:label="Local service token"i', strict: true, value: REDACTED, timeout: 30000 }, 'the credential-entry action is kept, its value is not')
  assert.equal(trace[2].message, `  fill("${REDACTED}")`)
  assert.equal(trace[5].params.value, 'Human 1 authored offline.', 'ordinary input survives')
  assert.deepEqual(trace[6].params.headers, { authorization: REDACTED })
  assert.equal(trace[7].message, `  authorization: Bearer ${REDACTED}`)
  const snapshot = trace[8].snapshot.html
  const [, , [, , form]] = snapshot
  assert.deepEqual(form[2][3][1], { type: 'password', __playwright_value_: REDACTED })
  assert.deepEqual(form[3][3][1], { type: 'text', __playwright_value_: 'alice' })
  assert.equal(form[4][1].href, `/pairing?ticket=${REDACTED}`)
  const network = entries[1].data.toString().trim().split('\n').map(line => JSON.parse(line).snapshot)
  assert.deepEqual(network[0].request.headers, [{ name: 'Authorization', value: REDACTED }, { name: 'Accept', value: '*/*' }])
  assert.equal(network[0].response.status, 200)
  assert.equal(network[1].request.url, `ws://127.0.0.1:1/?ticket=${REDACTED}&replica=2`)
  assert.deepEqual(network[1].request.queryString, [{ name: 'ticket', value: REDACTED }, { name: 'replica', value: '2' }])
  assert.equal(network[2].request.postData.text, '{"operationId":"op-1"}')
  assert.deepEqual(JSON.parse(entries[3].data.toString()), { ticket: REDACTED, url: `ws://127.0.0.1:1/?ticket=${REDACTED}` })
  assert.equal(entries[5].data.toString(), `<html><body data-token="${REDACTED}">page</body></html>`)
  const report = JSON.parse(readFileSync(join(target, 'report.json'), 'utf8'))
  assert.deepEqual(report.agentEvidence, [{ inbox: [{ id: 'd1', claim_token: REDACTED, complete: 1 }] }])
  assert.equal(report.timings.localAckMs, 12.5)
  assert.equal(readFileSync(join(target, 'notes.txt'), 'utf8'), `Plain text with an unparseable line and Bearer ${REDACTED} inside.\nSecond line ${REDACTED}.\n`)
  assert.deepEqual(JSON.parse(readFileSync(join(target, 'service-0.log'), 'utf8'))[1], 'Auth mode: token required')

  const files = Object.fromEntries(manifest.files.map(record => [record.path, record]))
  assert.deepEqual(files['browser-0.zip'].entries, { total: 9, textRewritten: 4, imagesRemoved: 2, recordsRemoved: 2, unrecognizedRemoved: 1 })
  assert.equal(files['browser-1.zip'].entries.textRewritten, 0)
  assert.equal(files['screenshot.png'].kind, 'binary-not-copied')
  assert.equal(files.linked.kind, 'symlink-not-copied')
  assert.equal(files['report.json'].rewritten, true)
  assert.notEqual(files['browser-0.zip'].sha256Before, files['browser-0.zip'].sha256After)
  const written = JSON.stringify(manifest)
  for (const value of Object.values(secrets)) assert.equal(written.includes(value), false, 'the manifest never records a credential value')
  assert.equal(JSON.parse(readFileSync(join(target, 'sanitization.json'), 'utf8')).outcome, 'sanitized')
})

it('does not claim to detect a credential that appears only as unrecognized free text', t => {
  const { root } = fixture(t)
  const source = join(root, 'free-text')
  mkdirSync(source)
  writeFileSync(join(source, 'service.log'), `hub token ${secrets.hub} accepted\n`)
  const manifest = sanitizeTree({ source, target: join(root, 'free-text-sanitized') })
  assert.equal(manifest.outcome, 'sanitized')
  assert.equal(manifest.credentialValues, 0)
  assert.equal(readFileSync(join(root, 'free-text-sanitized/service.log'), 'utf8').includes(secrets.hub), true,
    'a value with no structural position or recognized pattern is outside the detection boundary; the manifest states it')
  assert.ok(manifest.limitations.some(line => /unrecognized form/.test(line)))
})

it('refuses in-place, nested, and occupied targets, and reports usage errors without writing', t => {
  const { root, source, target } = fixture(t)
  assert.throws(() => sanitizeTree({ source, target: source }), /in place/)
  assert.throws(() => sanitizeTree({ source, target: join(source, 'inner') }), /contain each other/)
  assert.throws(() => sanitizeTree({ source: join(root, 'absent'), target }), /does not exist/)
  mkdirSync(target)
  writeFileSync(join(target, 'occupied'), '')
  assert.throws(() => sanitizeTree({ source, target }), /must be empty/)
  assert.throws(() => parseArguments(['--source', source]), /Usage/)
  assert.throws(() => parseArguments(['--source', source, '--target', target, '--source', source]), /Usage/)
  assert.throws(() => execFileSync(process.execPath, [script, '--source', source, '--target', target], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }), error => {
    assert.equal(error.status, 1)
    assert.match(error.stderr, /must be empty/)
    return true
  })
})

it('sanitizes a single archive through the CLI and prints counts only', t => {
  const { source, target } = fixture(t)
  const output = execFileSync(process.execPath, [script, '--source', join(source, 'browser-0.zip'), '--target', target], { encoding: 'utf8' })
  const summary = JSON.parse(output)
  assert.equal(summary.outcome, 'sanitized')
  assert.equal(summary.files, 1)
  assert.equal(summary.residualCheck.passed, true)
  for (const value of Object.values(secrets)) assert.equal(output.includes(value), false)
  assert.deepEqual(readdirSync(target).sort(), ['browser-0.zip', 'sanitization.json'])
  for (const { name, data } of readZip(readFileSync(join(target, 'browser-0.zip')))) {
    assert.equal(data.toString().includes(secrets.token), false, name)
  }
})
