import test from 'node:test';
import assert from 'node:assert/strict';
import { Synth, SYNTH_KEY_MAP, SYNTH_RANGES, synthFrequency, synthKeys, synthNotes } from '../src/synth.js';

function param(initial = 0) {
  return {
    value: initial,
    setValueAtTime(value) { this.value = value; },
    linearRampToValueAtTime(value) { this.value = value; },
    exponentialRampToValueAtTime(value) { this.value = value; },
    setTargetAtTime(value) { this.value = value; },
    cancelScheduledValues() {},
  };
}

function setup(t) {
  const created = { gains: [], oscillators: [], filters: [], compressors: [] };
  const context = {
    currentTime: 0,
    resume: async () => {},
    createGain() {
      const node = {
        gain: param(),
        connect(target) { this.destination = target; },
        disconnect() { this.disconnected = true; },
      };
      created.gains.push(node);
      return node;
    },
    createOscillator() {
      const node = {
        type: '',
        frequency: param(),
        connect() {},
        disconnect() { this.disconnected = true; },
        start() { this.started = true; },
        stop() { this.stopped = true; },
      };
      created.oscillators.push(node);
      return node;
    },
    createBiquadFilter() {
      const node = { type: '', frequency: param(), Q: param(), connect() {}, disconnect() { this.disconnected = true; } };
      created.filters.push(node);
      return node;
    },
    createDynamicsCompressor() {
      const node = {
        threshold: param(),
        ratio: param(),
        connect(target) { this.destination = target; },
        disconnect() { this.disconnected = true; },
      };
      created.compressors.push(node);
      return node;
    },
  };
  const master = { gain: param(), connect() {}, disconnect() {} };
  const analyser = { connect() {}, disconnect() {} };
  const drone = { context, master, analyser, ensure() { return context; } };
  const synth = new Synth(drone);
  t.after(() => synth.dispose());
  return { synth, drone, created };
}

test('合成器键盘可切换起始八度，每组覆盖两个八度共 25 个半音', () => {
  assert.deepEqual(SYNTH_RANGES, [0, 1, 2, 3, 4, 5]);
  const standard = synthNotes(1);
  assert.equal(standard.length, 25);
  assert.equal(standard[0], 24);
  assert.equal(standard.at(-1), 48);
  assert.equal(synthNotes(0)[0], 12);
  assert.equal(synthNotes(3).at(-1), 72);
  const keys = synthKeys(1);
  assert.equal(keys.filter(key => !key.black).length, 15);
  assert.equal(keys.filter(key => key.black).length, 10);
  const sharp = keys.find(key => key.midi === 25);
  assert.ok(Math.abs(sharp.left - 100 / 15) < .001);
  assert.ok(Math.abs(synthFrequency(24) - 32.7) < .1);
  assert.ok(Math.abs(synthFrequency(36) - 65.4) < .1);
  assert.ok(Math.abs(synthFrequency(48) - 130.81) < .1);
  assert.equal(Object.keys(SYNTH_KEY_MAP).length, 25);
  // 键位映射存的是音域内偏移，切换八度后同一按键换到对应音高。
  assert.deepEqual(new Set(Object.values(SYNTH_KEY_MAP)), new Set(Array.from({ length: 25 }, (_, index) => index)));
});

test('按键创建共享主音量的声部，重复按键不叠加', t => {
  const { synth, drone, created } = setup(t);
  assert.equal(synth.noteOn(24), true);
  assert.equal(created.compressors.length, 1);
  assert.equal(created.compressors[0].threshold.value, -18);
  assert.equal(created.compressors[0].destination, synth.level);
  assert.equal(synth.level.destination, drone.analyser);
  const voice = synth.voices.get(24);
  assert.equal(voice.oscillators.length, 2);
  const frequencies = voice.oscillators.map(oscillator => oscillator.frequency.value).sort((a, b) => a - b);
  assert.ok(Math.abs(frequencies[0] - 32.7) < .1);
  assert.ok(Math.abs(frequencies[1] - 65.4) < .1);
  assert.ok(voice.oscillators.every(oscillator => oscillator.started));
  assert.equal(synth.noteOn(24), false);
  assert.equal(created.oscillators.length, 2);
  // 任意音域的合法 MIDI 音都可叠加，越界与非整数被拒绝。
  assert.equal(synth.noteOn(12), true);
  assert.equal(synth.noteOn(24.5), false);
  assert.equal(synth.noteOn(-1), false);
  assert.equal(synth.noteOn(128), false);
});

test('合成器音量独立于 Tanpura 主音量', t => {
  const { synth, drone } = setup(t);
  synth.noteOn(24);
  synth.setVolume(.45);
  assert.equal(synth.level.gain.value, .45);
  assert.equal(drone.master.gain.value, 0);
  synth.setVolume(2);
  assert.equal(synth.level.gain.value, 1);
  synth.setVolume(-1);
  assert.equal(synth.level.gain.value, 0);
});

test('松开按键淡出后停止并清理声部', t => {
  const { synth } = setup(t);
  synth.noteOn(36);
  const voice = synth.voices.get(36);
  assert.equal(synth.noteOff(36), true);
  assert.equal(voice.releasing, true);
  assert.equal(voice.gain.gain.value, .0001);
  assert.ok(voice.oscillators.every(oscillator => oscillator.stopped));
  assert.equal(synth.noteOff(36), false);
  assert.equal(synth.noteOff(60), false);
});

test('同音重新按下会替换仍在淡出的旧声部', t => {
  const { synth, created } = setup(t);
  synth.noteOn(24);
  const oldVoice = synth.voices.get(24);
  synth.noteOff(24);
  assert.equal(synth.noteOn(24), true);
  assert.notEqual(synth.voices.get(24), oldVoice);
  assert.ok(!synth.voices.get(24).releasing);
  assert.equal(created.oscillators.length, 4);
});

test('停止与销毁释放全部声部，销毁后不再发声', t => {
  const { synth } = setup(t);
  synth.noteOn(24);
  synth.noteOn(36);
  synth.noteOn(48);
  assert.equal(synth.voices.size, 3);
  synth.stop();
  assert.ok([...synth.voices.values()].every(voice => voice.releasing));
  synth.dispose();
  assert.equal(synth.voices.size, 0);
  assert.equal(synth.noteOn(24), false);
});
