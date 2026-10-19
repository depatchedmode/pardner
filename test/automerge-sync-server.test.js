#!/usr/bin/env node

import { it } from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { request, createServer as createHttpServer } from 'node:http'
import { LanAccess } from '../lib/lan-access.js'
import { setTimeout as delay } from 'node:timers/promises'
import { WebSocket } from 'ws'

import {
  createTempDir,
  cleanupTempDir,
  createServer,
  withStartedServer,
  httpUrl,
  wsUrl,
  TEST_TOKEN,
} from '../support/resources.js'

function withTempServer(overrides, fn) {
  const storagePath = createTempDir('pardner-sync-test-')
  try {
    return fn(createServer(storagePath, overrides))
  } finally {
    cleanupTempDir(storagePath)
  }
}

function requestWebSocketUpgrade(url, options = {}) {
  const target = new URL(url)

  return new Promise((resolve, reject) => {
    const req = request({
      hostname: target.hostname,
      port: target.port,
      path: `${target.pathname}${target.search}`,
      method: 'GET',
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Key': Buffer.alloc(16, 7).toString('base64'),
        'Sec-WebSocket-Version': '13',
        ...(options.origin ? { Origin: options.origin } : {}),
        ...(options.headers || {}),
      },
    })

    const timeout = setTimeout(() => {
      req.destroy(new Error(`Timed out waiting for websocket upgrade response: ${url}`))
    }, 2000)

    let settled = false
    const finish = callback => value => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      callback(value)
    }

    req.once('response', res => {
      const chunks = []
      res.on('data', chunk => chunks.push(Buffer.from(chunk)))
      res.on('end', () => {
        finish(resolve)({
          statusCode: res.statusCode,
          body: Buffer.concat(chunks).toString('utf8'),
          headers: res.headers,
        })
      })
      res.resume()
    })

    req.once('upgrade', (res, socket, head) => {
      socket.destroy()
      finish(resolve)({
        statusCode: res.statusCode ?? 101,
        body: head.toString('utf8'),
        headers: res.headers,
      })
    })

    req.once('error', finish(reject))
    req.end()
  })
}

async function expectWebSocketOpen(url, options = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, options)
    const timeout = setTimeout(() => {
      try {
        ws.terminate()
      } catch {
        // Ignore shutdown failures for test timeouts.
      }
      reject(new Error(`Timed out waiting for websocket open: ${url}`))
    }, 2000)

    const fail = message => {
      clearTimeout(timeout)
      try {
        ws.terminate()
      } catch {
        // Ignore shutdown failures after an expected rejection.
      }
      reject(new Error(message))
    }

    ws.once('open', () => {
      clearTimeout(timeout)
      resolve(ws)
    })
    ws.once('unexpected-response', (_req, res) => {
      const chunks = []
      res.on('data', chunk => chunks.push(Buffer.from(chunk)))
      res.on('end', () => {
        fail(
          `Expected websocket open, got HTTP ${res.statusCode}: ${Buffer.concat(chunks).toString('utf8')}`
        )
      })
      res.resume()
    })
    ws.once('error', error => {
      fail(`Expected websocket open, got error: ${error.message}`)
    })
  })
}

it('requires an API token unless insecure local mode is enabled', () => {
  assert.throws(
    () => withTempServer({ apiToken: '', allowInsecureLocal: false }, () => {}),
    /PARDNER_API_TOKEN is required/
  )

  assert.doesNotThrow(() => withTempServer({ apiToken: '', allowInsecureLocal: true }, () => {}))
})

for (const host of ['', '0.0.0.0', '::', '192.168.1.5', '2001:db8::1', 'localhost', 'local.example', '127.1', '127.0.0.1.example', '::ffff:192.168.1.5']) {
  it(`rejects unauthenticated bind configuration for ${JSON.stringify(host)}`, () => {
    for (const overrides of [
      { host, apiToken: '', allowInsecureLocal: true },
      { apiToken: undefined, env: { PARDNER_API_TOKEN: '', PARDNER_ALLOW_INSECURE_LOCAL: '1', PARDNER_BIND_HOST: host } },
    ]) {
      assert.throws(() => withTempServer(overrides, () => {}), /numeric loopback/)
    }
  })
}

for (const host of ['127.0.0.1', '::1']) {
  it(`serves unauthenticated HTTP and both WebSockets only on loopback ${host}`, async () => {
    await withStartedServer({ host, apiToken: '', allowInsecureLocal: true }, async server => {
      assert.equal(server.httpServer.address().address, host)
      assert.equal(server.wsHttpServer.address().address, host)
      const authority = host.includes(':') ? `[${host}]` : host
      assert.equal((await fetch(`http://${authority}:${server.httpPort}/automerge/doc`)).status, 200)
      for (const path of ['/', '/automerge']) {
        const socket = await expectWebSocketOpen(`ws://${authority}:${server.wsPort}${path}`)
        socket.terminate()
      }
    })
  })
}

