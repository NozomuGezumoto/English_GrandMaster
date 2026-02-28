/**
 * A2 コーパス問題（corpus-questions-a2.json）から正解語＋定義を抽出し、
 * data/dictation-vocab.json のレベル 2（A2）を差し替える。
 * Study タブのディクテーションで A2 の語がコーパス由来になる。
 *
 * 実行: node scripts/merge-corpus-a2-into-dictation-vocab.js
 *
 * 前提: node scripts/build-corpus-questions-a2.js で data/corpus-questions-a2.json が存在すること。
 */

const fs = require('fs');
const path = require('path');

const CORPUS_PATH = path.join(__dirname, '..', 'data', 'corpus-questions-a2.json');
const VOCAB_PATH = path.join(__dirname, '..', 'data', 'dictation-vocab.json');
const LEVEL_KEY = '2';

function extractDefinition(explanation, word) {
  if (!explanation || typeof explanation !== 'string') return '';
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$1');
  const re = new RegExp(`^Target:\\s*${escaped}\\.\\s*`, 'i');
  return explanation.replace(re, '').trim() || '';
}

function main() {
  if (!fs.existsSync(CORPUS_PATH)) {
    console.error('Not found:', CORPUS_PATH);
    console.error('Run first: node scripts/build-corpus-questions-a2.js');
    process.exit(1);
  }

  const corpus = JSON.parse(fs.readFileSync(CORPUS_PATH, 'utf8'));
  const questions = Array.isArray(corpus) ? corpus : [];
  const seen = new Set();
  const entries = [];

  for (const q of questions) {
    const choices = q.choices;
    const answerIndex = q.answerIndex;
    if (!Array.isArray(choices) || answerIndex < 0 || answerIndex >= choices.length) continue;
    const word = String(choices[answerIndex]).trim().toLowerCase();
    if (!word || seen.has(word)) continue;
    seen.add(word);
    const definition = extractDefinition(q.explanation, word);
    entries.push({ word, definition });
  }

  console.log(`Extracted ${entries.length} unique A2 words from corpus questions.`);

  let vocab = {};
  if (fs.existsSync(VOCAB_PATH)) {
    vocab = JSON.parse(fs.readFileSync(VOCAB_PATH, 'utf8'));
  }
  if (typeof vocab !== 'object' || vocab === null) {
    vocab = {};
  }

  vocab[LEVEL_KEY] = entries;
  fs.writeFileSync(VOCAB_PATH, JSON.stringify(vocab, null, 2), 'utf8');
  console.log(`Updated ${VOCAB_PATH}: level "${LEVEL_KEY}" now has ${entries.length} words (corpus A2).`);
}

main();
