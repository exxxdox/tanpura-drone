<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { Drone, NOTES, frequencyFor } from './audio-engine.js';

const STRING_SHAPES = [[230, -38], [275, -16], [325, 16], [370, 38]];
const ANCHORS = STRING_SHAPES.flatMap(([x]) => [72, 528].map(y => ({ x, y })));
const basePath = ([x, bow]) => `M${x} 72 C${x + bow} 180 ${x + bow} 420 ${x} 528`;

let engine;
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

const note = computed(() => NOTES[selected.value]);
const active = computed(() => playing.value || loading.value);
const status = computed(() => error.value
  || (loading.value ? `正在加载 ${note.value} 调…` : playing.value ? `${note.value} 调 · 持续共鸣中` : '轻触播放，开启共鸣'));

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
    error.value = '音源加载失败，请检查网络后重试';
  }
}

function togglePlayback() {
  if (!intent) { play(selected.value); return; }
  intent = false;
  engine.stop();
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

function onVolumeInput(event) {
  const value = Number(event.target.value);
  volume.value = value;
  engine.setVolume(value / 100);
}

watch(playing, syncMotion);

onMounted(() => {
  engine = new Drone();
  motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  window.addEventListener('pagehide', stop);
  document.addEventListener('keydown', onKey);
  motion.addEventListener('change', syncMotion);
  syncMotion();
});

onUnmounted(() => {
  intent = false;
  engine.dispose();
  window.removeEventListener('pagehide', stop);
  document.removeEventListener('keydown', onKey);
  motion?.removeEventListener('change', syncMotion);
  cancelAnimationFrame(frame);
  resetStrings();
});
</script>

<template>
  <div class="group relative min-h-dvh bg-bg text-ink wide:grid wide:h-dvh wide:grid-rows-[auto_minmax(0,1fr)_auto] wide:[--gutter:clamp(32px,5vw,96px)]" :data-playing="playing">
    <div class="grain" aria-hidden="true" />
    <header class="relative flex h-[116px] items-center gap-[25px] px-[6%] mobile:h-[85px] wide:mx-auto wide:h-[clamp(72px,8dvh,112px)] wide:w-full wide:max-w-[1800px] wide:px-[var(--gutter)]">
      <a class="text-[30px] font-semibold tracking-[-1.5px] text-ink no-underline" href="./" aria-label="Tanpura 首页"><span class="mr-3 inline-block align-[-3px] text-[38px] text-gold">≋</span> tanpura<span class="text-gold">.</span></a>
      <span class="border-l border-line pl-[25px] text-[13px] tracking-[3px] text-muted mobile:hidden">为专注而鸣</span>
      <button id="sound-info" class="ml-auto rounded-[30px] border border-line bg-transparent px-[18px] py-[10px] text-[13px] text-muted transition-colors hover:border-gold hover:text-gold" :aria-expanded="infoOpen" aria-controls="credits" @click="infoOpen = !infoOpen">音源 ↗</button>
    </header>
    <main class="relative mx-auto grid max-w-[1440px] grid-cols-[1fr_1.6fr] items-center px-[6%] pb-[62px] pt-5 mobile:grid-cols-1 mobile:pt-[22px] wide:w-full wide:max-w-[1800px] wide:min-h-0 wide:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] wide:grid-rows-[minmax(0,1fr)_auto] wide:gap-y-[clamp(16px,2.4dvh,32px)] wide:px-[var(--gutter)] wide:pb-[clamp(18px,3dvh,40px)] wide:pt-0">
      <section class="min-w-0 self-center pt-[5px] mobile:z-[2]">
        <div class="flex items-center gap-[10px] text-[12px] tracking-[3px] text-gold mobile:text-[11px]"><span class="h-[5px] w-[5px] rounded-full bg-gold" /> 你的随身印度持续音</div>
        <h1 class="mb-[22px] mt-6 font-serif text-[clamp(48px,5.8vw,84px)] font-normal leading-[1.5] tracking-[4px] mobile:my-[15px] mobile:text-[clamp(30px,8.5vw,36px)] mobile:leading-[1.4] mobile:tracking-[2px] wide:my-[clamp(16px,2dvh,28px)] wide:text-[clamp(44px,min(4.8vw,7.4dvh),90px)] wide:leading-[1.4]">一弦，<br class="mobile:hidden" />进入心流。</h1>
        <p class="my-[1em] text-[15px] leading-[2.1] tracking-[2px] text-muted mobile:m-0 mobile:text-[13px] mobile:leading-[1.8] short:text-[14px]">让声音延展。<br class="mobile:hidden" />找到你的调，回到此刻。</p>
        <div class="mt-[45px] flex items-center gap-[14px] text-[12px] tracking-[2px] text-muted mobile:hidden wide:mt-[clamp(16px,3dvh,40px)]"><span class="text-[30px] text-gold">✳</span><span>十二个调 · 无限共鸣</span></div>
      </section>
      <section class="relative min-w-0 mobile:mt-[6px]" aria-label="Tanpura 播放器">
        <div ref="scene" class="group/scene relative isolate mx-auto grid aspect-square w-[min(100%,570px)] place-items-center [--energy:0] mobile:max-w-[420px] wide:w-[min(100%,740px,calc(100dvh_-_440px))]" id="scene">
          <div class="pointer-events-none absolute inset-[15%] rounded-full bg-[radial-gradient(ellipse,#dfbd8122,transparent_68%)] opacity-[calc(var(--energy)*.9)] scale-[calc(.9_+_var(--energy)*.22)] motion-reduce:hidden" aria-hidden="true" />
          <div class="pointer-events-none absolute inset-[14%] rounded-full border border-gold opacity-[calc(var(--energy)*.26)] transition-opacity duration-300 scale-[calc(.97_+_var(--energy)*.15)] motion-reduce:hidden" aria-hidden="true" /><div class="pointer-events-none absolute inset-[7%] rounded-full border border-gold opacity-[calc(var(--energy)*.12)] transition-opacity duration-300 scale-[calc(.97_+_var(--energy)*.08)] motion-reduce:hidden" aria-hidden="true" />
          <div class="absolute inset-[3%] rounded-full border border-dashed border-[#b8a57528] transition-shadow duration-1000" /><div class="absolute inset-[10%] rounded-full border border-[#b8a5753b] transition-shadow duration-1000 group-data-[playing=true]:animate-turn before:absolute before:-top-[3px] before:left-1/2 before:h-1.5 before:w-1.5 before:rounded-full before:bg-gold before:shadow-[0_0_15px_#dfbd8177] before:content-[''] after:absolute after:bottom-[-3px] after:left-1/2 after:h-1.5 after:w-1.5 after:rounded-full after:bg-gold after:shadow-[0_0_15px_#dfbd8177] after:content-[''] mobile:before:hidden" /><div class="absolute inset-[17%] rounded-full border border-[#b8a57518] transition-shadow duration-1000 group-data-[playing=true]:opacity-[calc(.4_+_var(--energy)*.6)] group-data-[playing=true]:shadow-[0_0_35px_#dfbd810c,inset_0_0_35px_#dfbd810c] group-hover/scene:border-[#dfbd8155]" />
          <div class="absolute top-[8%] bg-bg px-[15px] py-2 text-[11px] tracking-[5px] text-muted mobile:hidden">共 鸣</div><div class="absolute bottom-[8%] bg-bg px-[15px] py-2 text-[11px] tracking-[3px] text-muted">Pa · Sa · Sa · Sa</div>
          <svg class="absolute inset-0 h-full w-full opacity-[.36] transition-[opacity,filter] duration-700 group-data-[playing=true]:opacity-[calc(.42_+_var(--energy)*.55)] group-data-[playing=true]:drop-shadow-[0_0_5px_#dfbd8166] group-hover/scene:opacity-[.8]" viewBox="0 0 600 600" aria-hidden="true">
            <defs><linearGradient id="thread"><stop stop-color="#c5a46b" stop-opacity="0" /><stop offset=".5" stop-color="#e8c78c" /><stop offset="1" stop-color="#c5a46b" stop-opacity="0" /></linearGradient></defs>
            <g fill="none" stroke="url(#thread)">
              <path v-for="(shape, index) in STRING_SHAPES" :key="shape[0]" :ref="element => { if (element) strings[index] = element; }" class="origin-center [stroke-width:1] [vector-effect:non-scaling-stroke] group-data-[playing=true]:[stroke-width:calc(.8px_+_var(--energy)*.7px)]" :d="basePath(shape)" />
            </g>
            <g class="opacity-[.45]" fill="#dfbd81">
              <circle v-for="anchor in ANCHORS" :key="`${anchor.x}-${anchor.y}`" :cx="anchor.x" :cy="anchor.y" r="2" />
            </g>
          </svg>
          <div class="z-[1] -translate-y-6 text-center mobile:-translate-y-14 group-data-[playing=true]:drop-shadow-[0_0_18px_#dfbd811a]"><span class="block text-[11px] tracking-[4px] text-muted short:hidden">当前主音</span><div id="pitch" class="font-pitch text-[124px] leading-[1.35] text-gold [text-shadow:0_0_70px_#d7b57822] mobile:text-[clamp(78px,26vw,100px)] wide:text-[clamp(78px,13dvh,140px)] short:text-[clamp(68px,11dvh,90px)]">{{ note[0] }}<span v-if="note.length > 1" class="ml-[2px] align-super text-[37px]">♯</span></div><span id="frequency" class="text-[13px] tracking-[2px] text-muted [font-variant-numeric:tabular-nums]">≈ {{ frequencyFor(selected).toFixed(1) }} Hz</span></div>
          <button ref="playButton" id="play" class="absolute bottom-[18%] left-[calc(50%_-_32px)] z-[2] grid h-16 w-16 place-items-center rounded-full border border-[#dfbd81aa] bg-[#243126] text-gold shadow-[0_0_calc(var(--energy)*26px)_#dfbd8133] transition-[background,box-shadow,transform] duration-[250ms] group-data-[playing=true]:border-gold group-data-[playing=true]:bg-gold group-data-[playing=true]:text-bg hover:scale-[1.09] hover:bg-gold hover:text-bg hover:shadow-[0_0_35px_#dfbd8133] mobile:bottom-[19%] short:h-11 short:w-11 short:left-[calc(50%_-_22px)]" :aria-label="active ? '暂停播放' : '开始播放'" :aria-pressed="active" :aria-busy="loading" @click="togglePlayback">
            <svg class="h-[25px] w-[25px] fill-current" viewBox="0 0 24 24" aria-hidden="true"><path :d="active ? 'M7 5H10V19H7ZM14 5H17V19H14Z' : 'M9 5 19 12 9 19Z'" /></svg>
          </button>
        </div>
        <div class="-mt-1.5 flex min-h-5 items-center justify-center gap-3 text-[13px] tracking-[2px] text-muted group-data-[playing=true]:text-[#c8cdbb] mobile:text-[12px]" role="status"><span id="status-dot" class="h-[5px] w-[5px] rounded-full bg-[#778179] group-data-[playing=true]:bg-gold" /><span id="status">{{ status }}</span><span class="flex h-4 items-center gap-[3px] opacity-0 group-data-[playing=true]:opacity-100" aria-hidden="true"><i class="block h-2.5 w-[3px] bg-gold group-data-[playing=true]:h-3 group-data-[playing=true]:origin-center group-data-[playing=true]:scale-y-[calc(.2_+_var(--energy)*.8)] group-data-[playing=true]:transition-transform group-data-[playing=true]:duration-100" /><i class="block h-2.5 w-[3px] bg-gold group-data-[playing=true]:h-4 group-data-[playing=true]:origin-center group-data-[playing=true]:scale-y-[calc(.2_+_var(--energy)*.8)] group-data-[playing=true]:transition-transform group-data-[playing=true]:duration-100" /><i class="block h-2.5 w-[3px] bg-gold group-data-[playing=true]:h-[9px] group-data-[playing=true]:origin-center group-data-[playing=true]:scale-y-[calc(.2_+_var(--energy)*.8)] group-data-[playing=true]:transition-transform group-data-[playing=true]:duration-100" /><i class="block h-2.5 w-[3px] bg-gold group-data-[playing=true]:h-[13px] group-data-[playing=true]:origin-center group-data-[playing=true]:scale-y-[calc(.2_+_var(--energy)*.8)] group-data-[playing=true]:transition-transform group-data-[playing=true]:duration-100" /></span></div>
      </section>
      <section class="col-span-full mt-[34px] rounded-xl border border-line bg-surface px-[30px] pb-5 pt-[27px] mobile:mt-7 mobile:px-4 mobile:pb-4 mobile:pt-5 wide:mt-0 wide:min-w-0 wide:p-[clamp(16px,2.2dvh,28px)]" aria-label="声音控制">
        <div class="mb-[19px] flex items-center justify-between mobile:mb-3 wide:mb-[clamp(12px,1.5dvh,20px)]"><h2 class="m-0 text-[14px] font-medium tracking-[2px]">选择你的调</h2><span class="text-[11px] tracking-[1px] text-muted">主音 / Sa</span></div>
        <div id="keys" class="grid grid-cols-12 gap-[9px] mobile:grid-cols-6 mobile:gap-2" role="group" aria-label="十二个调">
          <button v-for="(key, index) in NOTES" :key="key" type="button" class="relative h-[63px] rounded-[7px] border border-[#3c463b] bg-[#1c251f] font-pitch text-[22px] text-[#bcc5bb] transition-[transform,background,border-color,box-shadow] duration-200 hover:-translate-y-1 hover:border-gold hover:bg-[#30372a] hover:text-gold aria-pressed:border-gold aria-pressed:bg-gold aria-pressed:text-[#182019] aria-pressed:shadow-[0_4px_25px_#dfbd8120] aria-pressed:after:absolute aria-pressed:after:bottom-[7px] aria-pressed:after:left-[calc(50%_-_2px)] aria-pressed:after:h-1 aria-pressed:after:w-1 aria-pressed:after:rounded-full aria-pressed:after:bg-[#3a412f] aria-pressed:after:content-[''] mobile:h-[52px] wide:h-[clamp(48px,5dvh,64px)]" :aria-label="`${key} 调`" :aria-pressed="index === selected" @click="selectKey(index)">{{ key[0] }}<small v-if="key.length > 1" class="ml-px align-super text-[13px]">♯</small></button>
        </div>
        <div class="mx-auto mb-[22px] mt-7 flex max-w-[440px] items-center gap-[18px] text-[12px] text-muted mobile:mx-0 mobile:mb-5 mobile:mt-[25px] wide:my-[clamp(14px,2dvh,24px)]">
          <label class="flex items-center gap-[9px] whitespace-nowrap" for="volume"><svg class="h-4 w-4 fill-none stroke-current [stroke-width:1.5]" viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4V5Zm4 3q5 4 0 8m3-11q8 7 0 14" /></svg>音量</label>
          <input id="volume" class="volume-range" type="range" min="0" max="100" :value="volume" :style="{ '--fill': `${volume}%` }" aria-label="音量" @input="onVolumeInput" />
          <output id="volume-value" class="w-10 [font-variant-numeric:tabular-nums]" for="volume">{{ volume }}%</output>
        </div>
        <div class="flex justify-between border-t border-line pt-4 text-[11px] tracking-[1px] text-muted wide:pt-3"><span>25 分钟完整录音 · 循环播放</span><span>建议佩戴耳机</span></div>
      </section>
    </main>
    <footer class="relative mx-[6%] flex justify-between border-t border-line pb-7 pt-[23px] text-[12px] tracking-[2px] text-muted mobile:text-[11px] wide:mx-auto wide:min-h-[48px] wide:w-[calc(100%_-_2*var(--gutter))] wide:max-w-[calc(1800px_-_2*var(--gutter))] wide:items-center wide:py-4"><span>留一点空间，给声音。</span><span class="footer-right mobile:hidden">拨弦之后，万物渐静 <span class="ml-[18px] text-gold">✦</span></span></footer>
    <aside id="credits" :hidden="!infoOpen" class="fixed right-[6%] top-[90px] z-10 max-w-[380px] rounded-xl border border-[#6d775b] bg-[#202a23] p-6 text-[14px] leading-[1.9] shadow-[0_20px_90px_#0008] mobile:left-[6%] mobile:max-w-none" aria-labelledby="credits-title">
      <div class="flex items-center justify-between"><h2 id="credits-title" class="m-0 text-[18px]">关于音源</h2><button class="border-0 bg-transparent text-[28px] text-ink" aria-label="关闭音源说明" @click="infoOpen = false">×</button></div>
      <p class="my-[1em] text-[#c1c9bf]">十二个调各自播放完整约 25 分钟录音，原速播放，循环共鸣。首次播放需要点击按钮。切换调性时，声音平滑过渡。</p>
    </aside>
  </div>
</template>