it('rechecks changed configuration before startup and at each listener', async () => {
  const directory = createTempDir('pardner-bind-')
  const server = createServer(directory, { apiToken: '', allowInsecureLocal: true })
  const listener = createHttpServer()
  try {
    server.host = '0.0.0.0'
    await assert.rejects(server.start(), /numeric loopback/)
    assert.equal(server.httpServer, null)
    await assert.rejects(server.listen(listener, 0, '0.0.0.0'), /numeric loopback/)
    assert.equal(listener.listening, false)
  } finally {
    await server.stop()
    cleanupTempDir(directory)
  }
})

it('keeps persisted LAN access disabled when the loopback service has no token', async () => {
  const directory = createTempDir('pardner-insecure-lan-')
  const options = { interfaces: () => [{ name: 'wifi', address: '192.168.1.5' }] }
  const initial = createServer(directory)
  await initial.store.init()
  await initial.stop()
  const saved = new LanAccess(directory, options)
  await saved.load()
  await saved.configure({ enabled: true, interfaceName: 'wifi' })
  const access = new LanAccess(directory, options)
  const server = createServer(directory, { access, apiToken: '', allowInsecureLocal: true })
  try {
    await server.start()
    assert.equal(access.saved.enabled, true)
    assert.equal(access.active, null)
    assert.equal(server.lanServers.length, 0)
    assert.match(access.diagnostic, /token-protected loopback/)
    assert.equal((await fetch(httpUrl(server, '/automerge/doc'))).status, 200)
  } finally {
    await server.stop()
    cleanupTempDir(directory)
  }
})

it('preserves token enforcement on an explicit wildcard bind', async () => {
  await withStartedServer({ host: '0.0.0.0' }, async server => {
    assert.equal(server.httpServer.address().address, '0.0.0.0')
    assert.equal((await fetch(`http://127.0.0.1:${server.httpPort}/automerge/doc`)).status, 401)
    assert.equal((await fetch(`http://127.0.0.1:${server.httpPort}/automerge/doc`, {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    })).status, 200)
    for (const path of ['/', '/automerge']) {
      assert.equal((await requestWebSocketUpgrade(`http://127.0.0.1:${server.wsPort}${path}`)).statusCode, 401)
    }
  })
})

it('binds to loopback by default', () => {
  withTempServer({}, server => {
    assert.equal(server.host, '127.0.0.1')
  })
})

it('rejects wildcard origin configuration', () => {
  assert.throws(
    () => withTempServer({ allowedOrigins: '*' }, () => {}),
    /Wildcard "\*" is not supported/
  )
})

it('allows authorized GET requests and allowlisted preflight requests', async () => {
  await withStartedServer({}, async server => {
    const getResponse = await fetch(httpUrl(server, '/automerge/doc'), {
      headers: {
        Authorization: `Bearer ${TEST_TOKEN}`,
        Origin: 'http://allowed.example',
      },
    })

    assert.equal(getResponse.status, 200)
    assert.equal(getResponse.headers.get('access-control-allow-origin'), 'http://allowed.example')
    assert.equal((await getResponse.json()).success, true)

    const preflightResponse = await fetch(httpUrl(server, '/automerge/doc'), {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://allowed.example',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'Authorization',
      },
    })

    assert.equal(preflightResponse.status, 204)
    assert.equal(
      preflightResponse.headers.get('access-control-allow-origin'),
      'http://allowed.example'
    )
    assert.match(
      preflightResponse.headers.get('access-control-allow-headers') || '',
      /Authorization/
    )
  })
})

it('rejects disallowed origins for GET and preflight requests', async () => {
  await withStartedServer({}, async server => {
    const getResponse = await fetch(httpUrl(server, '/automerge/doc'), {
      headers: {
        Authorization: `Bearer ${TEST_TOKEN}`,
        Origin: 'http://denied.example',
      },
    })

    assert.equal(getResponse.status, 403)
    assert.match((await getResponse.json()).error, /Origin not allowed/)

    const preflightResponse = await fetch(httpUrl(server, '/automerge/doc'), {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://denied.example',
        'Access-Control-Request-Method': 'GET',
      },
    })

    assert.equal(preflightResponse.status, 403)
    assert.match((await preflightResponse.json()).error, /Origin not allowed/)
    assert.equal(server.getSecurityCounters().httpOriginRejected, 2)
  })
})

