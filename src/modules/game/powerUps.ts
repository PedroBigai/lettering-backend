export const POWER_TYPES = ['clearRow', 'clearColumn', 'clearLetter', 'clearAll'] as const;
export const COMBO_WINDOW_MS = 20_000;

export type PowerType = typeof POWER_TYPES[number];

export interface PowerInventory {
  clearRow: number;
  clearColumn: number;
  clearLetter: number;
  clearAll: number;
}

export interface GameplayState {
  powers: PowerInventory;
  targetWordsTowardPower: number;
  comboMultiplier: number;
  lastWordGameTimeMs: number | null;
}

export const EMPTY_GAMEPLAY_STATE: GameplayState = {
  powers: { clearRow: 0, clearColumn: 0, clearLetter: 0, clearAll: 0 },
  targetWordsTowardPower: 0,
  comboMultiplier: 0,
  lastWordGameTimeMs: null,
};

export function parseGameplayState(value: unknown): GameplayState {
  let parsed: unknown = value;
  if (typeof value === 'string') {
    try { parsed = JSON.parse(value); } catch { parsed = null; }
  }
  const state = parsed && typeof parsed === 'object' ? parsed as Partial<GameplayState> : {};
  const powers = state.powers && typeof state.powers === 'object'
    ? state.powers as Partial<PowerInventory>
    : {};
  const count = (candidate: unknown) => Math.max(0, Math.floor(Number(candidate) || 0));
  return {
    powers: {
      clearRow: count(powers.clearRow),
      clearColumn: count(powers.clearColumn),
      clearLetter: count(powers.clearLetter),
      clearAll: count(powers.clearAll),
    },
    targetWordsTowardPower: Math.min(5, count(state.targetWordsTowardPower)),
    comboMultiplier: Math.min(8, count(state.comboMultiplier)),
    lastWordGameTimeMs: state.lastWordGameTimeMs !== null
      && state.lastWordGameTimeMs !== undefined
      && Number.isFinite(Number(state.lastWordGameTimeMs))
      ? Math.max(0, Number(state.lastWordGameTimeMs))
      : null,
  };
}

export function registerCombo(state: GameplayState, gameTimeMs: number): number {
  const inWindow = state.lastWordGameTimeMs !== null
    && gameTimeMs - state.lastWordGameTimeMs <= COMBO_WINDOW_MS;
  state.comboMultiplier = inWindow ? Math.min(8, state.comboMultiplier + 1) : 1;
  state.lastWordGameTimeMs = gameTimeMs;
  return state.comboMultiplier;
}

export function awardPower(
  state: GameplayState,
  randomValue: number = Math.random(),
): PowerType | null {
  if (state.targetWordsTowardPower >= 5) return null;
  state.targetWordsTowardPower += 1;
  if (state.targetWordsTowardPower < 5) return null;
  if (Object.values(state.powers).some((count) => count > 0)) return null;
  return awardRandomPower(state, randomValue);
}

export function releasePendingPower(
  state: GameplayState,
  randomValue: number = Math.random(),
): PowerType | null {
  if (state.targetWordsTowardPower < 5) return null;
  return awardRandomPower(state, randomValue);
}

function awardRandomPower(state: GameplayState, randomValue: number): PowerType {
  state.targetWordsTowardPower = 0;
  const type: PowerType = randomValue < 0.3
    ? 'clearRow'
    : randomValue < 0.6
      ? 'clearColumn'
      : randomValue < 0.9
        ? 'clearLetter'
        : 'clearAll';
  state.powers[type] += 1;
  return type;
}

export interface PowerTargetCell {
  letter: string;
  row: number;
  column: number;
}

export function findFullestLine(
  cells: PowerTargetCell[],
  axis: 'row' | 'column',
): number | null {
  const counts = new Map<number, number>();
  for (const cell of cells) {
    const index = cell[axis];
    counts.set(index, (counts.get(index) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([indexA, countA], [indexB, countB]) => countB - countA || indexA - indexB)[0]?.[0]
    ?? null;
}

export function findMostFrequentLetter(cells: PowerTargetCell[]): string | null {
  const counts = new Map<string, number>();
  for (const { letter } of cells) counts.set(letter, (counts.get(letter) ?? 0) + 1);
  return [...counts.entries()]
    .sort(([letterA, countA], [letterB, countB]) => countB - countA
      || letterA.localeCompare(letterB))[0]?.[0]
    ?? null;
}
