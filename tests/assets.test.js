import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { NOTES, FILES } from '../src/audio-engine.js';

test('发布包包含十二份不同完整录音', () => {
  assert.equal(NOTES.length, 12);
  assert.equal(FILES.length, 12);
  assert.equal(new Set(FILES).size, 12);
  const hashes = new Set();
  FILES.forEach((name, index) => {
    const audio = readFileSync(new URL(`../public/audio/${name}-tanpura.mp3`, import.meta.url));
    // 96 kbps × 约 25 分钟约 18 MB；阈值用于发现录音被裁剪。
    assert.ok(audio.length > 15_000_000, `${name}（${NOTES[index]}）必须保留完整录音`);
    hashes.add(createHash('sha256').update(audio).digest('hex'));
  });
  assert.equal(hashes.size, 12);
});
