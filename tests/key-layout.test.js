import test from 'node:test';
import assert from 'node:assert/strict';
import { CIRCLE_KEYS, CIRCLE_SECTORS } from '../src/key-layout.js';

test('五度圈从顶部 C 开始，顺时针上行纯五度，完整覆盖十二个调', () => {
  assert.equal(CIRCLE_KEYS.length, 12);
  assert.equal(new Set(CIRCLE_KEYS.map(key => key.index)).size, 12);
  assert.deepEqual(CIRCLE_KEYS[0], { index: 0, left: 50, top: 10 });
  CIRCLE_KEYS.forEach((key, step) => {
    const next = CIRCLE_KEYS[(step + 1) % 12];
    assert.equal((next.index - key.index + 12) % 12, 7);
    assert.ok(Math.abs(Math.hypot(key.left - 50, key.top - 50) - 40) < 1e-10);
  });
});

test('环形分区保持十二调索引与关系小调，文字落在对应圆环', () => {
  const minorPitch = { A: 9, E: 4, B: 11, G: 7, D: 2, F: 5, C: 0 };
  assert.equal(CIRCLE_SECTORS.length, 12);
  for (const sector of CIRCLE_SECTORS) {
    const pitch = minorPitch[sector.minorName[0]] - (sector.minorName.includes('b') ? 1 : 0);
    assert.equal((pitch + 12) % 12, (sector.index + 9) % 12);
    assert.ok(!/NaN|undefined/.test(sector.path));
    for (const [name, radius] of [['major', 108], ['minor', 67]]) {
      assert.ok(Math.abs(Math.hypot(sector[name][0] - 130, sector[name][1] - 130) - radius) < 1e-10);
    }
  }
});
