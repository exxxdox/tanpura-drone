import test from 'node:test';
import assert from 'node:assert/strict';
import { NOTES, frequencyFor, Drone } from '../src/audio-engine.js';

function setup(t, pending = false) {
  const audios = [];
  const original = globalThis.Audio;
  globalThis.Audio = class {
    constructor(src) { this.src = src; this.originalSrc = src; this.paused = true; this.currentTime = 0; audios.push(this); }
    play() {
      this.paused = false;
      if (!pending) return Promise.resolve();
      return new Promise((resolve, reject) => { this.resolve = resolve; this.reject = reject; });
    }
    pause() { this.paused = true; }
    removeAttribute() { this.src = ''; }
    load() { this.released = true; }
  };
  const nodes = [];
  // 不提供 cancelAndHoldAtTime，保持 Firefox/Zen 的兼容性回归条件。
  const gain = () => ({ gain: { value: .4, cancelScheduledValues() {}, setValueAtTime() {}, linearRampToValueAtTime() {}, setTargetAtTime(value) { this.value = value; } }, connect() {}, disconnect() { this.disconnected = true; } });
  const drone = new Drone();
  drone.context = {
    currentTime: 0, resume: async () => {}, close: async () => { drone.closed = true; },
    createGain: gain,
    createAnalyser: () => ({ connect() {}, getFloatTimeDomainData(data) { data.fill(.1); } }),
    createMediaElementSource(audio) { const node = { audio, connect() {}, disconnect() { this.disconnected = true; } }; nodes.push(node); return node; },
  };
  t.after(async () => { await drone.dispose(); if (original) globalThis.Audio = original; else delete globalThis.Audio; });
  return { drone, audios, nodes };
}

test('十二调完整媒体源各自流式播放，原速并自动循环', async t => {
  const { drone, audios } = setup(t);
  assert.equal(new Set(NOTES).size, 12);
  assert.equal(frequencyFor(6), 92.5);
  assert.equal(frequencyFor(9), 110);
  for (let index = 0; index < 12; index++) assert.equal(await drone.play(index), true);
  assert.equal(audios.length, 12);
  assert.equal(new Set(audios.map(audio => audio.originalSrc)).size, 12);
  assert.equal(audios[1].originalSrc, '/audio/db-tanpura.mp3');
  assert.equal(drone.active.audio.src, '/audio/b-tanpura.mp3');
  assert.ok(audios.every(audio => audio.loop && audio.playbackRate === 1 && audio.preload === 'metadata'));
});

test('暂停立即停止所有媒体，同调恢复保留播放位置', async t => {
  const { drone, audios } = setup(t);
  await drone.play(0);
  audios[0].currentTime = 72;
  drone.stop();
  assert.ok(audios[0].paused);
  assert.equal(drone.getEnergy(), 0);
  assert.equal(await drone.play(0), true);
  assert.equal(audios.length, 1);
  assert.equal(audios[0].currentTime, 72);
  assert.equal(audios[0].paused, false);
});

test('暂停作废待加载播放，晚完成不会重新发声', async t => {
  const { drone, audios } = setup(t, true);
  const playing = drone.play(0);
  drone.stop();
  audios[0].resolve();
  assert.equal(await playing, false);
  assert.equal(audios[0].paused, true);
  assert.equal(audios[0].released, true);
  assert.equal(drone.voices.size, 0);
});

test('旧调晚返回不能覆盖新调，过期错误也不会覆盖新请求', async t => {
  const { drone, audios } = setup(t, true);
  const old = drone.play(0);
  const current = drone.play(1);
  audios[1].resolve();
  assert.equal(await current, true);
  audios[0].resolve();
  assert.equal(await old, false);
  assert.equal(drone.active.index, 1);
  assert.equal(audios[1].paused, false);
  const failed = drone.play(2);
  const latest = drone.play(3);
  audios[2].reject(new Error('cancelled'));
  assert.equal(await failed, false);
  audios[3].resolve();
  assert.equal(await latest, true);
});

test('能量来自真实 analyser，静音和 dispose 清理全部资源', async t => {
  const { drone, audios, nodes } = setup(t);
  assert.equal(drone.getEnergy(), 0);
  await drone.play(0);
  assert.ok(Math.abs(drone.getEnergy() - .4) < .0001);
  drone.setVolume(0);
  assert.equal(drone.getEnergy(), 0);
  assert.equal(drone.master.gain.value, 0);
  await drone.dispose();
  assert.equal(drone.voices.size, 0);
  assert.ok(audios.every(audio => audio.paused && audio.released));
  assert.ok(nodes.every(node => node.disconnected));
  assert.equal(drone.closed, true);
  assert.equal(await drone.play(1), false);
});
