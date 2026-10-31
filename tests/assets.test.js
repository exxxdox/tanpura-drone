import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { NOTES, frequencyFor } from '../src/audio-engine.js';

test('发布包包含十二份不同录音，校验和与来源频率一致', () => {
  const manifest = JSON.parse(readFileSync(new URL('../public/audio/manifest.json', import.meta.url), 'utf8'));
  assert.equal(manifest.files.length, 12);
  const hashes = new Set();
  manifest.files.forEach((file, index) => {
    const audio = readFileSync(new URL(`../public/audio/${file.file}`, import.meta.url));
    assert.equal(file.key.replace('#', '♯'), NOTES[index]);
    assert.equal(file.nominal_hz, frequencyFor(index));
    assert.equal(file.start_seconds, 0);
    assert.ok(file.duration_seconds >= 1500, '必须保留完整约 25 分钟录音');
    assert.equal(audio.length, file.bytes);
    assert.equal(createHash('sha256').update(audio).digest('hex'), file.sha256);
    hashes.add(file.sha256);
  });
  assert.equal(hashes.size, 12);
});
