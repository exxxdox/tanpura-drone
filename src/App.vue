<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { messages, readLocale, saveLocale } from './i18n.js';
import { Drone, NOTES, frequencyFor } from './audio-engine.js';
import { Synth, SYNTH_KEY_MAP, SYNTH_RANGES, synthKeys, synthNotes } from './synth.js';

// localStorage 的属性访问本身也可能被浏览器隐私设置拒绝。
let storage;
try { storage = window.localStorage; } catch { /* 继续使用浏览器语言。 */ }
const locale = ref(readLocale(storage, navigator));
const text = computed(() => messages[locale.value]);
const t = (key, values = {}) => text.value[key].replace(/\{(\w+)\}/g, (_, name) => values[name]);
function setLocale(event) {
  const value = event.target.value;
  if (value !== 'zh' && value !== 'en') return;
  locale.value = value;
  saveLocale(storage, value);
}
// 同步辅助技术和浏览器标签；不影响当前播放状态。
watch(locale, () => {
  document.documentElement.lang = locale.value === 'zh' ? 'zh-CN' : 'en';
  document.title = text.value.title;
  document.querySelector('meta[name="description"]')?.setAttribute('content', text.value.description);
}, { immediate: true });

const STRING_SHAPES = [[230, -38], [275, -16], [325, 16], [370, 38]];
const ANCHORS = STRING_SHAPES.flatMap(([x]) => [72, 528].map(y => ({ x, y })));
const basePath = ([x, bow]) => `M${x} 72 C${x + bow} 180 ${x + bow} 420 ${x} 528`;
const labelFor = midi => `${NOTES[midi % 12]}${Math.floor(midi / 12) - 1}`;
const rangeLabel = base => `C${base}–C${base + 2}`;
// 录音从 F♯ 起低一个八度，音区标注须与现有主音频率一致。
const droneOctave = index => index < 6 ? 3 : 2;

let engine;
let synth;
let intent = false;
let frame;
let energy = 0;
let motion;

const playButton = ref(null);
const scene = ref(null);
const strings = ref([]);
const selected = ref(0);
const playing = ref(false);
const loading = ref(false);
const error = ref('');
const volume = ref(65);
const infoOpen = ref(false);
// 默认按住发声，避免首次点击留下不易察觉的持续低音。
const synthMode = ref('hold');
const synthRange = ref(1);
const synthVolume = ref(45);
const activeNotes = ref(new Set());
// 记录由电脑键盘按下的音，keyup 只释放这些音，避免切断鼠标按住的声部。
const keyboardNotes = new Set();
// 键盘按白键与黑键分开渲染，黑键用 left 百分比叠在白键之间。
const whiteKeys = computed(() => synthKeys(synthRange.value).filter(key => !key.black));
const blackKeys = computed(() => synthKeys(synthRange.value).filter(key => key.black));
const topNote = computed(() => labelFor(synthNotes(synthRange.value).at(-1)));

const note = computed(() => NOTES[selected.value]);
const active = computed(() => playing.value || loading.value);
const status = computed(() => t(error.value || (loading.value ? 'loading' : playing.value ? 'playing' : 'idle'), { note: note.value }));

// 直接更新 SVG 与 CSS 变量，不让逐帧音量采样触发重渲染。
function resetStrings() {
  scene.value?.style.setProperty('--energy', '0');
  scene.value?.parentElement?.style.setProperty('--energy', '0');
  strings.value.forEach((path, index) => path?.setAttribute('d', basePath(STRING_SHAPES[index])));
}

function draw(time) {
  const level = Math.min(1, (engine?.getEnergy() ?? 0) * 2.8);
  energy += (level - energy) * .14;
  scene.value?.style.setProperty('--energy', energy.toFixed(3));
  scene.value?.parentElement?.style.setProperty('--energy', energy.toFixed(3));
  strings.value.forEach((path, index) => {
    const [x, bow] = STRING_SHAPES[index];
    const vibration = Math.sin(time * (.014 + index * .002) + index * 1.7) * energy * (13 + index * 3);
    path?.setAttribute('d', `M${x} 72 C${x + bow + vibration} 180 ${x + bow - vibration} 420 ${x} 528`);
  });
  frame = requestAnimationFrame(draw);
}

