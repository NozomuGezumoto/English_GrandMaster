/**
 * コーパス問題から正解語＋定義を抽出し、data/dictation-vocab.json の対応レベルを差し替える。
 * corpus-questions.json（全レベル）または corpus-questions-a2.json（A2 のみ）に対応。
 *
 * 実行: node scripts/merge-corpus-into-dictation-vocab.js
 *
 * 前提: node scripts/build-corpus-questions-all.js で data/corpus-questions.json を生成するか、
 *       node scripts/build-corpus-questions-a2.js で data/corpus-questions-a2.json を生成する。
 */

const fs = require('fs');
const path = require('path');

const CORPUS_ALL_PATH = path.join(__dirname, '..', 'data', 'corpus-questions.json');
const CORPUS_A2_PATH = path.join(__dirname, '..', 'data', 'corpus-questions-a2.json');
const VOCAB_PATH = path.join(__dirname, '..', 'data', 'dictation-vocab.json');

function extractDefinition(explanation, word) {
  if (!explanation || typeof explanation !== 'string') return '';
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$1');
  const re = new RegExp(`^Target:\\s*${escaped}\\.\\s*`, 'i');
  return explanation.replace(re, '').trim() || '';
}

function extractEntriesFromQuestions(questions) {
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
  return entries;
}

function main() {
  let vocab = {};
  if (fs.existsSync(VOCAB_PATH)) {
    vocab = JSON.parse(fs.readFileSync(VOCAB_PATH, 'utf8'));
  }
  if (typeof vocab !== 'object' || vocab === null) {
    vocab = {};
  }

  if (fs.existsSync(CORPUS_ALL_PATH)) {
    const byLevel = JSON.parse(fs.readFileSync(CORPUS_ALL_PATH, 'utf8'));
    for (const lv of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      const key = String(lv);
      const questions = Array.isArray(byLevel[key]) ? byLevel[key] : [];
      if (questions.length === 0) continue;
      const entries = extractEntriesFromQuestions(questions);
      vocab[key] = entries;
      console.log(`Level ${key}: ${entries.length} words from corpus`);
    }
  } else if (fs.existsSync(CORPUS_A2_PATH)) {
    const questions = JSON.parse(fs.readFileSync(CORPUS_A2_PATH, 'utf8'));
    const list = Array.isArray(questions) ? questions : [];
    const entries = extractEntriesFromQuestions(list);
    vocab['2'] = entries;
    console.log(`Level 2: ${entries.length} words from corpus-questions-a2.json`);
  } else {
    console.error('Not found: corpus-questions.json or corpus-questions-a2.json');
    console.error('Run: node scripts/build-corpus-questions-all.js');
    process.exit(1);
  }

  fs.writeFileSync(VOCAB_PATH, JSON.stringify(vocab, null, 2), 'utf8');
  console.log(`Updated ${VOCAB_PATH}`);
}

main();
