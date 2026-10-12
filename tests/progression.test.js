const assert = require('node:assert/strict');
const test = require('node:test');
const {
  calculateMatchXp,
  getPlayerProgression,
  totalXpAtLevel,
  xpRequiredForLevel,
} = require('../dist/modules/game/progression');

test('awards official match XP with diminishing returns from score', () => {
  assert.equal(calculateMatchXp(0), 0);
  assert.equal(calculateMatchXp(100), 60);
  assert.equal(calculateMatchXp(400), 120);
  assert.equal(calculateMatchXp(900), 180);
  assert.equal(calculateMatchXp(2_500), 300);
  assert.equal(calculateMatchXp(10_000), 600);
});

test('derives infinite levels and progress from total XP', () => {
  assert.deepEqual(getPlayerProgression(0), {
    totalXp: 0,
    level: 1,
    currentLevelXp: 0,
    xpForNextLevel: 100,
    remainingXp: 100,
    borderTier: 0,
    borderStep: 0,
    prestige: 0,
  });
  assert.equal(getPlayerProgression(99).level, 1);
  assert.equal(getPlayerProgression(100).level, 2);
  assert.equal(getPlayerProgression(224).level, 2);
  assert.equal(getPlayerProgression(225).level, 3);
  assert.equal(xpRequiredForLevel(3), 150);
  assert.equal(totalXpAtLevel(3), 225);
});

test('changes borders every ten levels and adds prestige every hundred', () => {
  assert.equal(getPlayerProgression(totalXpAtLevel(9)).borderTier, 0);
  assert.equal(getPlayerProgression(totalXpAtLevel(10)).borderTier, 1);
  assert.equal(getPlayerProgression(totalXpAtLevel(15)).borderStep, 1);
  const levelOneHundred = getPlayerProgression(totalXpAtLevel(100));
  assert.equal(levelOneHundred.level, 100);
  assert.equal(levelOneHundred.borderTier, 0);
  assert.equal(levelOneHundred.prestige, 1);
});
