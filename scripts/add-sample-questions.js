/**
 * Firestoreにサンプル問題を追加するスクリプト
 *
 * 使用方法:
 * 1. Firebase Admin SDKの認証情報を設定（本番用: serviceAccountKey.json）
 * 2. 本番: node scripts/add-sample-questions.js
 * 3. エミュレータ: node scripts/add-sample-questions.js --emulator
 *    （firebase emulators:start --only functions,firestore,auth を別ターミナルで実行した状態で）
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

const { buildAllQuestions, QUESTIONS_PER_LEVEL } = require('./question-bank');
const { validateQuestion } = require('./validate-questions');

// レベル別100問ずつ生成（計1000問）
const rawQuestions = buildAllQuestions();

const BATCH_SIZE = 500; // Firestoreのバッチ上限

/** Firestoreは undefined を許容しないので、undefined のキーを除いたオブジェクトを返す */
function stripUndefined(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  const out = {};
  for (const key of Object.keys(obj)) {
    const v = obj[key];
    if (v !== undefined) out[key] = stripUndefined(v);
  }
  return out;
}

function prepareQuestion(q) {
  const result = validateQuestion(q);
  if (!result.ok) {
    return {
      ...q,
      active: true,
      qualityStatus: 'needs_fix',
      qaNotes: result.errors.join('; ')
    };
  }
  return { ...q, active: q.active !== false, qualityStatus: q.qualityStatus || 'ok' };
}

const sampleQuestions = rawQuestions.map(prepareQuestion);

async function addSampleQuestions() {
  try {
    const needsFix = sampleQuestions.filter(q => q.qualityStatus === 'needs_fix');
    if (needsFix.length > 0) {
      console.log(`Warning: ${needsFix.length} question(s) with qualityStatus=needs_fix (will be excluded from delivery until fixed)`);
    }
    console.log(`Building ${sampleQuestions.length} questions (${QUESTIONS_PER_LEVEL} per level)...`);
    const levelCounts = {};
    sampleQuestions.forEach(q => {
      levelCounts[q.level] = (levelCounts[q.level] || 0) + 1;
    });
    console.log('Per level:', levelCounts);

    let count = 0;
    for (let i = 0; i < sampleQuestions.length; i += BATCH_SIZE) {
      const batch = db.batch();
      const chunk = sampleQuestions.slice(i, i + BATCH_SIZE);
      for (const question of chunk) {
        const docRef = db.collection('questions').doc();
        batch.set(docRef, stripUndefined(question));
        count++;
      }
      await batch.commit();
      console.log(`Committed batch: ${count} questions so far...`);
    }
    console.log(`Successfully added ${count} questions to Firestore!`);
    process.exit(0);
  } catch (error) {
    console.error('Error adding questions:', error);
    process.exit(1);
  }
}

addSampleQuestions();




