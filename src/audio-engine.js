// 音名统一用降号拼写；索引不变，继续对应原录音与实际音高。
export const NOTES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
export const FILES = ['c', 'db', 'd', 'eb', 'e', 'f', 'gb', 'g', 'ab', 'a', 'bb', 'b'];
// 来源 Gb 起使用低八度，各调直接播放对应录音，不做变调。
const FREQUENCIES = [130.8, 138.6, 146.8, 155.6, 164.8, 174.6, 92.5, 98, 103.8, 110, 116.5, 123.5];
export const frequencyFor = index => FREQUENCIES[index];

export class Drone {
  context;
  master;
  analyser;
  samples;
  active;
  voices = new Set();
  generation = 0;
  volume = .65;
  disposed = false;
  running = false;

  async play(index) {
    if (!Number.isInteger(index) || index < 0 || index >= NOTES.length) throw new RangeError('无效调性');
    if (this.disposed) return false;
    const generation = ++this.generation;
    // 新请求取消尚未就绪或正在退场的旧播放器，仅保留当前声音。
    for (const voice of this.voices) if (voice !== this.active) this.release(voice);
    let voice;
    try {
      this.ensure();
      // 流式解码完整录音，不把 25 分钟音频全部展开为 PCM 缓存。
      voice = this.active?.index === index ? this.active : this.createVoice(index);
      voice.generation = generation;
      // 两个调用都在点击事件内启动，保留移动端的播放手势授权。
      const resumed = this.context.resume();
      const started = voice.audio.play();
      await Promise.all([resumed, started]);
      if (generation !== this.generation) {
        if (voice.generation === generation) voice.audio.pause();
        if (voice !== this.active) this.release(voice);
        return false;
      }
      const previous = this.active;
      // 复用仍在播放的同一调时不重新淡入，否则会先静音再回升，造成可听掉音。
      const resuming = voice === previous;
      this.active = voice;
      this.running = true;
      const now = this.context.currentTime;
      if (!resuming) {
        voice.gain.gain.cancelScheduledValues(now);
        voice.gain.gain.setValueAtTime(0, now);
        voice.gain.gain.linearRampToValueAtTime(1, now + .3);
      }
      if (previous && previous !== voice) {
        // 新调准备好后才淡出旧调，等待网络时不会突然断音。
        const level = previous.gain.gain.value;
        previous.gain.gain.cancelScheduledValues(now);
        previous.gain.gain.setValueAtTime(level, now);
        previous.gain.gain.linearRampToValueAtTime(0, now + .3);
        previous.timer = setTimeout(() => this.release(previous), 320);
      }
      return true;
    } catch (error) {
      if (voice && voice !== this.active) this.release(voice);
      if (generation !== this.generation) return false;
      throw error;
    }
  }

  // 供合成器共用音频上下文与主音量；必须由用户手势触发。
  ensure() {
    this.context ??= new AudioContext();
    if (!this.master) {
      this.master = this.context.createGain();
      this.master.gain.value = this.volume * .7;
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 256;
      this.samples = new Float32Array(this.analyser.fftSize);
      this.master.connect(this.analyser);
      this.analyser.connect(this.context.destination);
    }
    return this.context;
  }

  createVoice(index) {
    const audio = new Audio(`/audio/${FILES[index]}-tanpura.mp3`);
    audio.preload = 'metadata';
    audio.loop = true;
    audio.playbackRate = 1;
    const source = this.context.createMediaElementSource(audio);
    const gain = this.context.createGain();
    gain.gain.value = 0;
    source.connect(gain);
    gain.connect(this.master);
    const voice = { index, audio, source, gain };
    this.voices.add(voice);
    return voice;
  }

  release(voice) {
    if (!this.voices.delete(voice)) return;
    clearTimeout(voice.timer);
    voice.audio.pause();
    voice.source.disconnect();
    voice.gain.disconnect();
    // 丢弃旧调的媒体资源和未完成下载，快速切调不会累积播放器。
    voice.audio.removeAttribute('src');
    voice.audio.load();
  }

  setVolume(value) {
    this.volume = Math.max(0, Math.min(1, value));
    if (this.master) this.master.gain.setTargetAtTime(this.volume * .7, this.context.currentTime, .06);
  }

  getEnergy() {
    // 合成器独立音量也接入同一 analyser；静音 Tanpura 不能把总线能量清零。
    if (!this.running || !this.analyser) return 0;
    this.analyser.getFloatTimeDomainData(this.samples);
    let squares = 0;
    for (const sample of this.samples) squares += sample * sample;
    return Math.min(1, Math.sqrt(squares / this.samples.length) * 4);
  }

  stop() {
    // 暂停立即静音并作废待加载请求，同调保留当前位置供再次播放。
    ++this.generation;
    this.running = false;
    for (const voice of this.voices) {
      clearTimeout(voice.timer);
      voice.audio.pause();
      if (voice !== this.active) this.release(voice);
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
    for (const voice of this.voices) this.release(voice);
    this.active = undefined;
    return this.context?.close();
  }
}