// 遵循系统减少动态效果设置，暂停时也完全停止逐帧采样。
function syncMotion() {
  cancelAnimationFrame(frame);
  resetStrings();
  if (playing.value && !motion.matches) frame = requestAnimationFrame(draw);
}

function stop() {
  intent = false;
  engine?.stop();
  releaseAll();
  playing.value = false;
  loading.value = false;
}

function onKey(event) {
  if (event.key === 'Escape') infoOpen.value = false;
  if (event.code === 'Space' && [document.body, document.documentElement].includes(event.target)) {
    event.preventDefault();
    playButton.value?.click();
  }
}

async function play(index) {
  intent = true;
  loading.value = true;
  error.value = '';
  try {
    const started = await engine.play(index);
    // 引擎对已作废的请求返回 false，晚返回的下载不能把界面改回播放。
    if (!started) return;
    playing.value = true;
    loading.value = false;
  } catch {
    engine.stop();
    intent = false;
    playing.value = false;
    loading.value = false;
    error.value = 'loadError';
  }
}

function togglePlayback() {
  if (!intent) { play(selected.value); return; }
  intent = false;
  engine.stop();
  // 暂停是整体停止：主按钮按下后不能再有合成器声部继续响。
  releaseAll();
  playing.value = false;
  loading.value = false;
  error.value = '';
}

function selectKey(index) {
  if (index === selected.value) return;
  selected.value = index;
  error.value = '';
  if (intent) play(index);
}

// 每次替换 Set 而不是原地修改，保证模板里的按键高亮响应更新。
function markNote(midi, on) {
  const next = new Set(activeNotes.value);
  if (on) next.add(midi); else next.delete(midi);
  activeNotes.value = next;
}

function noteOn(midi) {
  if (activeNotes.value.has(midi)) return;
  synth.noteOn(midi);
  markNote(midi, true);
}

function noteOff(midi) {
  if (!activeNotes.value.has(midi)) return;
  synth.noteOff(midi);
  markNote(midi, false);
}

function pressNote(midi) {
  if (synthMode.value !== 'latch') return;
  if (activeNotes.value.has(midi)) noteOff(midi); else noteOn(midi);
}

function holdNote(event, midi) {
  if (synthMode.value !== 'hold') return;
  // 只响应主指针左键：右键菜单可能吞掉 pointerup，留下挂音。
  if (!event.isPrimary || event.button !== 0) return;
  noteOn(midi);
}

function releaseNote(midi) {
  if (synthMode.value === 'hold') noteOff(midi);
}

// 聚焦琴键时也支持键盘：持续模式交给原生 click，按住模式拦截空格/回车。
function keyHold(event, midi) {
  if (synthMode.value !== 'hold') return;
  event.preventDefault();
  noteOn(midi);
}

function keyRelease(event, midi) {
  if (synthMode.value !== 'hold') return;
  event.preventDefault();
  noteOff(midi);
}

function releaseAll() {
  synth?.stop();
  keyboardNotes.clear();
  activeNotes.value = new Set();
}

// 切换演奏方式时清空发声，避免“按住”模式下松手事件丢失造成挂音。
function setSynthMode(mode) {
  if (mode === synthMode.value) return;
  synthMode.value = mode;
  releaseAll();
}

