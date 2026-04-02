import type {
  GuardianBandStatus,
  GuardianRow,
  LearningLevelStatus,
  LevelCode,
  TowerBandRaw,
  TowerBossStatus,
  TowerLevelRow,
  TowerProgressState,
  TowerStage,
  TowerType,
} from './types';
import {
  REQUIRED_TOWERS_FOR_GUARDIAN,
  TOWER_GUARDIAN_NAMES,
  TOWER_LEVEL_ORDER,
  TOWER_LEVEL_OVERVIEW_ORDER,
  TOWER_LEVEL_TITLES,
  TOWER_TOTAL_STAGES,
  TOWER_TYPES,
} from './constants';

function emptyBand(): TowerBandRaw {
  return { stagesCleared: 0, bossCleared: false };
}

export function createEmptyTowerProgressState(): TowerProgressState {
  const byTower = {} as TowerProgressState['byTower'];
  for (const t of TOWER_TYPES) {
    const row = {} as Record<LevelCode, TowerBandRaw>;
    for (const code of TOWER_LEVEL_ORDER) {
      row[code] = emptyBand();
    }
    byTower[t] = row;
  }
  const guardians = {} as TowerProgressState['guardians'];
  for (const code of TOWER_LEVEL_ORDER) {
    guardians[code] = { defeated: false };
  }
  return { byTower, guardians };
}

/** Cleared tower boss for this band (one of the three towers). */
export function countTowersClearedForBand(
  levelCode: LevelCode,
  state: TowerProgressState
): number {
  let n = 0;
  for (const t of TOWER_TYPES) {
    if (state.byTower[t][levelCode].bossCleared) n += 1;
  }
  return n;
}

export function deriveGuardianBandStatus(
  levelCode: LevelCode,
  state: TowerProgressState
): GuardianBandStatus {
  if (state.guardians[levelCode].defeated) return 'mastered';
  if (countTowersClearedForBand(levelCode, state) >= REQUIRED_TOWERS_FOR_GUARDIAN) {
    return 'unlocked';
  }
  return 'locked';
}

/** Learning unlock: previous band boss cleared in THIS tower only. */
export function isLearningLevelUnlocked(
  towerType: TowerType,
  levelCode: LevelCode,
  state: TowerProgressState
): boolean {
  const idx = TOWER_LEVEL_ORDER.indexOf(levelCode);
  if (idx <= 0) return true;
  const prev = TOWER_LEVEL_ORDER[idx - 1]!;
  return state.byTower[towerType][prev].bossCleared;
}

export function deriveLearningStatus(
  towerType: TowerType,
  levelCode: LevelCode,
  state: TowerProgressState
): LearningLevelStatus {
  if (!isLearningLevelUnlocked(towerType, levelCode, state)) return 'locked';
  const row = state.byTower[towerType][levelCode];
  if (row.bossCleared) return 'cleared';
  return 'unlocked';
}

export function deriveBossStatus(
  stagesCleared: number,
  bossCleared: boolean
): TowerBossStatus {
  if (bossCleared) return 'cleared';
  if (stagesCleared >= TOWER_TOTAL_STAGES) return 'unlocked';
  return 'locked';
}

export function buildTowerLevelsForType(
  towerType: TowerType,
  state: TowerProgressState
): TowerLevelRow[] {
  return TOWER_LEVEL_OVERVIEW_ORDER.map((code) => {
    const row = state.byTower[towerType][code];
    const gateOpen = isLearningLevelUnlocked(towerType, code, state);
    const learningStatus = deriveLearningStatus(towerType, code, state);
    const stagesCleared = gateOpen ? Math.min(row.stagesCleared, TOWER_TOTAL_STAGES) : 0;
    const bossStatus: TowerBossStatus = !gateOpen
      ? 'locked'
      : deriveBossStatus(row.stagesCleared, row.bossCleared);
    const guardianStatus = deriveGuardianBandStatus(code, state);
    const bandTowersCleared = countTowersClearedForBand(code, state);

    return {
      id: `${towerType}-level-${code}`,
      towerType,
      code,
      title: TOWER_LEVEL_TITLES[code],
      learningStatus,
      guardianStatus,
      stagesCleared,
      totalStages: TOWER_TOTAL_STAGES,
      bossStatus,
      guardianName: TOWER_GUARDIAN_NAMES[code],
      bandTowersCleared,
      bandTowersRequired: REQUIRED_TOWERS_FOR_GUARDIAN,
    };
  });
}

