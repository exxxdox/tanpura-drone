// 合成器低音：每组两个八度 + 收尾高音，起始八度可切换。声部接在 Drone 的 master 上。
export const SYNTH_RANGES = [0, 1, 2, 3, 4, 5];

// 键位映射存音域内偏移 0–24：Z–M 低音区，Q–U 高音区，I 为收尾高音。
export const SYNTH_KEY_MAP = {
  z: 0, s: 1, x: 2, d: 3, c: 4, v: 5, g: 6, b: 7, h: 8, n: 9, j: 10, m: 11,
  q: 12, 2: 13, w: 14, 3: 15, e: 16, r: 17, 5: 18, t: 19, 6: 20, y: 21, 7: 22, u: 23,
  i: 24,
};

const BLACK_PITCHES = new Set([1, 3, 6, 8, 10]);

// C{base} 的 MIDI 号是 (base + 1) * 12，例如 C1 = 24。
export const synthNotes = base => Array.from({ length: 25 }, (_, index) => (base + 1) * 12 + index);

const WHITE_COUNT = synthNotes(0).filter(midi => !BLACK_PITCHES.has(midi % 12)).length;

// 黑键的 left 取“此前白键数量”的百分比，模板据此绝对定位。
export const synthKeys = base => {
  let white = 0;
  return synthNotes(base).map(midi => {
    const black = BLACK_PITCHES.has(midi % 12);
    const key = { midi, black, left: (white / WHITE_COUNT) * 100 };
    if (!black) white++;
    return key;
  });
};

export const synthFrequency = midi => 440 * 2 ** ((midi - 69) / 12);

const LEVEL = .14;
const ATTACK = .03;
const RELEASE = .4;

export class Synth {
  voices = new Map();
  bus;
  level;
  volume = 1;
  transpose = 0;
  disposed = false;

  constructor(drone) {
    this.drone = drone;
  }

  noteOn(midi) {
    if (this.disposed || !Number.isInteger(midi) || midi < 0 || midi > 127) return false;
    const current = this.voices.get(midi);
    if (current && !current.releasing) return false;
    if (current) this.finish(current);
    const context = this.output();
    const now = context.currentTime;
    const frequency = synthFrequency(midi + this.transpose);
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

  stop() {
    for (const midi of [...this.voices.keys()]) this.noteOff(midi);
  }

  setTranspose(value) {
    if (!Number.isInteger(value) || value < -12 || value > 12) return false;
    // 声部仍以物理琴键编号释放；换调先淡出，避免旧音与新音混用。
    if (value !== this.transpose) this.stop();
    this.transpose = value;
    return true;
  }

  // 合成器独立音量，不再受 Tanpura 主音量影响。
  setVolume(value) {
    this.volume = Math.max(0, Math.min(1, value));
    if (this.level) this.level.gain.setTargetAtTime(this.volume, this.drone.context.currentTime, .06);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const voice of [...this.voices.values()]) this.finish(voice);
    this.bus?.disconnect();
    this.level?.disconnect();
    this.bus = undefined;
    this.level = undefined;
  }

  output() {
    const context = this.drone.ensure();
    if (!this.bus) {
      // 多个低音叠加容易削波，总线加一级压缩限制峰值。
      this.bus = context.createDynamicsCompressor();
      this.bus.threshold.value = -18;
      this.bus.ratio.value = 6;
      // 独立音量节点直接进入共享 analyser：绕开 Tanpura 主音量，但保留可视化能量。
      this.level = context.createGain();
      this.level.gain.value = this.volume;
      this.bus.connect(this.level);
      this.level.connect(this.drone.analyser);
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
