import type { LevelCode, TowerProgressState, TowerType } from './types';
import { TOWER_LEVEL_ORDER, TOWER_TYPES } from './constants';
import { createEmptyTowerProgressState } from './utils';

/**
 * Flip ACTIVE_TOWER_MOCK_SCENARIO to validate flows.
 * - all_unlocked: Every tower band unlocked (all stages + bosses cleared); all guardians unlocked in-app.
 * - default: First-time player — all towers 0/10, no bosses, all guardians locked.
 * - all_a2_cleared: All three towers A2 boss cleared; A2 Guardian unlocked (not defeated); all B1 unlocked at 0/10.
 * - example2: A2 Guardian mastered; B1 Guardian locked (only Listening B1 boss cleared); Grammar B1 mid, Dictation B1 fresh.
 */
export type TowerMockScenarioId = 'default' | 'all_a2_cleared' | 'example2' | 'all_unlocked';

/** Base progression for new players. Use `all_unlocked` etc. only for QA. */
export const ACTIVE_TOWER_MOCK_SCENARIO: TowerMockScenarioId = 'default';

function band(sc: number, boss: boolean): { stagesCleared: number; bossCleared: boolean } {
  return { stagesCleared: sc, bossCleared: boss };
}

function allBandsEmpty(): Record<LevelCode, { stagesCleared: number; bossCleared: boolean }> {
  const o = {} as Record<LevelCode, { stagesCleared: number; bossCleared: boolean }>;
  for (const c of TOWER_LEVEL_ORDER) o[c] = band(0, false);
  return o;
}

function fillTower(
  overrides: Partial<Record<LevelCode, { stagesCleared: number; bossCleared: boolean }>>
): Record<LevelCode, { stagesCleared: number; bossCleared: boolean }> {
  const base = allBandsEmpty();
  for (const k of Object.keys(overrides) as LevelCode[]) {
    base[k] = overrides[k]!;
  }
  return base;
}

/** All five bands cleared through boss (unlocks every learning level in that tower). */
const ALL_BANDS_CLEARED_TOWER = fillTower({
  A2: band(10, true),
  B1: band(10, true),
  B2: band(10, true),
  C1: band(10, true),
  C2: band(10, true),
});

function makeState(partial: {
  byTower?: Partial<Record<TowerType, Partial<Record<LevelCode, { stagesCleared: number; bossCleared: boolean }>>>>;
  guardians?: Partial<Record<LevelCode, { defeated: boolean }>>;
}): TowerProgressState {
  const empty = createEmptyTowerProgressState();
  for (const t of TOWER_TYPES) {
    const patch = partial.byTower?.[t];
    if (patch) {
      for (const c of TOWER_LEVEL_ORDER) {
        const row = patch[c];
        if (row) empty.byTower[t][c] = { ...row };
      }
    }
  }
  if (partial.guardians) {
    for (const c of TOWER_LEVEL_ORDER) {
      const g = partial.guardians[c];
      if (g) empty.guardians[c] = { ...g };
    }
  }
  return empty;
}

const MOCK_SCENARIOS: Record<TowerMockScenarioId, TowerProgressState> = {
  all_unlocked: makeState({
    byTower: {
      grammar: ALL_BANDS_CLEARED_TOWER,
      listening: ALL_BANDS_CLEARED_TOWER,
      dictation: ALL_BANDS_CLEARED_TOWER,
    },
  }),

  default: makeState({}),

  all_a2_cleared: makeState({
    byTower: {
      grammar: fillTower({ A2: band(10, true), B1: band(0, false) }),
      listening: fillTower({ A2: band(10, true), B1: band(0, false) }),
      dictation: fillTower({ A2: band(10, true), B1: band(0, false) }),
    },
    guardians: {
      A2: { defeated: false },
    },
  }),

  example2: makeState({
    byTower: {
      grammar: fillTower({
        A2: band(10, true),
        B1: band(5, false),
      }),
      listening: fillTower({
        A2: band(10, true),
        B1: band(10, true),
      }),
      dictation: fillTower({
        A2: band(10, true),
        B1: band(0, false),
      }),
    },
    guardians: {
      A2: { defeated: true },
    },
  }),
};

export function getTowerProgressStateMock(): TowerProgressState {
  return MOCK_SCENARIOS[ACTIVE_TOWER_MOCK_SCENARIO];
}
