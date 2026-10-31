// 合成器低音：C1–C3 两个八度。声部接在 Drone 的 master 上，共用音量与 analyser。
export const SYNTH_NOTES = Array.from({ length: 25 }, (_, index) => 24 + index);

// 电脑键盘按钢琴布局左右手分区：Z–M 为 C1–B1，Q–U 为 C2–B2，I 为最高 C3。
export const SYNTH_KEY_MAP = {
  z: 24, s: 25, x: 26, d: 27, c: 28, v: 29, g: 30, b: 31, h: 32, n: 33, j: 34, m: 35,
  q: 36, 2: 37, w: 38, 3: 39, e: 40, r: 41, 5: 42, t: 43, 6: 44, y: 45, 7: 46, u: 47,
  i: 48,
};

const BLACK_PITCHES = new Set([1, 3, 6, 8, 10]);
const WHITE_COUNT = SYNTH_NOTES.filter(midi => !BLACK_PITCHES.has(midi % 12)).length;

// 黑键的 left 取“此前白键数量”的百分比，模板据此绝对定位。
export const SYNTH_KEYS = (() => {
  let white = 0;
  return SYNTH_NOTES.map(midi => {
    const black = BLACK_PITCHES.has(midi % 12);
    const key = { midi, black, left: (white / WHITE_COUNT) * 100 };
    if (!black) white++;
    return key;
  });
})();

export const synthFrequency = midi => 440 * 2 ** ((midi - 69) / 12);

const LEVEL = .14;
const ATTACK = .03;
const RELEASE = .4;

export class Synth {
  voices = new Map();
  bus;
  disposed = false;

  constructor(drone) {
    this.drone = drone;
  }

  noteOn(midi) {
    if (this.disposed || !SYNTH_NOTES.includes(midi)) return false;
    const current = this.voices.get(midi);
    if (current && !current.releasing) return false;
    if (current) this.finish(current);
    const context = this.output();
    const now = context.currentTime;
    const frequency = synthFrequency(midi);
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(LEVEL, now + ATTACK);
    gain.connect(this.bus);
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    // 低音保留二次谐波才听得到；高音限制截止避免锯齿感。
    filter.frequency.value = Math.min(3000, Math.max(600, frequency * 10));
    filter.Q.value = .7;
    filter.connect(gain);
    const oscillators = [
      this.oscillator(context, 'sine', frequency),
      this.oscillator(context, 'triangle', frequency * 2),
    ];
    for (const oscillator of oscillators) oscillator.connect(filter);
    // 在点击手势内恢复上下文，移动端首次触碰才允许发声。
    context.resume?.();
    this.voices.set(midi, { midi, gain, filter, oscillators });
    return true;
  }

  noteOff(midi) {
    const voice = this.voices.get(midi);
    if (!voice || voice.releasing) return false;
    voice.releasing = true;
    const now = this.drone.context.currentTime;
    const gain = voice.gain.gain;
    gain.cancelScheduledValues(now);
    // 指数淡出必须以非零值起步，避免 Web Audio 抛错。
    gain.setValueAtTime(Math.max(.0001, gain.value), now);
    gain.exponentialRampToValueAtTime(.0001, now + RELEASE);
    for (const oscillator of voice.oscillators) oscillator.stop(now + RELEASE + .05);
    voice.timer = setTimeout(() => this.finish(voice), (RELEASE + .1) * 1000);
    return true;
  }

  isActive(midi) {
    const voice = this.voices.get(midi);
    return !!voice && !voice.releasing;
  }

  stop() {
    for (const midi of [...this.voices.keys()]) this.noteOff(midi);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const voice of [...this.voices.values()]) this.finish(voice);
    this.bus?.disconnect();
    this.bus = undefined;
  }

  output() {
    const context = this.drone.ensure();
    if (!this.bus) {
      // 多个低音叠加容易削波，总线加一级压缩限制峰值。
      this.bus = context.createDynamicsCompressor();
      this.bus.threshold.value = -18;
      this.bus.ratio.value = 6;
      this.bus.connect(this.drone.master);
    }
    return context;
  }

  oscillator(context, type, frequency) {
    const oscillator = context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    oscillator.start();
    return oscillator;
  }

  finish(voice) {
    clearTimeout(voice.timer);
    if (this.voices.get(voice.midi) === voice) this.voices.delete(voice.midi);
    voice.filter.disconnect();
    voice.gain.disconnect();
    for (const oscillator of voice.oscillators) {
      oscillator.stop();
      oscillator.disconnect();
    }
  }
}
