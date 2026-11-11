#!/usr/bin/env node
// Node marks node:sqlite experimental; that warning is not Pardner output, so it is dropped before the CLI loads.
// The CLI is imported dynamically because static imports are hoisted above this filter.
const emitWarning = process.emitWarning
process.emitWarning = (warning, ...rest) => {
  const type = typeof rest[0] === 'string' ? rest[0] : rest[0]?.type ?? warning?.name
  if (type === 'ExperimentalWarning' && /SQLite/.test(String(warning?.message ?? warning))) return
  return emitWarning.call(process, warning, ...rest)
}
const { runCommand } = await import('../lib/cli.js')

try {
  const result = await runCommand(process.argv.slice(2))
  // Help and listings are text for people; --json prints the result as data, without the listing text.
  if ((result.help || result.listing) && !process.argv.includes('--json')) process.stdout.write(result.help ?? result.listing)
  else {
    const { listing, ...data } = result
    process.stdout.write(`${JSON.stringify({ success: true, ...data })}\n`)
  }
} catch (error) {
  const result = { success: false, error: { code: error.code ?? 'INTERNAL_ERROR', message: error.message, details: error.details ?? null } }
  process.stdout.write(`${JSON.stringify(result)}\n`)
  process.stderr.write(`${result.error.code}: ${result.error.message}\n`)
  process.exitCode = 1
}
