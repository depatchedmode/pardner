import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
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
await run('python3', ['-B', '-m', 'unittest', 'discover', '-s', 'test', '-p', 'control_runtime_test.py'])
await run(process.execPath, ['--test'])
await run(process.execPath, ['scripts/acceptance.js', '--repeat', '1', '--seed', '1'])
console.log('Regression, built UI, and one complete acceptance scenario passed.')
