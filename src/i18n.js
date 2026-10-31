// 文案集中管理，切换语言只更新显示，不重建播放器或合成器。
export const messages = {
  zh: {
    home: 'Tanpura 首页', tagline: '为专注而鸣', sources: '音源 ↗', language: '语言',
    eyebrow: '你的随身印度持续音', heading1: '一弦，', heading2: '进入心流。',
    intro1: '让声音延展。', intro2: '找到你的调，回到此刻。', twelve: '十二个调 · 无限共鸣',
    player: 'Tanpura 播放器', resonance: '共 鸣', tonic: '当前主音', pause: '暂停播放', play: '开始播放',
    idle: '轻触播放，开启共鸣', loading: '正在加载 {note} 调…', playing: '{note} 调 · 持续共鸣中',
    loadError: '音源加载失败，请检查网络后重试', controls: '声音控制', choose: '选择你的调', sa: '主音 / Sa',
    keys: '十二个调', key: '{note} 调', volume: '音量', synth: '合成器低音', range: '音域',
    octave: '合成器起始八度', mode: '合成器演奏方式', latch: '点击持续', hold: '按住发声',
    keyboard: '合成器键盘：{from} 到 {to}', synthNote: '合成器 {note}', synthVolume: '合成器音量',
    shortcuts: '电脑键盘：Z–M 低音区，Q–U 高音区，I 为最高音 {note}',
    recording: '25 分钟完整录音 · 循环播放', headphones: '建议佩戴耳机',
    footer: '留一点空间，给声音。', footerRight: '拨弦之后，万物渐静',
    about: '关于音源', close: '关闭音源说明',
    aboutRecording: '十二个调各自播放完整约 25 分钟录音，原速播放，循环共鸣。首次播放需要点击按钮。切换调性时，声音平滑过渡。',
    aboutSynth: '合成器低音可在 C0 到 C5 之间切换起始八度，与任意调叠加，音量独立调节。',
    title: 'Tanpura — 弦外之境', description: '十二个调，一片共鸣。无需登录的 Tanpura 持续音练习空间。',
  },
  en: {
    home: 'Tanpura home', tagline: 'Sound for focus', sources: 'Sound ↗', language: 'Language',
    eyebrow: 'Your Indian drone companion', heading1: 'One string.', heading2: 'Find your flow.',
    intro1: 'Let sound unfold.', intro2: 'Find your key. Return to now.', twelve: 'Twelve keys · Endless resonance',
    player: 'Tanpura player', resonance: 'RESONANCE', tonic: 'CURRENT TONIC', pause: 'Pause playback', play: 'Start playback',
    idle: 'Press play. Find your resonance.', loading: 'Loading {note}…', playing: '{note} · Resonating',
    loadError: 'Could not load audio. Check your connection and try again.', controls: 'Sound controls', choose: 'Choose your key', sa: 'Tonic / Sa',
    keys: 'Twelve keys', key: '{note} key', volume: 'Volume', synth: 'Bass synth', range: 'Range',
    octave: 'Synth starting octave', mode: 'Synth play mode', latch: 'Latch', hold: 'Hold',
    keyboard: 'Synth keyboard: {from} to {to}', synthNote: 'Synth {note}', synthVolume: 'Synth volume',
    shortcuts: 'Keyboard: Z–M lower octave, Q–U upper octave, I highest note {note}',
    recording: 'Full 25-minute recordings · Looping', headphones: 'Headphones recommended',
    footer: 'Make room for sound.', footerRight: 'A string sounds. The world settles.',
    about: 'About the sound', close: 'Close sound information',
    aboutRecording: 'Each of the twelve keys plays its own full recording of about 25 minutes, looping at its original speed. Press play to begin. Switching keys blends the sound smoothly.',
    aboutSynth: 'Choose a starting octave from C0 to C5 for the bass synth. Layer it over any key and adjust its volume independently.',
    title: 'Tanpura — Find your resonance', description: 'Twelve keys. Endless resonance. A Tanpura drone practice space, no login needed.',
  },
};

export function resolveLocale(saved, languages = []) {
  if (saved === 'zh' || saved === 'en') return saved;
  return /^zh(?:-|$)/i.test(languages[0] ?? '') ? 'zh' : 'en';
}

export function readLocale(storage, browser) {
  let saved;
  // 隐私模式或禁用存储时仍可按浏览器语言使用。
  try { saved = storage.getItem('tanpura-language'); } catch { /* 使用浏览器默认值。 */ }
  return resolveLocale(saved, browser.languages?.length ? browser.languages : [browser.language]);
}

export function saveLocale(storage, locale) {
  if (locale !== 'zh' && locale !== 'en') return;
  // 存储失败不影响当前页面的手动切换。
  try { storage.setItem('tanpura-language', locale); } catch { /* 当前页面继续使用所选语言。 */ }
}
