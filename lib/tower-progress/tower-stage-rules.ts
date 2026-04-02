/** 各ステージの出題数・合格ライン（正解率は「8割を超える」= 厳密に 80% より上） */
export const TOWER_STAGE_DRAW_COUNT = 10;

/** 合格に必要な正解率（この値より大きいこと）例: 10 問で 9 問以上 */
export const TOWER_STAGE_CLEAR_RATIO = 0.8;

export function isTowerStagePassed(correctCount: number, totalQuestions: number): boolean {
  if (totalQuestions <= 0) return false;
  return correctCount / totalQuestions > TOWER_STAGE_CLEAR_RATIO;
}

/** ボス戦: 最大出題数（全ステージプールからランダム） */
export const TOWER_BOSS_DRAW_COUNT = 10;

/** ボス戦: この正解数以上でクリア（出題数が 10 未満のときは `min(8, total)` 正解） */
export const TOWER_BOSS_CLEAR_MIN_CORRECT = 8;

export function isTowerBossPassed(correctCount: number, totalQuestions: number): boolean {
  if (totalQuestions <= 0) return false;
  const need = Math.min(TOWER_BOSS_CLEAR_MIN_CORRECT, totalQuestions);
  return correctCount >= need;
}
