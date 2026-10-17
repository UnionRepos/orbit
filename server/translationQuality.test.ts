import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fitsTranslationBudget, INDEX_CONTEXT_TOKENS, INDEX_OUTPUT_TOKENS, translationQualityIssue, translationUsageIssue } from './translationQuality.ts'
import { joinTranslationPieces, splitTranslationText, utf8Length } from '../shared/translationChunks.ts'
import { translationPrompt } from './translation.ts'

test('byte-aware chunks preserve a >15K-character multilingual document exactly', () => {
  const input = Array.from({ length: 480 }, (_, index) => `Section ${index}: 开源项目的说明和安装步骤。 Emoji 😀; code ⟪ORBIT_${index}⟫.\n`).join('')
  assert.ok(input.length > 15000)
  const pieces = splitTranslationText(input)
  assert.equal(pieces.join(''), input)
  assert.ok(pieces.every((piece) => piece.length <= 1200 && utf8Length(piece) <= 1800))
  assert.equal(pieces.flatMap((piece) => piece.match(/⟪ORBIT_\d+⟫/g) ?? []).length, 480)
  assert.ok(pieces.every((piece) => !/[\uD800-\uDBFF]$/.test(piece)))
  assert.throws(() => splitTranslationText(input, 0), RangeError)
})

test('translated pieces retain paragraph/word separators and do not add spaces to Chinese', () => {
  assert.equal(joinTranslationPieces(['Hello.\n\n', 'Next paragraph.'], ['你好。', '下一段。']), '你好。\n\n下一段。')
  assert.equal(joinTranslationPieces(['First ', 'second'], ['First', 'second']), 'First second')
  assert.equal(joinTranslationPieces(['中文', '内容'], ['Chinese', 'content']), 'Chinese content')
  assert.equal(joinTranslationPieces(['中文', '内容'], ['中文', '内容']), '中文内容')
})

test('upstream budget reserves 4K output and context overhead, and accounts for UTF-8', () => {
  assert.equal(INDEX_OUTPUT_TOKENS, 4096)
  assert.equal(INDEX_CONTEXT_TOKENS, 16384)
  const text = '说明'.repeat(200)
  assert.equal(fitsTranslationBudget(translationPrompt([text], 'en'), [text]), true)
  assert.equal(fitsTranslationBudget(translationPrompt([text, text], 'en'), [text, text]), false)
  assert.equal(fitsTranslationBudget('x'.repeat(13000), ['Hi']), false)
})

test('valid stop outputs with abnormal per-passage compression or repetition are rejected', () => {
  const source = Array.from({ length: 35 }, (_, index) => `Section ${index} describes a distinct part of the project.`).join(' ')
  assert.equal(translationQualityIssue(source, 'A short summary.'), 'abnormal-compression')
  assert.equal(translationQualityIssue(source, 'The same sentence keeps appearing. '.repeat(80)), 'repetition-loop')
  assert.equal(translationQualityIssue(source, '不断重复的中文句子。'.repeat(80)), 'repetition-loop')
  assert.equal(translationQualityIssue('Welcome to Orbit', '欢迎使用 Orbit'), null)
  const legitimate = 'This source deliberately repeats the same instruction. '.repeat(30)
  assert.equal(translationQualityIssue(legitimate, legitimate), null)
  assert.equal(translationQualityIssue('⟪ORBIT_0⟫ '.repeat(25), '⟪ORBIT_0⟫ '.repeat(25)), null)
})

test('script-aware compression allows normal English/Chinese length differences', () => {
  const english = 'The project provides tools for developers to build and maintain open source applications. '.repeat(10)
  const chinese = '该项目提供工具，帮助开发者构建和维护开源应用。'.repeat(10)
  assert.equal(translationQualityIssue(english, chinese), null)
  assert.equal(translationQualityIssue(chinese, english), null)
})

test('usage limits and token compression remain failure signals even with finish_reason=stop', () => {
  const source = 'An extensive explanation of how this project works. '.repeat(20)
  assert.equal(translationUsageIssue({ completion_tokens: 4096, prompt_tokens: 2000 }, source), 'output-limit')
  assert.equal(translationUsageIssue({ total_tokens: 16384 }, source), 'context-limit')
  assert.equal(translationUsageIssue({ prompt_tokens: 12500, completion_tokens: 200 }, source), 'context-limit')
  assert.equal(translationUsageIssue({ prompt_tokens: 1000, completion_tokens: 30 }, source), 'token-compression')
  assert.equal(translationUsageIssue({ prompt_tokens: 500, completion_tokens: 300 }, source), null)
  assert.equal(translationUsageIssue(undefined, source), null)
})
