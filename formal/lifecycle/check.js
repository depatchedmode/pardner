#!/usr/bin/env node
/**
 * Lifecycle model check: source/model drift check, bounded model check, and a
 * readable counterexample when a property fails.
 *
 *   node formal/lifecycle/check.js                 # drift check + model check with default bounds
 *   node formal/lifecycle/check.js --mutate NAME   # mirror a source mutation in the model (expect a counterexample)
 *   node formal/lifecycle/check.js --drift-only    # only compare mapped sources with mapping.json
 *   node formal/lifecycle/check.js --accept-drift  # rewrite mapping.json after re-reviewing the mapping
 *   node formal/lifecycle/check.js --json          # machine-readable result on stdout
 *
 * Exit codes: 0 pass, 1 property violation, 2 drift or missing anchor, 3 usage or state limit, 4 unreachable coverage witness.
 */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { StateLimitExceeded, check } from './checker.js'
import { DEFAULT_BOUNDS, MUTATIONS, createModel, describeState } from './model.js'

const here = fileURLToPath(new URL('.', import.meta.url))
export const repositoryRoot = resolve(here, '..', '..')
export const mappingPath = join(here, 'mapping.json')

export function parseArguments(argv) {
  const options = { root: repositoryRoot, bounds: { ...DEFAULT_BOUNDS }, mutation: null, json: false, driftOnly: false, acceptDrift: false, skipDrift: false, maxStates: 1500000 }
  const boundNames = { '--replica-edits': 'replicaEdits', '--hub-ops': 'hubOps', '--ack-attempts': 'ackAttempts', '--storage-failures': 'storageFailures' }
  for (let i = 0; i < argv.length; i++) {
    const argument = argv[i]
    if (argument in boundNames) {
      const value = Number(argv[++i])
      if (!Number.isInteger(value) || value < 0) throw new Error(`${argument} expects a non-negative integer`)
      options.bounds[boundNames[argument]] = value
    } else if (argument === '--mutate') options.mutation = argv[++i]
    else if (argument === '--root') options.root = resolve(argv[++i])
    else if (argument === '--max-states') options.maxStates = Number(argv[++i])
    else if (argument === '--json') options.json = true
    else if (argument === '--drift-only') options.driftOnly = true
    else if (argument === '--accept-drift') options.acceptDrift = true
    else if (argument === '--skip-drift') options.skipDrift = true
    else if (argument === '--help' || argument === '-h') options.help = true
    else throw new Error(`Unknown argument: ${argument}`)
  }
  if (options.mutation && !(options.mutation in MUTATIONS)) throw new Error(`Unknown mutation ${options.mutation}; known: ${Object.keys(MUTATIONS).join(', ')}`)
  return options
}

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')

export function mappedFiles(model) {
  return [...new Set(model.actions.flatMap(action => action.maps.map(entry => entry.file)))].sort()
}

export function readMapping() {
  return JSON.parse(readFileSync(mappingPath, 'utf8'))
}

export function describeSources(root, model) {
  const files = {}
  for (const file of mappedFiles(model)) files[file] = sha256(readFileSync(join(root, file)))
  return files
}

/** Compare mapped sources under `root` with the recorded manifest and verify every anchor is present. */
export function checkDrift(root, model, mapping) {
  const files = describeSources(root, model)
  const drifted = Object.entries(files).filter(([file, hash]) => mapping.files[file] !== hash).map(([file]) => file)
  const unmapped = Object.keys(mapping.files).filter(file => !(file in files))
  const missingAnchors = []
  const contents = Object.fromEntries(Object.keys(files).map(file => [file, readFileSync(join(root, file), 'utf8')]))
  for (const action of model.actions) {
    for (const entry of action.maps) {
      const count = contents[entry.file].split(entry.anchor).length - 1
      if (count !== 1) missingAnchors.push({ action: action.name, file: entry.file, anchor: entry.anchor, occurrences: count })
    }
  }
  const affectedActions = [...new Set(model.actions
    .filter(action => action.maps.some(entry => drifted.includes(entry.file)))
    .map(action => action.name.replace(/\(.*\)$/, '')))]
  return { ok: drifted.length === 0 && unmapped.length === 0 && missingAnchors.length === 0, files, drifted, unmapped, missingAnchors, affectedActions, revision: mapping.revision }
}

export function currentRevision(root) {
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim() } catch { return null }
}

export function formatTrace(steps, model) {
  return steps.map((step, i) => `${String(i).padStart(3)}  ${(step.via ?? 'Init').padEnd(44)} ${describeState(step.state, model)}`).join('\n')
}

