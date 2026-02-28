/**
 * English Profile (EVP) の語彙リストを取得し、レベル別100語ずつで data/dictation-vocab.json を生成する。
 * 実行: node scripts/build-dictation-vocab.js
 * 要: ネットワーク（GitHub raw）
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const EVP_JSON_URL = 'https://raw.githubusercontent.com/Granitosaurus/englishprofile-scraper/main/englishprofile.json';
const OUT_PATH = path.join(__dirname, '..', 'data', 'dictation-vocab.json');
const WORDS_PER_LEVEL = 100;
const WITH_DEFINITIONS = process.argv.includes('--with-definitions');
const DEF_API = 'https://api.dictionaryapi.dev/api/v2/entries/en/';
const FETCH_DELAY_MS = 400;

/** CEFR → 当アプリのレベル(1-10)。レベル1=A1, 2=A2, 3-4=B1, 5-6=B2, 7-8=C1, 9-10=C2 */
function cefrToLevels(cefr) {
  switch (cefr) {
    case 'A1': return [1];
    case 'A2': return [2];
    case 'B1': return [3, 4];
    case 'B2': return [5, 6];
    case 'C1': return [7, 8];
    case 'C2': return [9, 10];
    default: return [];
  }
}

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

function fetchDefinition(word) {
  const enc = encodeURIComponent(word.trim());
  return fetchJson(DEF_API + enc).then((data) => {
    const first = Array.isArray(data) && data[0];
    const meanings = first?.meanings;
    const def = meanings?.[0]?.definitions?.[0]?.definition;
    return typeof def === 'string' ? def.trim() : '';
  }).catch(() => '');
}

function main() {
  console.log('Fetching English Profile word list...');
  fetchJson(EVP_JSON_URL)
    .then(async (entries) => {
      // CEFRごとにユニークな baseword を収集（小文字）
      const byCefr = { A1: new Set(), A2: new Set(), B1: new Set(), B2: new Set(), C1: new Set(), C2: new Set() };
      for (const e of entries) {
        const w = (e.baseword || '').trim().toLowerCase();
        const l = (e.level || '').toUpperCase();
        if (w && byCefr[l]) byCefr[l].add(w);
      }
      // レベル1-10で各100語を割り当て（{ word, definition } 形式。定義は --with-definitions で取得）
      const toEntry = (w) => ({ word: w, definition: '' });
      const byLevel = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [], 8: [], 9: [], 10: [] };
      const a1 = [...byCefr.A1]; byLevel[1] = a1.slice(0, WORDS_PER_LEVEL).map(toEntry);
      const a2 = [...byCefr.A2]; byLevel[2] = a2.slice(0, WORDS_PER_LEVEL).map(toEntry);
      const b1 = [...byCefr.B1]; byLevel[3] = b1.slice(0, WORDS_PER_LEVEL).map(toEntry); byLevel[4] = b1.slice(WORDS_PER_LEVEL, WORDS_PER_LEVEL * 2).map(toEntry);
      const b2 = [...byCefr.B2]; byLevel[5] = b2.slice(0, WORDS_PER_LEVEL).map(toEntry); byLevel[6] = b2.slice(WORDS_PER_LEVEL, WORDS_PER_LEVEL * 2).map(toEntry);
      const c1 = [...byCefr.C1]; byLevel[7] = c1.slice(0, WORDS_PER_LEVEL).map(toEntry); byLevel[8] = c1.slice(WORDS_PER_LEVEL, WORDS_PER_LEVEL * 2).map(toEntry);
      const c2 = [...byCefr.C2]; byLevel[9] = c2.slice(0, WORDS_PER_LEVEL).map(toEntry); byLevel[10] = c2.slice(WORDS_PER_LEVEL, WORDS_PER_LEVEL * 2).map(toEntry);
      if (WITH_DEFINITIONS) {
        console.log('Fetching definitions (this may take a few minutes)...');
        for (const [lv, entries] of Object.entries(byLevel)) {
          for (let i = 0; i < entries.length; i++) {
            const w = entries[i].word;
            entries[i].definition = await fetchDefinition(w);
            if ((i + 1) % 20 === 0) console.log(`  Level ${lv}: ${i + 1}/${entries.length}`);
            await sleep(FETCH_DELAY_MS);
          }
        }
      }
      const dir = path.dirname(OUT_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(OUT_PATH, JSON.stringify(byLevel, null, 2), 'utf8');
      console.log('Wrote', OUT_PATH);
      Object.entries(byLevel).forEach(([lv, entries]) => console.log(`  Level ${lv}: ${entries.length} words`));
    })
    .catch((err) => {
      console.error('Failed to fetch or build:', err.message);
      process.exit(1);
    });
}

main();