function isFormField(target) {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

// 切换音域时释放全部声部，避免旧音域的音挂住。
function setSynthRange(event) {
  const base = Number(event.target.value);
  if (!SYNTH_RANGES.includes(base)) return;
  releaseAll();
  synthRange.value = base;
}

// 键盘映射存的是音域内偏移，按键时换算成当前八度的 MIDI 音高。
function midiFor(offset) {
  return synthNotes(synthRange.value)[offset];
}

function onSynthKeyDown(event) {
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
  if (isFormField(event.target)) return;
  const offset = SYNTH_KEY_MAP[event.key.toLowerCase()];
  if (offset === undefined) return;
  event.preventDefault();
  const midi = midiFor(offset);
  if (synthMode.value === 'latch') { pressNote(midi); return; }
  keyboardNotes.add(midi);
  noteOn(midi);
}

// 只处理“按住”模式的松键，持续模式在 keydown 时已完成切换。
function onSynthKeyUp(event) {
  if (synthMode.value !== 'hold') return;
  const offset = SYNTH_KEY_MAP[event.key.toLowerCase()];
  if (offset === undefined) return;
  const midi = midiFor(offset);
  if (keyboardNotes.delete(midi)) noteOff(midi);
}

function onVolumeInput(event) {
  const value = Number(event.target.value);
  volume.value = value;
  engine.setVolume(value / 100);
}

function onSynthVolumeInput(event) {
  const value = Number(event.target.value);
  synthVolume.value = value;
  synth.setVolume(value / 100);
}

watch(playing, syncMotion);

onMounted(() => {
  engine = new Drone();
  synth = new Synth(engine);
  synth.setVolume(synthVolume.value / 100);
  motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  window.addEventListener('pagehide', stop);
  // 窗口失焦时松键事件可能丢失，统一淡出全部合成器声部。
  window.addEventListener('blur', releaseAll);
  document.addEventListener('keydown', onKey);
  document.addEventListener('keydown', onSynthKeyDown);
  document.addEventListener('keyup', onSynthKeyUp);
  motion.addEventListener('change', syncMotion);
  syncMotion();
});

onUnmounted(() => {
  intent = false;
  synth.dispose();
  engine.dispose();
  window.removeEventListener('pagehide', stop);
  window.removeEventListener('blur', releaseAll);
  document.removeEventListener('keydown', onKey);
  document.removeEventListener('keydown', onSynthKeyDown);
  document.removeEventListener('keyup', onSynthKeyUp);
  motion?.removeEventListener('change', syncMotion);
  cancelAnimationFrame(frame);
  resetStrings();
});
</script>

<template>
  <div class="group relative min-h-dvh bg-bg text-ink wide:grid wide:h-dvh wide:grid-rows-[auto_minmax(0,1fr)_auto] wide:[--gutter:clamp(32px,5vw,96px)]" :data-playing="playing" :class="locale === 'en' ? '[&_*]:tracking-normal' : ''">
    <div class="grain" aria-hidden="true" />
    <header class="relative flex h-[116px] items-center gap-[25px] mobile:gap-2 px-[6%] mobile:h-[85px] wide:mx-auto wide:h-[clamp(72px,8dvh,112px)] wide:w-full wide:max-w-[1800px] wide:px-[var(--gutter)]">
      <a class="shrink-0 text-[30px] mobile:text-[23px] font-semibold tracking-[-1.5px] text-ink no-underline" href="./" :aria-label="text.home"><span class="mr-3 mobile:mr-1 inline-block align-[-3px] text-[38px] mobile:text-[28px] text-gold">≋</span> tanpura<span class="text-gold">.</span></a>
      <span class="border-l border-line pl-[25px] text-[13px] tracking-[3px] text-muted mobile:hidden">{{ text.tagline }}</span>
      <select id="language" class="ml-auto rounded-full border border-line bg-bg px-3 mobile:px-2 py-2 text-[13px] text-muted" :aria-label="text.language" :value="locale" @change="setLocale">
        <option value="zh" lang="zh-CN">中文</option>
        <option value="en" lang="en">English</option>
      </select>
      <button id="sound-info" class="shrink-0 rounded-[30px] border border-line bg-transparent px-[18px] mobile:px-2 py-[10px] text-[13px] text-muted transition-colors hover:border-gold hover:text-gold" :aria-expanded="infoOpen" aria-controls="credits" @click="infoOpen = !infoOpen">{{ text.sources }}</button>
    </header>
    <main class="relative mx-auto grid max-w-[1440px] grid-cols-[1fr_1.6fr] items-center px-[6%] pb-[62px] pt-5 mobile:grid-cols-1 mobile:pt-[22px] wide:w-full wide:max-w-[1800px] wide:min-h-0 wide:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] wide:grid-rows-[minmax(0,1fr)_auto] wide:gap-y-[clamp(16px,2.4dvh,32px)] wide:px-[var(--gutter)] wide:pb-[clamp(18px,3dvh,40px)] wide:pt-0">
      <section class="min-w-0 self-center pt-[5px] mobile:z-[2]">
        <div class="flex items-center gap-[10px] text-[12px] tracking-[3px] text-gold mobile:text-[11px]"><span class="h-[5px] w-[5px] rounded-full bg-gold" /> {{ text.eyebrow }}</div>
        <h1 class="mb-[22px] mt-6 font-serif text-[clamp(48px,5.8vw,84px)] font-normal leading-[1.5] tracking-[4px] mobile:my-[15px] mobile:text-[clamp(30px,8.5vw,36px)] mobile:leading-[1.4] mobile:tracking-[2px] wide:my-[clamp(16px,2dvh,28px)] wide:text-[clamp(44px,min(4.8vw,7.4dvh),90px)] wide:leading-[1.4]">{{ text.heading1 }}<br class="mobile:hidden" />{{ text.heading2 }}</h1>
        <p class="my-[1em] text-[15px] leading-[2.1] tracking-[2px] text-muted mobile:m-0 mobile:text-[13px] mobile:leading-[1.8] short:text-[14px]">{{ text.intro1 }}<br class="mobile:hidden" />{{ text.intro2 }}</p>
        <div class="mt-[45px] flex items-center gap-[14px] text-[12px] tracking-[2px] text-muted mobile:hidden wide:mt-[clamp(16px,3dvh,40px)]"><span class="text-[30px] text-gold">✳</span><span>{{ text.twelve }}</span></div>
      </section>
      <section class="relative min-w-0 mobile:mt-[6px] wide:flex wide:h-full wide:min-h-0 wide:flex-col wide:items-center wide:justify-center" :aria-label="text.player">
        <!-- 宽屏由行高决定方形尺寸，控制卡变高时场景自动收缩，状态行不会压到下方模块。 -->
        <div ref="scene" class="group/scene relative isolate mx-auto grid aspect-square grid-rows-[minmax(0,1fr)_auto_minmax(0,1fr)] w-[min(100%,570px)] place-items-center [--energy:0] mobile:max-w-[420px] wide:h-full wide:max-h-[740px] wide:min-h-0 wide:w-auto wide:max-w-full wide:flex-1" id="scene">
          <div class="pointer-events-none absolute inset-[15%] rounded-full bg-[radial-gradient(ellipse,#dfbd8122,transparent_68%)] opacity-[calc(var(--energy)*.9)] scale-[calc(.9_+_var(--energy)*.22)] motion-reduce:hidden" aria-hidden="true" />
          <div class="pointer-events-none absolute inset-[14%] rounded-full border border-gold opacity-[calc(var(--energy)*.26)] transition-opacity duration-300 scale-[calc(.97_+_var(--energy)*.15)] motion-reduce:hidden" aria-hidden="true" /><div class="pointer-events-none absolute inset-[7%] rounded-full border border-gold opacity-[calc(var(--energy)*.12)] transition-opacity duration-300 scale-[calc(.97_+_var(--energy)*.08)] motion-reduce:hidden" aria-hidden="true" />
          <div class="absolute inset-[3%] rounded-full border border-dashed border-[#b8a57528] transition-shadow duration-1000" /><div class="absolute inset-[10%] rounded-full border border-[#b8a5753b] transition-shadow duration-1000 group-data-[playing=true]:animate-turn before:absolute before:-top-[3px] before:left-1/2 before:h-1.5 before:w-1.5 before:rounded-full before:bg-gold before:shadow-[0_0_15px_#dfbd8177] before:content-[''] after:absolute after:bottom-[-3px] after:left-1/2 after:h-1.5 after:w-1.5 after:rounded-full after:bg-gold after:shadow-[0_0_15px_#dfbd8177] after:content-[''] mobile:before:hidden" /><div class="absolute inset-[17%] rounded-full border border-[#b8a57518] transition-shadow duration-1000 group-data-[playing=true]:opacity-[calc(.4_+_var(--energy)*.6)] group-data-[playing=true]:shadow-[0_0_35px_#dfbd810c,inset_0_0_35px_#dfbd810c] group-hover/scene:border-[#dfbd8155]" />
          <!-- 字间距在末字后也占位，把视觉文字推左半个字距；用相对位移回正到中心竖轴。 -->
          <div class="absolute left-1/2 top-[8%] -translate-x-1/2 bg-bg px-[15px] py-2 text-[11px] tracking-[5px] text-muted mobile:hidden"><span class="relative left-[2.5px]">{{ text.resonance }}</span></div><div class="absolute bottom-[8%] left-1/2 -translate-x-1/2 whitespace-nowrap bg-bg px-[15px] py-2 text-[11px] tracking-[3px] text-muted"><span class="relative left-[1.5px]">Pa · Sa · Sa · Sa</span></div>
          <svg class="absolute inset-0 h-full w-full opacity-[.36] transition-[opacity,filter] duration-700 group-data-[playing=true]:opacity-[calc(.42_+_var(--energy)*.55)] group-data-[playing=true]:drop-shadow-[0_0_5px_#dfbd8166] group-hover/scene:opacity-[.8]" viewBox="0 0 600 600" aria-hidden="true">
            <defs><linearGradient id="thread"><stop stop-color="#c5a46b" stop-opacity="0" /><stop offset=".5" stop-color="#e8c78c" /><stop offset="1" stop-color="#c5a46b" stop-opacity="0" /></linearGradient></defs>
            <g fill="none" stroke="url(#thread)">
              <path v-for="(shape, index) in STRING_SHAPES" :key="shape[0]" :ref="element => { if (element) strings[index] = element; }" class="origin-center [stroke-width:1] [vector-effect:non-scaling-stroke] group-data-[playing=true]:[stroke-width:calc(.8px_+_var(--energy)*.7px)]" :d="basePath(shape)" />
            </g>
            <g class="opacity-[.45]" fill="#dfbd81">
              <circle v-for="anchor in ANCHORS" :key="`${anchor.x}-${anchor.y}`" :cx="anchor.x" :cy="anchor.y" r="2" />
            </g>
          </svg>
          <!-- 主音、频率、圆钮、上下标签统一按几何中心落在场景竖轴；升号绝对定位，不参与字母居中。 -->
          <div class="row-start-2 z-[1] -translate-y-6 text-center mobile:-translate-y-14 group-data-[playing=true]:drop-shadow-[0_0_18px_#dfbd811a]"><span class="block text-[11px] tracking-[4px] text-muted short:hidden"><span class="relative left-[2px]">{{ text.tonic }}</span></span><div id="pitch" class="font-pitch text-[124px] leading-[1.35] text-gold [text-shadow:0_0_70px_#d7b57822] mobile:text-[clamp(78px,26vw,100px)] wide:text-[clamp(78px,13dvh,140px)] short:text-[clamp(68px,11dvh,90px)]"><span class="relative inline-block">{{ note[0] }}<span v-if="note.length > 1" class="absolute left-full top-[18.6%] ml-[2px] text-[37px]">♯</span></span></div><span id="frequency" class="text-[13px] tracking-[2px] text-muted [font-variant-numeric:tabular-nums]"><span class="relative left-[1px]">≈ {{ frequencyFor(selected).toFixed(1) }} Hz</span></span></div>
          <!-- 下方网格承接频率后的空间，并扣除底部音名标签区域，让圆钮居于两者之间。 -->
          <div class="row-start-3 z-[2] -mt-6 grid min-h-0 w-full self-stretch place-items-center pb-[calc(8%_+_2rem)] mobile:-mt-14">
            <button ref="playButton" id="play" class="grid h-16 w-16 place-items-center rounded-full border border-[#dfbd81aa] bg-[#243126] text-gold shadow-[0_0_calc(var(--energy)*26px)_#dfbd8133] transition-[background,box-shadow,transform] duration-[250ms] group-data-[playing=true]:border-gold group-data-[playing=true]:bg-gold group-data-[playing=true]:text-bg hover:scale-[1.09] hover:bg-gold hover:text-bg hover:shadow-[0_0_35px_#dfbd8133] short:h-11 short:w-11" :aria-label="active ? text.pause : text.play" :aria-pressed="active" :aria-busy="loading" @click="togglePlayback">
              <svg class="h-[25px] w-[25px] fill-current" :class="{ 'translate-x-[2px]': !active }" viewBox="0 0 24 24" aria-hidden="true"><path :d="active ? 'M7 5H10V19H7ZM14 5H17V19H14Z' : 'M7 5 17 12 7 19Z'" /></svg>
            </button>
          </div>
        </div>
        <!-- 左右装饰使用等宽槽位，让提示文字在暂停和播放时都保持中心不变。 -->
        <div class="-mt-1.5 grid min-h-5 w-full shrink-0 grid-cols-[24px_auto_24px] items-center justify-center gap-3 text-[13px] tracking-[2px] text-muted group-data-[playing=true]:text-[#c8cdbb] mobile:text-[12px]" role="status"><span id="status-dot" class="h-[5px] w-[5px] justify-self-center rounded-full bg-[#778179] group-data-[playing=true]:bg-gold" /><span id="status" class="relative left-[1px]">{{ status }}</span><span class="flex h-4 items-center gap-[3px] justify-self-center opacity-0 group-data-[playing=true]:opacity-100" aria-hidden="true"><i class="block h-2.5 w-[3px] bg-gold group-data-[playing=true]:h-3 group-data-[playing=true]:origin-center group-data-[playing=true]:scale-y-[calc(.2_+_var(--energy)*.8)] group-data-[playing=true]:transition-transform group-data-[playing=true]:duration-100" /><i class="block h-2.5 w-[3px] bg-gold group-data-[playing=true]:h-4 group-data-[playing=true]:origin-center group-data-[playing=true]:scale-y-[calc(.2_+_var(--energy)*.8)] group-data-[playing=true]:transition-transform group-data-[playing=true]:duration-100" /><i class="block h-2.5 w-[3px] bg-gold group-data-[playing=true]:h-[9px] group-data-[playing=true]:origin-center group-data-[playing=true]:scale-y-[calc(.2_+_var(--energy)*.8)] group-data-[playing=true]:transition-transform group-data-[playing=true]:duration-100" /><i class="block h-2.5 w-[3px] bg-gold group-data-[playing=true]:h-[13px] group-data-[playing=true]:origin-center group-data-[playing=true]:scale-y-[calc(.2_+_var(--energy)*.8)] group-data-[playing=true]:transition-transform group-data-[playing=true]:duration-100" /></span></div>
      </section>
      <section class="col-span-full mt-[34px] rounded-xl border border-line bg-surface px-[30px] pb-5 pt-[27px] mobile:mt-7 mobile:px-4 mobile:pb-4 mobile:pt-5 wide:mt-0 wide:min-w-0 wide:p-[clamp(16px,2.2dvh,28px)]" :aria-label="text.controls">
        <div class="wide:grid wide:grid-cols-[minmax(0,1.12fr)_minmax(0,1fr)] wide:items-start wide:gap-x-[clamp(24px,3.4vw,64px)]">
          <div class="min-w-0">
            <div class="mb-[19px] flex items-center justify-between mobile:mb-3 wide:mb-[clamp(12px,1.5dvh,20px)]"><h2 class="m-0 text-[14px] font-medium tracking-[2px]">{{ text.choose }}</h2><span class="text-[11px] tracking-[1px] text-muted">{{ text.sa }}</span></div>
            <div id="keys" class="grid grid-cols-12 gap-[9px] mobile:grid-cols-6 mobile:gap-2" role="group" :aria-label="text.keys">
              <button v-for="(key, index) in NOTES" :key="key" type="button" class="relative h-[63px] rounded-[7px] border border-[#3c463b] bg-[#1c251f] font-pitch text-[22px] text-[#bcc5bb] transition-[transform,background,border-color,box-shadow] duration-200 hover:-translate-y-1 hover:border-gold hover:bg-[#30372a] hover:text-gold aria-pressed:border-gold aria-pressed:bg-gold aria-pressed:text-[#182019] aria-pressed:shadow-[0_4px_25px_#dfbd8120] aria-pressed:after:absolute aria-pressed:after:bottom-[7px] aria-pressed:after:left-[calc(50%_-_2px)] aria-pressed:after:h-1 aria-pressed:after:w-1 aria-pressed:after:rounded-full aria-pressed:after:bg-[#3a412f] aria-pressed:after:content-[''] mobile:h-[52px] wide:h-[clamp(48px,5dvh,64px)]" :aria-label="t('key', { note: `${key}${droneOctave(index)}` })" :aria-pressed="index === selected" @click="selectKey(index)">{{ key[0] }}<small v-if="key.length > 1" class="ml-px align-super text-[13px]">♯</small>{{ droneOctave(index) }}</button>
            </div>
            <div class="mx-auto mb-[22px] mt-7 flex max-w-[440px] items-center gap-[18px] text-[12px] text-muted mobile:mx-0 mobile:mb-5 mobile:mt-[25px] wide:my-[clamp(14px,2dvh,24px)]">
              <label class="flex items-center gap-[9px] whitespace-nowrap" for="volume"><svg class="h-4 w-4 fill-none stroke-current [stroke-width:1.5]" viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4V5Zm4 3q5 4 0 8m3-11q8 7 0 14" /></svg>{{ text.volume }}</label>
              <input id="volume" class="volume-range" type="range" min="0" max="100" :value="volume" :style="{ '--fill': `${volume}%` }" :aria-label="text.volume" @input="onVolumeInput" />
              <output id="volume-value" class="w-10 [font-variant-numeric:tabular-nums]" for="volume">{{ volume }}%</output>
            </div>
          </div>
          <div class="mt-8 min-w-0 border-t border-line pt-6 wide:mt-0 wide:border-t-0 wide:pt-0">
            <div class="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <h2 class="m-0 text-[14px] font-medium tracking-[2px]">{{ text.synth }}</h2>
              <div class="flex flex-wrap items-center gap-2">
                <label class="flex items-center gap-1.5 text-[11px] tracking-[1px] text-muted">{{ text.range }}
                  <select class="rounded-[6px] border border-line bg-[#1c251f] px-2 py-1 text-[11px] tracking-normal text-ink" :value="synthRange" :aria-label="text.octave" @change="setSynthRange">
                    <option v-for="base in SYNTH_RANGES" :key="base" :value="base">{{ rangeLabel(base) }}</option>
                  </select>
                </label>
                <div class="flex rounded-full border border-line p-[3px]" role="group" :aria-label="text.mode">
                  <button type="button" class="rounded-full px-3 py-[5px] text-[11px] tracking-[1px] transition-colors" :class="synthMode === 'latch' ? 'bg-gold text-bg' : 'text-muted hover:text-ink'" :aria-pressed="synthMode === 'latch'" @click="setSynthMode('latch')">{{ text.latch }}</button>
                  <button type="button" class="rounded-full px-3 py-[5px] text-[11px] tracking-[1px] transition-colors" :class="synthMode === 'hold' ? 'bg-gold text-bg' : 'text-muted hover:text-ink'" :aria-pressed="synthMode === 'hold'" @click="setSynthMode('hold')">{{ text.hold }}</button>
                </div>
              </div>
            </div>
            <div class="touch-pan-x [scrollbar-color:#3c463b_transparent] [scrollbar-width:thin] mobile:overflow-x-auto">
              <div class="relative h-[74px] select-none mobile:h-[64px] mobile:min-w-[480px] wide:h-[clamp(56px,7.2dvh,84px)]" role="group" :aria-label="t('keyboard', { from: `C${synthRange}`, to: `C${synthRange + 2}` })">
                <div class="flex h-full">
                <button v-for="key in whiteKeys" :key="key.midi" type="button" class="relative h-full flex-1 rounded-b-[6px] border-r border-bg bg-[#e6dfce] text-[10px] tracking-[.5px] text-[#6b6455] transition-colors duration-100 last:border-r-0 hover:bg-[#f2ecdd] aria-pressed:bg-gold aria-pressed:text-[#3f3524]" :aria-label="t('synthNote', { note: labelFor(key.midi) })" :aria-pressed="activeNotes.has(key.midi)" @click="pressNote(key.midi)" @pointerdown="holdNote($event, key.midi)" @pointerup="releaseNote(key.midi)" @pointerleave="releaseNote(key.midi)" @pointercancel="releaseNote(key.midi)" @keydown.enter="keyHold($event, key.midi)" @keydown.space="keyHold($event, key.midi)" @keyup.enter="keyRelease($event, key.midi)" @keyup.space="keyRelease($event, key.midi)">
                  <span class="pointer-events-none absolute inset-x-0 bottom-1.5 text-center">{{ key.midi % 12 === 0 ? labelFor(key.midi) : '' }}</span>
                </button>
              </div>
              <button v-for="key in blackKeys" :key="key.midi" type="button" class="absolute top-0 z-[1] h-[60%] w-[4.1%] -translate-x-1/2 rounded-b-[4px] bg-[#1a231d] shadow-[0_3px_6px_#00000066] transition-colors duration-100 before:absolute before:-inset-x-1.5 before:inset-y-0 before:content-[''] hover:bg-[#2b382f] focus-visible:z-[2] aria-pressed:bg-gold" :style="{ left: `${key.left}%` }" :aria-label="t('synthNote', { note: labelFor(key.midi) })" :aria-pressed="activeNotes.has(key.midi)" @click="pressNote(key.midi)" @pointerdown="holdNote($event, key.midi)" @pointerup="releaseNote(key.midi)" @pointerleave="releaseNote(key.midi)" @pointercancel="releaseNote(key.midi)" @keydown.enter="keyHold($event, key.midi)" @keydown.space="keyHold($event, key.midi)" @keyup.enter="keyRelease($event, key.midi)" @keyup.space="keyRelease($event, key.midi)" />
              </div>
            </div>
            <div class="mt-3 flex items-center gap-3 text-[11px] text-muted">
              <label class="whitespace-nowrap" for="synth-volume">{{ text.synthVolume }}</label>
              <input id="synth-volume" class="volume-range flex-1" type="range" min="0" max="100" :value="synthVolume" :style="{ '--fill': `${synthVolume}%` }" :aria-label="text.synthVolume" @input="onSynthVolumeInput" />
              <output class="w-9 text-right [font-variant-numeric:tabular-nums]" for="synth-volume">{{ synthVolume }}%</output>
            </div>
            <p class="mt-2.5 text-[10px] leading-[1.7] tracking-[1px] text-muted">{{ t('shortcuts', { note: topNote }) }}</p>
          </div>
        </div>
        <div class="mt-6 flex flex-wrap justify-between gap-x-4 gap-y-2 border-t border-line pt-4 text-[11px] tracking-[1px] text-muted wide:mt-[clamp(12px,1.6dvh,20px)] wide:pt-3"><span>{{ text.recording }}</span><span>{{ text.headphones }}</span></div>
      </section>
    </main>
    <footer class="relative mx-[6%] flex justify-between border-t border-line pb-7 pt-[23px] text-[12px] tracking-[2px] text-muted mobile:text-[11px] wide:mx-auto wide:min-h-[48px] wide:w-[calc(100%_-_2*var(--gutter))] wide:max-w-[calc(1800px_-_2*var(--gutter))] wide:items-center wide:py-4"><span>{{ text.footer }}</span><span class="footer-right mobile:hidden">{{ text.footerRight }} <span class="ml-[18px] text-gold">✦</span></span></footer>
    <aside id="credits" :hidden="!infoOpen" class="fixed right-[6%] top-[90px] z-10 max-w-[380px] rounded-xl border border-[#6d775b] bg-[#202a23] p-6 text-[14px] leading-[1.9] shadow-[0_20px_90px_#0008] mobile:left-[6%] mobile:max-w-none" aria-labelledby="credits-title">
      <div class="flex items-center justify-between"><h2 id="credits-title" class="m-0 text-[18px]">{{ text.about }}</h2><button class="border-0 bg-transparent text-[28px] text-ink" :aria-label="text.close" @click="infoOpen = false">×</button></div>
      <p class="my-[1em] text-[#c1c9bf]">{{ text.aboutRecording }}</p>
      <p class="my-[1em] text-[#c1c9bf]">{{ text.aboutSynth }}</p>
    </aside>
  </div>
</template>
