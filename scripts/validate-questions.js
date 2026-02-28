/**
 * 問題バリデータ（ローカル実行で全件検査）
 *
 * 使い方:
 *   node scripts/validate-questions.js              # question-bank から生成した問題を検証（Firestore 不要）
 *   node scripts/validate-questions.js --fix         # Firestore の fail 問題を qualityStatus=needs_fix に更新（要 FW 接続）
 *
 * 検査内容:
 * - choices は4つ、answerIndex は 0..3、正答が空でない
 * - 空欄問題は choices が全て非空文字列
 * - reading 系は passage 必須（無ければ fail）
 * - NG 表現・不自然スロットのルールベース検出
 * - 不可算名詞の簡易警告（feedbacks 等）
 */

const { buildAllQuestions } = require('./question-bank');

const READING_MARKERS = [
  'purpose of the email',
  'According to the passage',
  'NOT mentioned in the article',
  'main argument',
  'author\'s main argument'
];

const NG_PATTERNS = [
  { pattern: /eligible\s+to\s+renewal/i, msg: 'Use "eligible for renewal"' },
  { pattern: /held\s+at\s+Monday/i, msg: 'Use "on" for days: on Monday' },
  { pattern: /held\s+at\s+(Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/i, msg: 'Use "on" for days' },
  { pattern: /\bon\s+yesterday\b/i, msg: '"on yesterday" is wrong; use "yesterday" alone' },
  { pattern: /\bon\s+recently\b/i, msg: '"on recently" is wrong' },
  { pattern: /\brecently\b/i, msg: 'Typo: "recently" → "recently"' }
];

const UNCOUNTABLE_WORDS = ['feedback', 'information', 'advice', 'equipment', 'evidence', 'news', 'research', 'progress'];

function isReadingPrompt(prompt) {
  if (!prompt || typeof prompt !== 'string') return false;
  return READING_MARKERS.some(m => prompt.includes(m));
}

function validateQuestion(q, id = '') {
  const errors = [];
  const warnings = [];

  if (!q || typeof q !== 'object') {
    return { ok: false, errors: ['Invalid question object'], warnings: [] };
  }

  if (!Array.isArray(q.choices) || q.choices.length !== 4) {
    errors.push('choices must be exactly 4');
  } else {
    if (q.choices.some(c => typeof c !== 'string')) {
      errors.push('every choice must be a string');
    }
    if (q.choices.some(c => c.length === 0)) {
      errors.push('choices must not contain empty strings');
    }
  }

  const ai = q.answerIndex;
  if (typeof ai !== 'number' || ai < 0 || ai > 3) {
    errors.push('answerIndex must be 0..3');
  } else if (q.choices && q.choices[ai] !== undefined) {
    if (String(q.choices[ai]).trim() === '') {
      errors.push('correct choice (choices[answerIndex]) must not be empty');
    }
  }

  const prompt = q.prompt || '';
  if (prompt.includes('_____') && q.choices) {
    if (q.choices.some(c => typeof c !== 'string' || c.length === 0)) {
      errors.push('cloze prompt requires non-empty string choices');
    }
  }

  if (q.type === 'reading' || isReadingPrompt(prompt)) {
    const hasPassage = q.passage != null && String(q.passage).trim().length > 0;
    const blocked = q.qualityStatus === 'blocked';
    if (!hasPassage && !blocked) {
      errors.push('reading-type question requires non-empty passage or qualityStatus=blocked');
    }
  }

  for (const { pattern, msg } of NG_PATTERNS) {
    if (pattern.test(prompt)) {
      errors.push(`NG phrase: ${msg}`);
    }
  }

  if (q.choices) {
    for (const c of q.choices) {
      const lower = (c || '').toLowerCase();
      for (const u of UNCOUNTABLE_WORDS) {
        if (lower === u + 's' || new RegExp('\\b' + u + 's\\b').test(lower)) {
          warnings.push(`Possible uncountable used as plural: "${c}"`);
        }
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings
  };
}

function runValidation(questions) {
  const results = [];
  let passCount = 0;
  let failCount = 0;
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const id = q.id || `#${i}`;
    const r = validateQuestion(q, id);
    results.push({ id, prompt: q.prompt, ...r });
    if (r.ok) passCount++; else failCount++;
  }
  return { results, passCount, failCount };
}

function main() {
  const args = process.argv.slice(2);
  const fixMode = args.includes('--fix');

  console.log('Building questions from question-bank...');
  const questions = buildAllQuestions();
  console.log(`Validating ${questions.length} questions...\n`);

  const { results, passCount, failCount } = runValidation(questions);

  const failed = results.filter(r => !r.ok);
  if (failed.length > 0) {
    console.log('--- FAILED ---');
    failed.forEach(({ id, prompt, errors, warnings }) => {
      console.log(`\n${id}`);
      console.log(`  prompt: ${(prompt || '').slice(0, 80)}${(prompt || '').length > 80 ? '...' : ''}`);
      errors.forEach(e => console.log(`  error: ${e}`));
      (warnings || []).forEach(w => console.log(`  warn: ${w}`));
    });
  }

  const withWarnings = results.filter(r => r.ok && r.warnings && r.warnings.length > 0);
  if (withWarnings.length > 0) {
    console.log('\n--- WARNINGS (passed but review) ---');
    withWarnings.slice(0, 20).forEach(({ id, prompt, warnings }) => {
      console.log(`\n${id}: ${(prompt || '').slice(0, 60)}...`);
      warnings.forEach(w => console.log(`  ${w}`));
    });
    if (withWarnings.length > 20) console.log(`... and ${withWarnings.length - 20} more`);
  }

  console.log('\n--- SUMMARY ---');
  console.log(`PASS: ${passCount}`);
  console.log(`FAIL: ${failCount}`);

  if (failCount > 0) {
    console.log('\nResult: FAIL');
    process.exit(1);
  }

  console.log('\nResult: PASS');
  if (fixMode) {
    console.log('--fix: Firestore update is not implemented for in-memory validation. Use --fix when validating against Firestore (future).');
  }
  process.exit(0);
}

module.exports = { validateQuestion, runValidation };

if (require.main === module) {
  main();
}
