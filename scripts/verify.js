import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const root = fileURLToPath(new URL('..', import.meta.url))
const args = process.argv.slice(2)
assert.ok(args.length === 0 || (args.length === 2 && args[0] === '--local-ack-ms'
  && Number.isSafeInteger(Number(args[1])) && Number(args[1]) > 0),
  'Usage: node scripts/verify.js [--local-ack-ms POSITIVE_MILLISECONDS]')
async function run(command, args) {
  console.log(`Verifying: ${command} ${args.join(' ')}`)
  const child = spawn(command, args, { cwd: root, stdio: 'inherit' })
  await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0 && !signal) resolve()
      else reject(new Error(`${command} failed with ${signal || code}`))
    })
  })
}

await run('npm', ['run', 'ui:build'])
await run(process.execPath, ['--test'])
await run(process.execPath, ['scripts/acceptance.js', '--repeat', '1', '--seed', '1', ...args])
console.log('Regression, built UI, and one complete acceptance scenario passed.')