/** ステージ桶内で「少なくとも1回正解した」ユニーク件数 */
export function getTowerStageMasteredCount(
  state: TowerProgressState,
  towerType: TowerType,
  levelCode: LevelCode,
  stageNumber: number
): number {
  const keys = state.byTower[towerType][levelCode].stageMasteredKeys?.[String(stageNumber)];
  return keys?.length ?? 0;
}

export function buildTowerStagesForLevel(
  towerType: TowerType,
  levelCode: LevelCode,
  state: TowerProgressState
): TowerStage[] {
  const gateOpen = isLearningLevelUnlocked(towerType, levelCode, state);
  const prefix = `${towerType}-${levelCode}`;

  if (!gateOpen) {
    return [
      ...Array.from({ length: TOWER_TOTAL_STAGES }, (_, i) => ({
        id: `${prefix}-stage-${i + 1}`,
        levelCode,
        towerType,
        stageNumber: i + 1,
        status: 'locked' as const,
        isBoss: false as const,
      })),
      {
        id: `${prefix}-boss`,
        levelCode,
        towerType,
        stageNumber: 0,
        status: 'locked' as const,
        isBoss: true as const,
      },
    ];
  }

  const row = state.byTower[towerType][levelCode];
  const sc = Math.min(row.stagesCleared, TOWER_TOTAL_STAGES);
  const floors: TowerStage[] = [];

  for (let n = 1; n <= TOWER_TOTAL_STAGES; n++) {
    let st: TowerStage['status'];
    if (n <= sc) st = 'cleared';
    else if (n === sc + 1) st = 'unlocked';
    else st = 'locked';
    floors.push({
      id: `${prefix}-stage-${n}`,
      levelCode,
      towerType,
      stageNumber: n,
      status: st,
      isBoss: false,
    });
  }

  let bossSt: TowerStage['status'];
  if (row.bossCleared) bossSt = 'cleared';
  else if (sc >= TOWER_TOTAL_STAGES) bossSt = 'unlocked';
  else bossSt = 'locked';

  floors.push({
    id: `${prefix}-boss`,
    levelCode,
    towerType,
    stageNumber: 0,
    status: bossSt,
    isBoss: true,
  });

  return floors;
}

export function buildGuardianRows(state: TowerProgressState): GuardianRow[] {
  return TOWER_LEVEL_ORDER.map((code) => ({
    id: `guardian-${code}`,
    code,
    title: `${code} Guardian`,
    guardianName: TOWER_GUARDIAN_NAMES[code],
    status: deriveGuardianBandStatus(code, state),
    towersClearedCount: countTowersClearedForBand(code, state),
    requiredTowers: REQUIRED_TOWERS_FOR_GUARDIAN,
  }));
}

export function countGuardiansMastered(state: TowerProgressState): number {
  return TOWER_LEVEL_ORDER.filter((c) => state.guardians[c].defeated).length;
}

export function parseLevelCodeParam(raw: string | string[] | undefined): LevelCode | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (!v) return null;
  const upper = v.toUpperCase();
  if (TOWER_LEVEL_ORDER.includes(upper as LevelCode)) return upper as LevelCode;
  return null;
}

export function parseTowerTypeParam(raw: string | string[] | undefined): TowerType | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (!v) return null;
  const lower = v.toLowerCase();
  if (TOWER_TYPES.includes(lower as TowerType)) return lower as TowerType;
  return null;
}
