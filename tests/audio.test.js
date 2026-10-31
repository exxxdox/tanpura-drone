import test from 'node:test';
import assert from 'node:assert/strict';
import { NOTES, frequencyFor, Drone } from '../src/audio-engine.js';

function setup(t) {
  const sources = [];
  const requests = [];
  const drone = new Drone();
  // 刻意不提供 cancelAndHoldAtTime，覆盖 Firefox/Zen 兼容性。
  const gain = () => ({ gain: { value: .4, setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {}, setTargetAtTime() {} }, connect() {}, disconnect() {} });
  drone.context = { currentTime: 0, resume: async () => {}, close: async () => {}, createGain: gain,
    decodeAudioData: async bytes => ({ duration: 60, key: bytes }), createBufferSource() {
      const source = { playbackRate: {}, connect() { return { connect() {} }; }, start(...args) { this.started = args; }, stop(time) { this.stopped = time; }, disconnect() {} };
      sources.push(source); return source;
    } };
  t.mock.method(globalThis, 'fetch', url => new Promise((resolve, reject) => requests.push({ url, resolve, reject })));
  t.after(() => drone.dispose());
  return { drone, sources, requests };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
const response = key => ({ ok: true, arrayBuffer: async () => key });

test('十二调使用独立录音、来源八度和原速播放，缓存限制为两调', async t => {
  const { drone, sources, requests } = setup(t);
  assert.equal(new Set(NOTES).size, 12);
  assert.equal(frequencyFor(6), 92.5);
  assert.equal(frequencyFor(9), 110);
  for (let index = 0; index < 12; index++) {
    const playing = drone.play(index);
    await tick();
    requests[index].resolve(response(index));
    assert.equal(await playing, true);
    assert.ok(drone.buffers.size <= 2);
  }
  assert.equal(new Set(requests.map(request => request.url)).size, 12);
  assert.equal(requests[1].url, '/audio/db-tanpura.mp3');
  assert.deepEqual([...drone.buffers.keys()], [10, 11]);
  assert.ok(sources.every(source => source.playbackRate.value === 1));
});

test('循环重叠，暂停取消当前和未来声音，连续暂停不重排旧包络', async t => {
  const { drone, sources, requests } = setup(t);
  const playing = drone.play(0);
  await tick(); requests[0].resolve(response(0)); await playing;
  assert.equal(sources.length, 2);
  assert.equal(sources[0].started[1], 0);
  assert.ok(sources[1].started[0] < sources[0].stopped);
  drone.context.currentTime = 1;
  drone.stop();
  assert.equal(sources[0].stopped, 1.31);
  assert.equal(sources[1].stopped, 1);
  assert.equal(drone.voices.size, 0);
  drone.stop();
  assert.equal(sources[0].stopped, 1.31);
});

test('旧请求晚完成不能替换新调，暂停令待加载请求失效', async t => {
  const { drone, sources, requests } = setup(t);
  const first = drone.play(0); await tick();
  const second = drone.play(1); await tick();
  requests[1].resolve(response(1));
  assert.equal(await second, true);
  requests[0].resolve(response(0));
  assert.equal(await first, false);
  assert.equal(sources.length, 2);
  assert.ok(sources.every(source => source.buffer.key === 1));
  const pending = drone.play(2); await tick();
  drone.stop();
  requests[2].resolve(response(2));
  assert.equal(await pending, false);
  assert.equal(sources.length, 2);
});

test('解码期间暂停不会复活，过期错误不影响新请求', async t => {
  const { drone, sources, requests } = setup(t);
  let finishDecode;
  drone.context.decodeAudioData = () => new Promise(resolve => { finishDecode = resolve; });
  const pending = drone.play(0); await tick();
  requests[0].resolve(response(0)); await tick();
  drone.stop(); finishDecode({ duration: 60 });
  assert.equal(await pending, false);
  assert.equal(sources.length, 0);
  drone.context.decodeAudioData = async () => ({ duration: 60 });
  const old = drone.play(1); await tick();
  const current = drone.play(2); await tick();
  requests[1].reject(new Error('old failed'));
  assert.equal(await old, false);
  requests[2].resolve(response(2));
  assert.equal(await current, true);
});

test('新音源加载失败保留旧声音，错误可重试', async t => {
  const { drone, requests, sources } = setup(t);
  const first = drone.play(0); await tick(); requests[0].resolve(response(0)); await first;
  const stopped = sources[0].stopped;
  const failed = drone.play(1); await tick(); requests[1].resolve({ ok: false });
  await assert.rejects(failed, /音源加载失败/);
  assert.equal(sources[0].stopped, stopped);
  assert.equal(drone.voices.size, 2);
});
