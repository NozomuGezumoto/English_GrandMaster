/**
 * 全レベル（1-10）の語彙 4 択空欄補充問題を、EVP + Free Dictionary API から生成する。
 * 正解の選択肢位置（A/B/C/D）は毎問ランダムにシャッフル。
 *
 * 実行: node scripts/build-corpus-questions-all.js
 * オプション: --level=2  指定レベルだけ生成（例: 2 で A2 のみ）
 *
 * 出力: data/corpus-questions.json  { "1": [...], "2": [...], ... "10": [...] }
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const EVP_JSON_URL = 'https://raw.githubusercontent.com/Granitosaurus/englishprofile-scraper/main/englishprofile.json';
const DEF_API = 'https://api.dictionaryapi.dev/api/v2/entries/en/';
const OUT_PATH = path.join(__dirname, '..', 'data', 'corpus-questions.json');
const FETCH_DELAY_MS = 350;

/** レベル 1-10 と CEFR の対応（1=A1, 2=A2, 3-4=B1, 5-6=B2, 7-8=C1, 9-10=C2） */
const LEVEL_TO_CEFR = {
  1: 'A1', 2: 'A2',
  3: 'B1', 4: 'B1', 5: 'B2', 6: 'B2',
  7: 'C1', 8: 'C1', 9: 'C2', 10: 'C2'
};

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let body = '';
      res.on('data', (ch) => { body += ch; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function makeClozeSentence(exampleSentence, headword) {
  if (!exampleSentence || typeof exampleSentence !== 'string' || !headword) return null;
  const trimmed = exampleSentence.trim();
  if (!trimmed) return null;
  const h = headword.toLowerCase();
  const re = new RegExp('\\b(' + h.replace(/[.*+?^${}()|[\]\\]/g, '\\$1') + ')\\b', 'i');
  if (!trimmed.match(re)) return null;
  return trimmed.replace(re, '______');
}

function lengthBand(word) {
  const len = (word || '').length;
  if (len <= 4) return 'short';
  if (len <= 8) return 'mid';
  return 'long';
}

async function fetchExampleAndDefinition(word) {
  const enc = encodeURIComponent(word.trim());
  try {
    const data = await fetchJson(DEF_API + enc);
    const first = Array.isArray(data) && data[0];
    const meanings = first?.meanings;
    if (!meanings || !meanings.length) return { example: null, definition: '' };
    for (const m of meanings) {
      const defs = m.definitions;
      if (!defs) continue;
      for (const d of defs) {
        if (d.example && typeof d.example === 'string' && d.example.trim().length > 0) {
          return {
            example: d.example.trim(),
            definition: typeof d.definition === 'string' ? d.definition.trim() : ''
          };
        }
      }
    }
    return { example: null, definition: (meanings[0]?.definitions?.[0]?.definition) || '' };
  } catch (_) {
    return { example: null, definition: '' };
  }
}

async function buildQuestionsForWordList(words, level) {
  const questions = [];
  let skipped = 0;
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const { example, definition } = await fetchExampleAndDefinition(word);
    await sleep(FETCH_DELAY_MS);

    const prompt = example ? makeClozeSentence(example, word) : null;
    if (!prompt || !prompt.includes('______')) {
      skipped++;
      if ((i + 1) % 50 === 0) {
        console.log(`  Level ${level}: ${i + 1}/${words.length}, skipped: ${skipped}`);
      }
      continue;
    }

    const band = lengthBand(word);
    const sameBand = words.filter((w) => w !== word && lengthBand(w) === band);
    let distractors = sameBand.length >= 3
      ? shuffle([...sameBand]).slice(0, 3)
      : shuffle(words.filter((w) => w !== word)).slice(0, 3);

    const choices = [word, ...distractors];
    shuffle(choices);
    const answerIndex = choices.indexOf(word);
    if (answerIndex < 0) continue;

    const explanation = definition
      ? `Target: ${word}. ${definition}`
      : `Target word: ${word}.`;

    questions.push({
      lang: 'en',
      exam: 'toeic',
      level,
      prompt,
      choices,
      answerIndex,
      explanation,
      type: 'cloze',
      source: 'corpus',
      active: true,
      qualityStatus: 'ok'
    });

    if (questions.length % 30 === 0) {
      console.log(`  Level ${level}: built ${questions.length} questions`);
    }
  }
  return { questions, skipped };
}

async function main() {
  const levelArg = process.argv.find((a) => a.startsWith('--level='));
  const singleLevel = levelArg ? parseInt(levelArg.split('=')[1], 10) : null;
  const levelsToBuild = singleLevel != null && singleLevel >= 1 && singleLevel <= 10
    ? [singleLevel]
    : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  console.log('Fetching English Profile (EVP)...');
  const evpEntries = await fetchJson(EVP_JSON_URL);
  const byCefr = { A1: [], A2: [], B1: [], B2: [], C1: [], C2: [] };
  for (const e of evpEntries) {
    const w = (e.baseword || '').trim().toLowerCase();
    const l = (e.level || '').toUpperCase();
    if (w && byCefr[l]) byCefr[l].push(w);
  }
  Object.keys(byCefr).forEach((cefr) => {
    byCefr[cefr] = [...new Set(byCefr[cefr])];
    console.log(`  ${cefr}: ${byCefr[cefr].length} words`);
  });

  let existingByLevel = {};
  if (fs.existsSync(OUT_PATH)) {
    try {
      existingByLevel = JSON.parse(fs.readFileSync(OUT_PATH, 'utf8'));
      if (typeof existingByLevel !== 'object') existingByLevel = {};
    } catch (_) {}
  }

  const byLevel = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [], 8: [], 9: [], 10: [] };
  for (const lv of levelsToBuild) {
    const cefr = LEVEL_TO_CEFR[lv];
    const words = byCefr[cefr] || [];
    if (words.length === 0) {
      console.log(`Level ${lv} (${cefr}): no words, skip`);
      if (Array.isArray(existingByLevel[String(lv)])) byLevel[lv] = existingByLevel[String(lv)];
      continue;
    }
    console.log(`\nBuilding level ${lv} (${cefr}), ${words.length} words...`);
    const { questions } = await buildQuestionsForWordList(words, lv);
    byLevel[lv] = questions;
    console.log(`Level ${lv}: ${questions.length} questions`);
  }

  for (const lv of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
    const key = String(lv);
    if (byLevel[lv].length === 0 && Array.isArray(existingByLevel[key])) {
      byLevel[lv] = existingByLevel[key];
    }
  }

  const dir = path.dirname(OUT_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(byLevel, null, 2), 'utf8');
  console.log(`\nWrote ${OUT_PATH}`);
  Object.entries(byLevel).forEach(([lv, qs]) => {
    const pos = [0, 0, 0, 0];
    qs.forEach((q) => { pos[q.answerIndex]++; });
    console.log(`  Level ${lv}: ${qs.length} questions (A/B/C/D: ${pos.join(', ')})`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
