import test from 'node:test';
import assert from 'node:assert/strict';
import { NOTES, rateFor, frequencyFor, Drone } from '../dist/audio-engine.js';
test('十二调映射限制在最近八度，A 主音为 110 Hz', () => {
  assert.equal(new Set(NOTES).size, 12);
  assert.equal(rateFor(0), 1);
  assert.ok(Math.abs(frequencyFor(9) - 110) < .001);
  for (let i = 0; i < 12; i++) assert.ok(rateFor(i) > .7 && rateFor(i) < 1.42);
});
test('循环重叠，切调和停止取消旧排程', () => {
  const sources = [];
  const gain = () => ({ gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, cancelAndHoldAtTime() {} }, connect() {}, disconnect() {} });
  const drone = new Drone();
  drone.context = { currentTime: 0, createGain: gain, createBufferSource() {
    const source = { playbackRate: {}, connect() { return { connect() {} }; }, start(...args) { this.started = args; }, stop(t) { this.stopped = t; } };
    sources.push(source); return source;
  } };
  drone.master = {};
  drone.buffer = {};
  try {
    drone.start(0);
    assert.equal(sources.length, 2);
    assert.equal(sources[0].started[1], 5);
    assert.ok(sources[1].started[0] < sources[0].stopped);
    drone.start(9);
    assert.equal(sources[0].stopped, 0);
    assert.equal(sources[1].stopped, 0);
    assert.equal(sources[2].playbackRate.value, rateFor(9));
  } finally { drone.stop(); }
});
