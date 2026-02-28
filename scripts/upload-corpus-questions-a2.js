/**
 * data/corpus-questions-a2.json を Firestore の questions に投入する。
 *
 * 実行: node scripts/upload-corpus-questions-a2.js
 * エミュレータ: node scripts/upload-corpus-questions-a2.js --emulator
 *
 * 事前に node scripts/build-corpus-questions-a2.js で JSON を生成しておく。
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
const JSON_PATH = path.join(__dirname, '..', 'data', 'corpus-questions-a2.json');
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

async function upload() {
  if (!fs.existsSync(JSON_PATH)) {
    console.error('Not found:', JSON_PATH);
    console.error('Run first: node scripts/build-corpus-questions-a2.js');
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
  const questions = Array.isArray(raw) ? raw : [];
  if (questions.length === 0) {
    console.error('No questions in', JSON_PATH);
    process.exit(1);
  }
  console.log(`Uploading ${questions.length} A2 corpus questions...`);
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