function main() {
  let options
  try { options = parseArguments(process.argv.slice(2)) } catch (error) { console.error(error.message); process.exit(3) }
  if (options.help) { console.log(readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0].replace(/^\/\*\*\n/, '').replace(/^ \* ?/gm, '')); return }
  const model = createModel({ bounds: options.bounds, mutation: options.mutation })
  const report = { tool: 'formal/lifecycle/check.js', node: process.version, root: options.root, bounds: options.bounds, mutation: options.mutation }

  if (options.acceptDrift) {
    const mapping = { revision: currentRevision(options.root), files: describeSources(options.root, model) }
    const drift = checkDrift(options.root, model, mapping)
    if (drift.missingAnchors.length) {
      console.error('Cannot accept the mapping while anchors are missing:')
      for (const entry of drift.missingAnchors) console.error(`  ${entry.action} -> ${entry.file}: ${JSON.stringify(entry.anchor)} (${entry.occurrences} occurrences)`)
      process.exit(2)
    }
    writeFileSync(mappingPath, `${JSON.stringify(mapping, null, 2)}\n`)
    console.log(`Recorded mapping for revision ${mapping.revision} over ${Object.keys(mapping.files).length} files.`)
    return
  }

  if (!options.skipDrift) {
    const drift = checkDrift(options.root, model, readMapping())
    report.drift = drift
    if (!drift.ok) {
      if (options.json) console.log(JSON.stringify(report, null, 2))
      else {
        console.error(`Source/model drift against mapping revision ${drift.revision}.`)
        for (const file of drift.drifted) console.error(`  changed: ${file}`)
        for (const file of drift.unmapped) console.error(`  no longer mapped: ${file}`)
        for (const entry of drift.missingAnchors) console.error(`  anchor for ${entry.action} in ${entry.file} found ${entry.occurrences} times: ${JSON.stringify(entry.anchor)}`)
        if (drift.affectedActions.length) console.error(`  re-review model actions: ${drift.affectedActions.join(', ')}`)
        console.error('Re-review formal/lifecycle/model.js against the changed code, then run with --accept-drift.')
      }
      process.exit(2)
    }
  }
  if (options.driftOnly) {
    if (options.json) console.log(JSON.stringify(report, null, 2))
    else console.log(`Mapped sources match mapping revision ${report.drift.revision}; all ${model.actions.reduce((n, action) => n + action.maps.length, 0)} anchors present.`)
    return
  }

  let result
  try { result = check(model, { maxStates: options.maxStates }) } catch (error) {
    if (!(error instanceof StateLimitExceeded)) throw error
    console.error(error.message)
    process.exit(3)
  }
  report.states = result.states
  report.edges = result.edges
  report.durationMs = result.durationMs
  report.properties = { invariants: model.invariants.map(invariant => invariant.name), progress: model.progress.name }
  report.fairActions = [...new Set(model.actions.filter(action => action.fair).map(action => action.name.replace(/\(.*\)$/, '')))]
  report.violation = result.invariant ? { kind: 'invariant', property: result.invariant.invariant }
    : result.progress ? { kind: result.progress.kind, property: result.progress.property } : null
  report.witnesses = result.witnesses
  const unreachable = result.invariant || result.progress ? [] : Object.entries(result.witnesses).filter(([, count]) => count === 0).map(([name]) => name)
  report.unreachableWitnesses = unreachable
  if (options.json) {
    report.trace = result.invariant?.trace.map(step => ({ via: step.via, state: step.state })) ?? result.progress?.trace.map(step => ({ via: step.via, state: step.state })) ?? null
    report.cycle = result.progress?.cycle?.map(step => ({ via: step.via, state: step.state })) ?? null
    console.log(JSON.stringify(report, null, 2))
  } else {
    console.log(`Lifecycle model${options.mutation ? ` (mutation ${options.mutation}: ${MUTATIONS[options.mutation]})` : ''}`)
    console.log(`Bounds ${JSON.stringify(options.bounds)}; ${result.states} states, ${result.edges} transitions, ${result.durationMs} ms.`)
    if (result.invariant) {
      console.log(`\nINVARIANT VIOLATED: ${result.invariant.invariant}`)
      console.log(formatTrace(result.invariant.trace, model))
    } else if (result.progress) {
      console.log(`\nPROGRESS VIOLATED: ${result.progress.property} (${result.progress.kind})`)
      console.log(formatTrace(result.progress.trace, model))
      if (result.progress.kind === 'stutter') console.log(`Only unfair actions remain enabled: ${result.progress.enabledUnfairActions.join(', ') || 'none'}`)
      else console.log(`Fair cycle through ${result.progress.componentSize} states:\n${formatTrace(result.progress.cycle, model)}`)
    } else {
      console.log(`All invariants hold: ${model.invariants.map(invariant => invariant.name).join(', ')}.`)
      console.log(`Progress holds: ${model.progress.name} under weak fairness of ${report.fairActions.join(', ')}.`)
      console.log('Coverage witnesses (states):')
      for (const [name, count] of Object.entries(result.witnesses)) console.log(`  ${String(count).padStart(7)}  ${name}`)
      if (unreachable.length) console.log('UNREACHABLE WITNESSES: the bounds do not cover these scenarios; the result is vacuous for them.')
    }
  }
  process.exit(result.invariant || result.progress ? 1 : unreachable.length ? 4 : 0)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
