export interface PlayerProgression {
  totalXp: number;
  level: number;
  currentLevelXp: number;
  xpForNextLevel: number;
  remainingXp: number;
  borderTier: number;
  borderStep: number;
  prestige: number;
}

export interface ProgressionAward {
  xpAwarded: number;
  previousLevel: number;
  levelsGained: number;
  progression: PlayerProgression;
}

const BASE_LEVEL_XP = 100;
const LEVEL_XP_STEP = 25;
const BORDER_LEVELS = 10;
const PRESTIGE_LEVELS = 100;

export function calculateMatchXp(score: number): number {
  const safeScore = Number.isFinite(score) ? Math.max(0, Math.floor(score)) : 0;
  return Math.floor(6 * Math.sqrt(safeScore));
}

export function xpRequiredForLevel(level: number): number {
  const safeLevel = Math.max(1, Math.floor(level));
  return BASE_LEVEL_XP + LEVEL_XP_STEP * (safeLevel - 1);
}

export function totalXpAtLevel(level: number): number {
  const completedLevels = Math.max(0, Math.floor(level) - 1);
  return completedLevels * BASE_LEVEL_XP
    + (LEVEL_XP_STEP * completedLevels * (completedLevels - 1)) / 2;
}

export function getPlayerProgression(totalXp: number): PlayerProgression {
  const safeTotalXp = Number.isFinite(totalXp) ? Math.max(0, Math.floor(totalXp)) : 0;
  const estimate = Math.max(
    0,
    Math.floor((-175 + Math.sqrt(30_625 + 200 * safeTotalXp)) / 50),
  );
  let level = estimate + 1;

  while (totalXpAtLevel(level + 1) <= safeTotalXp) level += 1;
  while (level > 1 && totalXpAtLevel(level) > safeTotalXp) level -= 1;

  const currentLevelXp = safeTotalXp - totalXpAtLevel(level);
  const xpForNextLevel = xpRequiredForLevel(level);

  return {
    totalXp: safeTotalXp,
    level,
    currentLevelXp,
    xpForNextLevel,
    remainingXp: xpForNextLevel - currentLevelXp,
    borderTier: Math.floor((level % PRESTIGE_LEVELS) / BORDER_LEVELS),
    borderStep: Math.floor((level % BORDER_LEVELS) / 5),
    prestige: Math.floor(level / PRESTIGE_LEVELS),
  };
}
