/**
 * タワー進行の永続化（mock シナリオをベースに、クリアしたステージ数だけ上書きマージ）。
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { LevelCode, TowerProgressState, TowerType } from './types';
import { TOWER_LEVEL_ORDER, TOWER_TYPES } from './constants';
import { getTowerProgressStateMock } from './mock-data';

const STORAGE_KEY = 'tower_runtime_progress_v1';

type BandPatch = {
  stagesCleared?: number;
  bossCleared?: boolean;
  stageMasteredKeys?: Record<string, string[]>;
};

type Overlay = {
  byTower: Partial<Record<TowerType, Partial<Record<LevelCode, BandPatch>>>>;
  guardians?: Partial<Record<LevelCode, { defeated: boolean }>>;
};

let overlay: Overlay = { byTower: {} };
let loadPromise: Promise<void> | null = null;

function cloneState(s: TowerProgressState): TowerProgressState {
  return JSON.parse(JSON.stringify(s)) as TowerProgressState;
}

export async function loadTowerRuntimeProgress(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      overlay = raw ? (JSON.parse(raw) as Overlay) : { byTower: {} };
    } catch {
      overlay = { byTower: {} };
    }
  })();
  return loadPromise;
}

async function persistOverlay(): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(overlay));
  } catch (e) {
    console.warn('[Tower] persist progress failed:', e);
  }
}

/** mock シナリオ + 永続オーバーレイ */
export function getTowerProgressState(): TowerProgressState {
  const base = cloneState(getTowerProgressStateMock());
  for (const t of TOWER_TYPES) {
    const bands = overlay.byTower[t];
    if (!bands) continue;
    for (const c of TOWER_LEVEL_ORDER) {
      const patch = bands[c];
      if (!patch) continue;
      const row = base.byTower[t][c];
      if (typeof patch.stagesCleared === 'number') {
        row.stagesCleared = Math.max(row.stagesCleared, patch.stagesCleared);
      }
      if (patch.bossCleared === true) row.bossCleared = true;
      if (patch.stageMasteredKeys) {
        const next = { ...row.stageMasteredKeys };
        for (const [sk, arr] of Object.entries(patch.stageMasteredKeys)) {
          const prev = next[sk] ?? [];
          const s = new Set(prev);
          for (const k of arr) s.add(k);
          next[sk] = [...s];
        }
        row.stageMasteredKeys = next;
      }
    }
  }
  if (overlay.guardians) {
    for (const c of TOWER_LEVEL_ORDER) {
      const g = overlay.guardians[c];
      if (g?.defeated) base.guardians[c].defeated = true;
    }
  }
  return base;
}

/**
 * ステージ `clearedStageNumber`（1..10）をクリアしたときに呼ぶ。
 * `stagesCleared` は「クリア済みステージ数」＝そのステージ番号まで到達したことにする。
 */
export async function recordTowerStageCleared(
  towerType: TowerType,
  levelCode: LevelCode,
  clearedStageNumber: number
): Promise<void> {
  await loadTowerRuntimeProgress();
  if (!overlay.byTower[towerType]) overlay.byTower[towerType] = {};
  const prev = overlay.byTower[towerType]![levelCode] ?? {};
  const next = Math.max(prev.stagesCleared ?? 0, clearedStageNumber);
  overlay.byTower[towerType]![levelCode] = {
    ...prev,
    stagesCleared: next,
  };
  await persistOverlay();
}

/**
 * ステージプレイ終了時に、その回で正解したアイテムキーをマージ（桶内のユニーク正解数の母集団）。
 */
export async function recordTowerStageMastered(
  towerType: TowerType,
  levelCode: LevelCode,
  stageNumber: number,
  correctKeys: string[]
): Promise<void> {
  if (correctKeys.length === 0) return;
  await loadTowerRuntimeProgress();
  if (!overlay.byTower[towerType]) overlay.byTower[towerType] = {};
  const prev = overlay.byTower[towerType]![levelCode] ?? {};
  const sk = String(stageNumber);
  const existing = new Set(prev.stageMasteredKeys?.[sk] ?? []);
  for (const k of correctKeys) existing.add(k);
  overlay.byTower[towerType]![levelCode] = {
    ...prev,
    stageMasteredKeys: {
      ...(prev.stageMasteredKeys ?? {}),
      [sk]: [...existing],
    },
  };
  await persistOverlay();
}

export async function recordGuardianDefeated(levelCode: LevelCode): Promise<void> {
  await loadTowerRuntimeProgress();
  overlay.guardians = { ...(overlay.guardians ?? {}), [levelCode]: { defeated: true } };
  await persistOverlay();
}

export async function recordTowerBossCleared(towerType: TowerType, levelCode: LevelCode): Promise<void> {
  await loadTowerRuntimeProgress();
  if (!overlay.byTower[towerType]) overlay.byTower[towerType] = {};
  const prev = overlay.byTower[towerType]![levelCode] ?? {};
  overlay.byTower[towerType]![levelCode] = {
    ...prev,
    bossCleared: true,
  };
  await persistOverlay();
}
