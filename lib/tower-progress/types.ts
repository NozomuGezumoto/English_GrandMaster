/** CEFR band (shared across towers + guardian gate). */
export type LevelCode = 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

/** @deprecated Use LevelCode — kept for gradual migration in imports */
export type CefrTowerCode = LevelCode;

export type TowerType = 'grammar' | 'listening' | 'dictation';

/** Learning path only (per tower × band). Guardian does NOT block this. */
export type LearningLevelStatus = 'locked' | 'unlocked' | 'cleared';

/** Band-wide guardian (3 towers cleared → unlocked; defeated → mastered). */
export type GuardianBandStatus = 'locked' | 'unlocked' | 'mastered';

export type TowerBossStatus = 'locked' | 'unlocked' | 'cleared';

export type TowerStageStatus = 'locked' | 'unlocked' | 'cleared';

/** Raw row per (tower, band) — persist to Firestore */
export interface TowerBandRaw {
  stagesCleared: number;
  bossCleared: boolean;
  /**
   * ステージ 1..10 ごとに、その桶の問題を「少なくとも1回正解した」キー（重複なし）。
   * キーは `getTowerSessionItemKey` と同一形式。ローカル（AsyncStorage）のみ。
   */
  stageMasteredKeys?: Record<string, string[]>;
}

/** Raw guardian row per band */
export interface GuardianBandRaw {
  defeated: boolean;
}

/**
 * Full progression state: three independent towers + five band guardians.
 */
export interface TowerProgressState {
  byTower: Record<TowerType, Record<LevelCode, TowerBandRaw>>;
  guardians: Record<LevelCode, GuardianBandRaw>;
}

/** One row on a single-tower progress screen (overview). */
export interface TowerLevelRow {
  id: string;
  towerType: TowerType;
  code: LevelCode;
  title: string;
  learningStatus: LearningLevelStatus;
  /** Same band’s shared guardian (informational on this screen). */
  guardianStatus: GuardianBandStatus;
  stagesCleared: number;
  totalStages: number;
  bossStatus: TowerBossStatus;
  guardianName: string;
  /** For guardian hint when band guardian still locked. */
  bandTowersCleared: number;
  bandTowersRequired: number;
}

/** One row on Guardian Gate list. */
export interface GuardianRow {
  id: string;
  code: LevelCode;
  title: string;
  guardianName: string;
  status: GuardianBandStatus;
  towersClearedCount: number;
  requiredTowers: number;
}

export interface TowerStage {
  id: string;
  levelCode: LevelCode;
  towerType: TowerType;
  stageNumber: number;
  status: TowerStageStatus;
  isBoss?: boolean;
}
