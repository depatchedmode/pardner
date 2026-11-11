// Test-only: opens a hub runtime on a restored directory and kills itself with SIGKILL at `killAt`, one step of
// the hub's waiting sequence, so a test can check what the hub's own state survives. The fixture's machine key
// arrives over the IPC channel, never through arguments, the environment or a file.
//
//   start-before-save       the hub detected the restore but has not saved its state
//   start-after-save        the hub saved its waiting state at start
//   note-before-save        a member's later checkpoint was seen and not yet saved
//   note-after-save         the newest checkpoint seen was saved
//   catch-up-before-resume  a member's checkpoint and records were taken in, the waiting state not yet cleared
//   resume-before-save      the hub is clearing its waiting state and has not saved it
//   resume-after-save       the hub saved that it resumed
import { machineKeyFromPem } from '../lib/machine-key.js'
import { WorkspaceRuntime } from '../lib/workspace-runtime.js'

const die = () => process.kill(process.pid, 'SIGKILL')
process.once('message', async ({ directory, pem, genesis, killAt, checkpoint, records, by }) => {
  const save = WorkspaceRuntime.prototype.saveHubState
  let started = false
  WorkspaceRuntime.prototype.saveHubState = async function (...args) {
    const step = !started ? 'start' : this.hubState.waiting ? 'note' : 'resume'
    if (killAt === `${step}-before-save`) die()
    await save.apply(this, args)
    if (killAt === `${step}-after-save`) die()
  }
  const runtime = new WorkspaceRuntime({ directory, role: 'hub', machineKey: machineKeyFromPem(pem), genesis })
  await runtime.init()
  started = true
  await runtime.noteCheckpoint(checkpoint)
  runtime.admitRecords(records)
  if (killAt === 'catch-up-before-resume') die()
  await runtime.resumeHub(by)
  process.exit(3)
})
setTimeout(() => process.exit(4), 15000).unref()
