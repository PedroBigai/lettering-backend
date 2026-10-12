const assert = require('node:assert/strict');
const test = require('node:test');
const { awardMatchProgression } = require('../dist/modules/repositories/progressionRepository');

test('claims a match once and adds its score-based XP to the user', async () => {
  const calls = [];
  const connection = {
    async execute(sql, params) {
      calls.push({ sql, params });
      if (sql.startsWith('UPDATE match_players')) return [{ affectedRows: 1 }];
      if (sql.startsWith('SELECT total_xp')) return [[{ total_xp: '95' }]];
      if (sql.startsWith('UPDATE users')) return [{ affectedRows: 1 }];
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };

  const award = await awardMatchProgression(connection, 'player-1', 'user-1', 100);

  assert.equal(award.xpAwarded, 60);
  assert.equal(award.previousLevel, 1);
  assert.equal(award.levelsGained, 1);
  assert.equal(award.progression.totalXp, 155);
  assert.equal(award.progression.level, 2);
  assert.deepEqual(calls.at(-1).params, [155, 'user-1']);
});

test('does not award XP again after the match was already claimed', async () => {
  let calls = 0;
  const connection = {
    async execute() {
      calls += 1;
      return [{ affectedRows: 0 }];
    },
  };

  assert.equal(await awardMatchProgression(connection, 'player-1', 'user-1', 100), null);
  assert.equal(calls, 1);
});
