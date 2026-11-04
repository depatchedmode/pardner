import { pathToFileURL } from 'node:url'
import { readFileSync } from 'node:fs'
const { summarizeTasks } = await import(pathToFileURL(process.argv[2]).href)
const cases = JSON.parse(readFileSync(0, 'utf8'))
const before = JSON.stringify(cases)
const results = cases.map(tasks => summarizeTasks(tasks))
if (JSON.stringify(cases) !== before) throw new Error('Candidate mutated input')
process.stdout.write(JSON.stringify(results))
