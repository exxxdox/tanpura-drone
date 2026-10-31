export const NOTES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const FILES = ['c', 'db', 'd', 'eb', 'e', 'f', 'gb', 'g', 'ab', 'a', 'bb', 'b'];
// 使用来源页面的实际八度，F♯ 起为低八度，不再从 C 调计算变调。
const FREQUENCIES = [130.8, 138.6, 146.8, 155.6, 164.8, 174.6, 92.5, 98, 103.8, 110, 116.5, 123.5];
export const frequencyFor = index => FREQUENCIES[index];

export class Drone {
  context;
  master;
  buffers = new Map();
  voices = new Set();
  timer;
  generation = 0;
  volume = .65;
  disposed = false;

  async play(index) {
    if (!Number.isInteger(index) || index < 0 || index >= NOTES.length) throw new RangeError('无效调性');
    if (this.disposed) return false;
    const generation = ++this.generation;
    try {
      this.context ??= new AudioContext();
      // 点击事件内先恢复音频，下载和解码不应消耗移动端手势授权。
      await this.context.resume();
      if (generation !== this.generation) return false;
      if (!this.master) {
        this.master = this.context.createGain();
        this.master.gain.value = this.volume * .7;
        this.master.connect(this.context.destination);
      }
      let buffer = this.buffers.get(index);
      if (!buffer) {
        const response = await fetch(`/audio/${FILES[index]}-tanpura.mp3`);
        if (!response.ok) throw new Error('音源加载失败，请重试');
        const bytes = await response.arrayBuffer();
        if (generation !== this.generation) return false;
        buffer = await this.context.decodeAudioData(bytes);
        if (generation !== this.generation) return false;
        if (!Number.isFinite(buffer.duration) || buffer.duration <= 3) throw new Error('音源时长无效');
      }
      // 只保留最近两调的解码数据，避免移动端缓存十二份 PCM。
      this.buffers.delete(index);
      this.buffers.set(index, buffer);
      while (this.buffers.size > 2) this.buffers.delete(this.buffers.keys().next().value);
      this.halt();
      this.start(buffer);
      return true;
    } catch (error) {
      // 过期请求失败不能覆盖新调或暂停后的界面状态。
      if (generation !== this.generation) return false;
      throw error;
    }
  }

  setVolume(value) {
    this.volume = value;
    if (this.master) this.master.gain.setTargetAtTime(value * .7, this.context.currentTime, .06);
  }

  start(buffer) {
    const duration = buffer.duration;
    const fade = 1.5;
    let next = this.context.currentTime + .04;
    const schedule = () => {
      // 按音频时钟提前排程，缓冲后台标签页的定时器延迟。
      while (next < this.context.currentTime + 100) {
        const source = this.context.createBufferSource();
        const gain = this.context.createGain();
        source.buffer = buffer;
        source.playbackRate.value = 1;
        source.connect(gain).connect(this.master);
        gain.gain.setValueAtTime(0, next);
        gain.gain.linearRampToValueAtTime(1, next + fade);
        gain.gain.setValueAtTime(1, next + duration - fade);
        gain.gain.linearRampToValueAtTime(0, next + duration);
        const voice = { source, gain, at: next };
        this.voices.add(voice);
        source.onended = () => { this.voices.delete(voice); source.disconnect(); gain.disconnect(); };
        source.start(next, 0, duration);
        source.stop(next + duration);
        next += duration - fade;
      }
    };
    schedule();
    this.timer = setInterval(schedule, 1000);
  }

  halt() {
    clearInterval(this.timer);
    if (!this.context) return;
    const now = this.context.currentTime;
    for (const { source, gain, at } of this.voices) {
      // Firefox/Zen 缺少 cancelAndHoldAtTime，保存音量后使用通用 API 淡出。
      const level = gain.gain.value;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(level, now);
      gain.gain.linearRampToValueAtTime(0, now + .3);
      source.stop(at > now ? now : now + .31);
    }
    this.voices.clear();
  }

  stop() {
    // 暂停同时作废下载和解码，防止晚返回的音源重新发声。
    ++this.generation;
    this.halt();
  }

  dispose() {
    this.disposed = true;
    this.stop();
    this.buffers.clear();
    return this.context?.close();
  }
}
