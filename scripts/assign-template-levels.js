/**
 * 問題バンクの全テンプレートについて、4択の語彙から CEFR を算出し、
 * Cambridge に合わせた「移動先レベル」を割り当てて template-levels.json に出力する。
 * question-bank.js はこの JSON が存在すれば読み込み、実効レベルとして使用する。
 */

const path = require('path');
const fs = require('fs');
const {
  level1Templates,
  level2Templates,
  level3Templates,
  level4Templates,
  level5Templates,
  level6Templates,
  level7Templates,
  level8Templates,
  level9Templates,
  level10Templates
} = require('./question-bank.js');
const { getCEFRFromChoices, cefrToSingleLevel } = require('./vocab-cefr-map.js');

const LEVEL_TEMPLATES = [
  level1Templates,
  level2Templates,
  level3Templates,
  level4Templates,
  level5Templates,
  level6Templates,
  level7Templates,
  level8Templates,
  level9Templates,
  level10Templates
];

function assignTemplateLevels() {
  const out = {};
  let globalIndex = 0;
  for (let levelIndex = 0; levelIndex < LEVEL_TEMPLATES.length; levelIndex++) {
    const templates = LEVEL_TEMPLATES[levelIndex];
    const levelNum = levelIndex + 1;
    for (let i = 0; i < templates.length; i++) {
      const t = templates[i];
      const choices = t.choices && (Array.isArray(t.choices) ? t.choices : Object.values(t.choices)) || [];
      const cefr = getCEFRFromChoices(choices);
      const newLevel = cefrToSingleLevel(cefr, globalIndex);
      globalIndex += 1;
      const key = `${levelNum}-${i}`;
      out[key] = newLevel;
    }
  }
  return out;
}

function main() {
  const dir = path.resolve(__dirname);
  const map = assignTemplateLevels();
  const jsonPath = path.join(dir, 'template-levels.json');
  fs.writeFileSync(jsonPath, JSON.stringify(map, null, 2), 'utf8');
  console.log('Wrote', jsonPath);
  const byNewLevel = {};
  for (const v of Object.values(map)) {
    byNewLevel[v] = (byNewLevel[v] || 0) + 1;
  }
  console.log('Templates per effective level:', byNewLevel);
}

main();
