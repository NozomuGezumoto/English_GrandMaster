/**
 * data/corpus-questions.json（全レベル 1-10）を Firestore の questions に投入する。
 * data/corpus-questions-a2.json のみある場合は従来どおり level 2 として投入する。
 *
 * 実行: node scripts/upload-corpus-questions.js
 * エミュレータ: node scripts/upload-corpus-questions.js --emulator
 */

const path = require('path');
const fs = require('fs');

const isEmulator = process.argv.includes('--emulator');
if (isEmulator) {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
}

const admin = require('firebase-admin');

if (!admin.apps.length) {
  if (isEmulator) {
    const firebasercPath = path.join(__dirname, '..', '.firebaserc');
    const firebaserc = JSON.parse(fs.readFileSync(firebasercPath, 'utf8'));
    const projectId = firebaserc.projects?.default || 'my-english-battle';
    admin.initializeApp({ projectId });
  } else {
    const serviceAccount = require(path.join(__dirname, '..', 'serviceAccountKey.json'));
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
}

const db = admin.firestore();
const DATA_DIR = path.join(__dirname, '..', 'data');
const CORPUS_ALL_PATH = path.join(DATA_DIR, 'corpus-questions.json');
const CORPUS_A2_PATH = path.join(DATA_DIR, 'corpus-questions-a2.json');
const BATCH_SIZE = 500;

function stripUndefined(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  const out = {};
  for (const key of Object.keys(obj)) {
    const v = obj[key];
    if (v !== undefined) out[key] = stripUndefined(v);
  }
  return out;
}

function loadQuestions() {
  if (fs.existsSync(CORPUS_ALL_PATH)) {
    const byLevel = JSON.parse(fs.readFileSync(CORPUS_ALL_PATH, 'utf8'));
    const list = [];
    for (const lv of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      const key = String(lv);
      if (Array.isArray(byLevel[key])) list.push(...byLevel[key]);
    }
    return list;
  }
  if (fs.existsSync(CORPUS_A2_PATH)) {
    const a2 = JSON.parse(fs.readFileSync(CORPUS_A2_PATH, 'utf8'));
    return Array.isArray(a2) ? a2 : [];
  }
  return null;
}

async function upload() {
  const questions = loadQuestions();
  if (!questions || questions.length === 0) {
    console.error('No corpus file found. Run: node scripts/build-corpus-questions-all.js');
    process.exit(1);
  }
  console.log(`Uploading ${questions.length} corpus questions...`);
  let count = 0;
  for (let i = 0; i < questions.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = questions.slice(i, i + BATCH_SIZE);
    for (const q of chunk) {
      const docRef = db.collection('questions').doc();
      batch.set(docRef, stripUndefined(q));
      count++;
    }
    await batch.commit();
    console.log(`Committed ${count}/${questions.length}`);
  }
  console.log('Done.');
  process.exit(0);
}

upload().catch((err) => {
  console.error(err);
  process.exit(1);
});
