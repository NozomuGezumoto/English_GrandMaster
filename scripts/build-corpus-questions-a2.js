/**
 * A2 レベル語彙の 4 択空欄補充問題を、公開コーパス（EVP 語彙 + Free Dictionary API 例文）から生成する。
 * 正解の選択肢位置（A/B/C/D）は毎問ランダムにシャッフルする。
 *
 * 実行: node scripts/build-corpus-questions-a2.js
 * 全レベル: node scripts/build-corpus-questions-all.js
 * アップロード: node scripts/upload-corpus-questions.js [--emulator]
 *
 * 出力: data/corpus-questions-a2.json
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const EVP_JSON_URL = 'https://raw.githubusercontent.com/Granitosaurus/englishprofile-scraper/main/englishprofile.json';
const DEF_API = 'https://api.dictionaryapi.dev/api/v2/entries/en/';
const OUT_PATH = path.join(__dirname, '..', 'data', 'corpus-questions-a2.json');
const FETCH_DELAY_MS = 350;
const A2_LEVEL = 2; // アプリ内 level 1-10（A2 = 2）

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

/** Fisher–Yates shuffle (in place), returns the array */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** 例文内でターゲット語（またはその変化形）を探し、最初の出現を "______" に置換する。見つからなければ null */
function makeClozeSentence(exampleSentence, headword) {
  if (!exampleSentence || typeof exampleSentence !== 'string' || !headword) return null;
  const trimmed = exampleSentence.trim();
  if (!trimmed) return null;
  const h = headword.toLowerCase();
  // 単語境界で headword を検索（大文字小文字無視）。見つかった実際の文字列を 1 つだけ置換
  const re = new RegExp('\\b(' + h.replace(/[.*+?^${}()|[\]\\]/g, '\\$1') + ')\\b', 'i');
  const match = trimmed.match(re);
  if (!match) return null;
  return trimmed.replace(re, '______');
}

/** 長さバンド: 1-4, 5-8, 9+ のいずれか（distractor を似た長さにするため） */
function lengthBand(word) {
  const len = (word || '').length;
  if (len <= 4) return 'short';
  if (len <= 8) return 'mid';
  return 'long';
}

/** Free Dictionary API から最初の例文と定義を取得 */
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

async function main() {
  console.log('Fetching English Profile (EVP) for A2 words...');
  const evpEntries = await fetchJson(EVP_JSON_URL);
  const a2Set = new Set();
  for (const e of evpEntries) {
    const w = (e.baseword || '').trim().toLowerCase();
    const l = (e.level || '').toUpperCase();
    if (w && l === 'A2') a2Set.add(w);
  }
  const a2Words = [...a2Set];
  console.log(`A2 words: ${a2Words.length}`);

  const questions = [];
  let skipped = 0;

  for (let i = 0; i < a2Words.length; i++) {
    const word = a2Words[i];
    const { example, definition } = await fetchExampleAndDefinition(word);
    await sleep(FETCH_DELAY_MS);

    const prompt = example ? makeClozeSentence(example, word) : null;
    if (!prompt || !prompt.includes('______')) {
      skipped++;
      if ((i + 1) % 50 === 0) console.log(`  Progress: ${i + 1}/${a2Words.length}, skipped: ${skipped}`);
      continue;
    }

    const band = lengthBand(word);
    const sameBand = a2Words.filter((w) => w !== word && lengthBand(w) === band);
    let distractors = [];
    if (sameBand.length >= 3) {
      const shuffled = shuffle([...sameBand]);
      distractors = shuffled.slice(0, 3);
    } else {
      const other = a2Words.filter((w) => w !== word);
      shuffle(other);
      distractors = other.slice(0, 3);
    }

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
      level: A2_LEVEL,
      prompt,
      choices,
      answerIndex,
      explanation,
      type: 'cloze',
      source: 'corpus',
      active: true,
      qualityStatus: 'ok'
    });

    if ((questions.length) % 30 === 0) {
      console.log(`  Built ${questions.length} questions...`);
    }
  }

  const dir = path.dirname(OUT_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(questions, null, 2), 'utf8');
  console.log(`Wrote ${OUT_PATH}: ${questions.length} questions (skipped ${skipped} no example)`);

  const byPosition = [0, 0, 0, 0];
  questions.forEach((q) => { byPosition[q.answerIndex]++; });
  console.log('Answer position distribution (A/B/C/D):', byPosition);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