it('rejects unauthorized HTTP requests and accepts authorized ones', async () => {
  await withStartedServer({}, async server => {
    const unauthorizedResponse = await fetch(httpUrl(server, '/automerge/doc'))
    assert.equal(unauthorizedResponse.status, 401)
    assert.match((await unauthorizedResponse.json()).error, /Unauthorized/)

    const authorizedResponse = await fetch(httpUrl(server, '/automerge/doc'), {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    })
    assert.equal(authorizedResponse.status, 200)
  })
})

it('does not allow legacy query tokens on HTTP requests', async () => {
  await withStartedServer({ allowLegacyWsQueryToken: true }, async server => {
    const response = await fetch(httpUrl(server, `/automerge/doc?token=${TEST_TOKEN}`))
    assert.equal(response.status, 401)
  })
})

it('rejects unauthorized websocket upgrades before the socket opens', async () => {
  await withStartedServer({}, async server => {
    const result = await requestWebSocketUpgrade(wsUrl(server), {
      origin: 'http://allowed.example',
    })

    assert.equal(result.statusCode, 401)
    assert.match(result.body, /Unauthorized/)
  })
})

it('rejects disallowed websocket origins before the socket opens', async () => {
  await withStartedServer({}, async server => {
    const result = await requestWebSocketUpgrade(wsUrl(server), {
      origin: 'http://denied.example',
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    })

    assert.equal(result.statusCode, 403)
    assert.match(result.body, /Origin not allowed/)
  })
})

it('consumes websocket tickets after a single successful use and rejects expired tickets', async () => {
  await withStartedServer({ wsTicketTtlMs: 25 }, async server => {
    const ticketResponse = await fetch(httpUrl(server, '/automerge/ws-ticket'), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TEST_TOKEN}`,
        Origin: 'http://allowed.example',
        'Content-Type': 'application/json',
      },
    })
    const firstTicket = (await ticketResponse.json()).ticket

    const firstConnection = await expectWebSocketOpen(wsUrl(server, `/?ticket=${firstTicket}`), {
      origin: 'http://allowed.example',
    })
    firstConnection.close()
    await once(firstConnection, 'close')

    const reusedConnection = await requestWebSocketUpgrade(wsUrl(server, `/?ticket=${firstTicket}`), {
      origin: 'http://allowed.example',
    })
    assert.equal(reusedConnection.statusCode, 401)

    const secondTicketResponse = await fetch(httpUrl(server, '/automerge/ws-ticket'), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TEST_TOKEN}`,
        Origin: 'http://allowed.example',
        'Content-Type': 'application/json',
      },
    })
    const secondTicket = (await secondTicketResponse.json()).ticket

    await delay(40)

    const expiredConnection = await requestWebSocketUpgrade(wsUrl(server, `/?ticket=${secondTicket}`), {
      origin: 'http://allowed.example',
    })
    assert.equal(expiredConnection.statusCode, 401)
  })
})

it('allows legacy websocket query tokens only when the compatibility flag is enabled', async () => {
  await withStartedServer({ allowLegacyWsQueryToken: false }, async disabledServer => {
    const disabledResult = await requestWebSocketUpgrade(
      wsUrl(disabledServer, `/?token=${TEST_TOKEN}`),
      {
        origin: 'http://allowed.example',
      }
    )
    assert.equal(disabledResult.statusCode, 401)
  })

  await withStartedServer({ allowLegacyWsQueryToken: true }, async enabledServer => {
    const enabledSocket = await expectWebSocketOpen(wsUrl(enabledServer, `/?token=${TEST_TOKEN}`), {
      origin: 'http://allowed.example',
    })
    enabledSocket.close()
    await once(enabledSocket, 'close')
  })
})

it('records task-linked commits through attributed HTTP operations', async () => {
  await withStartedServer({}, async server => {
    const send = async (operationId, type, payload) => {
      const response = await fetch(httpUrl(server, '/automerge/operations'), {
        method: 'POST', headers: { Authorization: `Bearer ${TEST_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ operationId, actorId: 'builder', type, payload }),
      })
      assert.equal(response.status, 200)
      const receipt = await response.json()
      assert.equal(receipt.savedLocally, true)
      return receipt
    }
    const created = await send('create-commit-task', 'task.create', { title: 'Task with evidence' })
    const taskId = created.result.taskId
    const commit = { hash: '1234567890abcdef', message: 'Link commit through supported runtime', diff: { shortstat: '1 file changed' } }
    const receipt = await send('link-commit', 'task.link-commit', { taskId, commit })
    const context = server.store.workspace.taskContext(taskId)
    assert.deepEqual(context.evidence, [commit])
    const event = context.history.find(event => event.operationId === receipt.operationId)
    assert.equal(event.actorId, 'builder')
    assert.equal(event.taskId, taskId)
  })
})
