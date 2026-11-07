import assert from 'node:assert/strict'
import test from 'node:test'
import { unmatchedHandles, mentionHint, remarkMentionChips } from '../ui-prototype/src/mentions.js'

const nm = '../ui-prototype/node_modules/'
const { unified } = await import(nm + 'unified/index.js')
const { default: remarkParse } = await import(nm + 'remark-parse/index.js')
const { default: remarkGfm } = await import(nm + 'remark-gfm/index.js')
const { default: remarkRehype } = await import(nm + 'remark-rehype/index.js')

const actors = [{ handle: 'alice' }, { handle: 'builder' }, { handle: 'reviewer' }]

function hast(markdown, delivered) {
  const processor = unified().use(remarkParse).use(remarkGfm).use(remarkMentionChips(delivered)).use(remarkRehype)
  return processor.runSync(processor.parse(markdown))
}
function spans(node, found = []) {
  if (node.type === 'element' && node.tagName === 'span' && [].concat(node.properties?.className ?? []).includes('mention')) found.push(node)
  for (const child of node.children ?? []) spans(child, found)
  return found
}
const chipText = (markdown, delivered) => spans(hast(markdown, delivered)).map(n => n.children[0].value)

test('unmatchedHandles flags handles with no Actor', () => {
  assert.deepEqual(unmatchedHandles('ping @buildr and @alice self', actors), ['buildr'])
})
test('unmatchedHandles is case-insensitive, dedupes and keeps typed case', () => {
  assert.deepEqual(unmatchedHandles('@ALICE @Buildr @buildr @BUILDR x', actors), ['Buildr'])
  assert.deepEqual(unmatchedHandles('@zed @Yan @zed ', actors), ['zed', 'Yan'])
})
test('unmatchedHandles ignores email-like text', () => {
  assert.deepEqual(unmatchedHandles('mail bob@example.com now', actors), [])
  assert.deepEqual(unmatchedHandles('a.b+c@example.com', actors, { focused: false }), [])
})
test('trailing half-typed handle is ignored while focused, flagged once blurred or terminated', () => {
  assert.deepEqual(unmatchedHandles('hi @bui', actors, { focused: true }), [])
  assert.deepEqual(unmatchedHandles('hi @bui', actors, { focused: false }), ['bui'])
  assert.deepEqual(unmatchedHandles('hi @bui', actors), ['bui'])
  assert.deepEqual(unmatchedHandles('hi @bui ', actors, { focused: true }), ['bui'])
  assert.deepEqual(unmatchedHandles('hi @bui.', actors, { focused: true }), ['bui'])
  assert.deepEqual(unmatchedHandles('hi @bui-', actors, { focused: true }), [])
})
test('unmatchedHandles tolerates empty input', () => {
  assert.deepEqual(unmatchedHandles('', actors), [])
  assert.deepEqual(unmatchedHandles(undefined, undefined), [])
  assert.deepEqual(unmatchedHandles('@a', {}), ['a'])
})
test('actors may be an object map', () => {
  assert.deepEqual(unmatchedHandles('@alice @x ', { a: { handle: 'alice' } }), ['x'])
})

test('mentionHint copy for one, two and three or more handles', () => {
  assert.equal(mentionHint([]), null)
  assert.equal(mentionHint(['buildr']), "@buildr matches no Actor and won't notify anyone.")
  assert.equal(mentionHint(['buildr', 'revieww']), "@buildr and @revieww match no Actor and won't notify anyone.")
  assert.equal(mentionHint(['a', 'b', 'c']), "@a, @b and @c match no Actor and won't notify anyone.")
  assert.equal(mentionHint(['a', 'b', 'c', 'd']), "@a, @b, @c and @d match no Actor and won't notify anyone.")
})

test('plugin chips a delivered mention and keeps typed case and title', () => {
  const tree = hast('hello @Builder!', new Map([['builder', 'Builder · agent']]))
  const [chip] = spans(tree)
  assert.equal(chip.children[0].value, '@Builder')
  assert.equal(chip.properties.title, 'Notified Builder · agent')
})
test('plugin accepts a Set and defaults the title label to the handle', () => {
  const [chip] = spans(hast('@builder', new Set(['builder'])))
  assert.equal(chip.properties.title, 'Notified @builder')
})
test('plugin skips code, links, autolinks, emails, partial tokens and undelivered handles', () => {
  const set = new Set(['builder'])
  assert.deepEqual(chipText('`@builder`', set), [])
  assert.deepEqual(chipText('```\n@builder\n```', set), [])
  assert.deepEqual(chipText('[x](https://a/@builder)', set), [])
  assert.deepEqual(chipText('[@builder](https://a)', set), [])
  assert.deepEqual(chipText('https://a.com/@builder', set), [])
  assert.deepEqual(chipText('mail builder@example.com or @builder2', set), [])
  assert.deepEqual(chipText('@builder2 and @builder-x', set), [])
  assert.deepEqual(chipText('@alice', set), [])
})
test('plugin chips several mentions in one text node, including inside emphasis and self-mentions', () => {
  const set = new Set(['builder', 'alice'])
  assert.deepEqual(chipText('@builder, then **@Alice** and @builder.', set), ['@builder', '@Alice', '@builder'])
})
