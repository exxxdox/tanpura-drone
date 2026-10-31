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
  <div class="app-shell" :class="{ playing }">
    <div class="grain" aria-hidden="true" />
    <header>
      <a class="brand" href="./" aria-label="Tanpura 首页"><span class="brand-mark">≋</span> tanpura<span class="brand-dot">.</span></a>
      <span class="header-note">为专注而鸣</span>
      <button id="sound-info" class="quiet" :aria-expanded="infoOpen" aria-controls="credits" @click="infoOpen = !infoOpen">音源 ↗</button>
    </header>
    <main>
      <section class="intro">
        <div class="eyebrow"><span /> 你的随身印度持续音</div>
        <h1>一弦，<br />进入心流。</h1>
        <p>让声音延展。<br />找到你的调，回到此刻。</p>
        <div class="intro-bottom"><span class="tiny-orbit">✳</span><span>十二个调 · 无限共鸣</span></div>
      </section>
      <section class="instrument" aria-label="Tanpura 播放器">
        <div ref="scene" class="orbit-scene" id="scene">
          <div class="resonance-halo" aria-hidden="true" />
          <div class="resonance-wave wave-one" aria-hidden="true" /><div class="resonance-wave wave-two" aria-hidden="true" />
          <div class="orbit orbit-outer" /><div class="orbit orbit-middle" /><div class="orbit orbit-inner" />
          <div class="orbit-label top">共 鸣</div><div class="orbit-label bottom">Pa · Sa · Sa · Sa</div>
          <svg class="strings" viewBox="0 0 600 600" aria-hidden="true">
            <defs><linearGradient id="thread"><stop stop-color="#c5a46b" stop-opacity="0" /><stop offset=".5" stop-color="#e8c78c" /><stop offset="1" stop-color="#c5a46b" stop-opacity="0" /></linearGradient></defs>
            <g fill="none" stroke="url(#thread)">
              <path v-for="(shape, index) in STRING_SHAPES" :key="shape[0]" :ref="element => { if (element) strings[index] = element; }" :d="basePath(shape)" />
            </g>
            <g class="string-anchors" fill="#dfbd81">
              <circle v-for="anchor in ANCHORS" :key="`${anchor.x}-${anchor.y}`" :cx="anchor.x" :cy="anchor.y" r="2" />
            </g>
          </svg>
          <div class="pitch-display"><span class="pitch-kicker">当前主音</span><div id="pitch">{{ note[0] }}<span>{{ note.length > 1 ? '♯' : '♮' }}</span></div><span id="frequency">≈ {{ frequencyFor(selected).toFixed(1) }} Hz</span></div>
          <button ref="playButton" id="play" class="play" :aria-label="active ? '暂停播放' : '开始播放'" :aria-pressed="active" :aria-busy="loading" @click="togglePlayback">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path :d="active ? 'M7 5H10V19H7ZM14 5H17V19H14Z' : 'M9 5 19 12 9 19Z'" /></svg>
          </button>
        </div>
        <div class="play-state" role="status"><span id="status-dot" /><span id="status">{{ status }}</span><span class="equalizer" aria-hidden="true"><i /><i /><i /><i /></span></div>
      </section>
      <section class="controls" aria-label="声音控制">
        <div class="control-head"><h2>选择你的调</h2><span>主音 / Sa</span></div>
        <div class="keys" id="keys" role="group" aria-label="十二个调">
          <button v-for="(key, index) in NOTES" :key="key" type="button" class="key" :aria-label="`${key} 调`" :aria-pressed="index === selected" @click="selectKey(index)">{{ key[0] }}<small v-if="key.length > 1">♯</small></button>
        </div>
        <div class="volume">
          <label for="volume"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4V5Zm4 3q5 4 0 8m3-11q8 7 0 14" /></svg>音量</label>
          <input id="volume" type="range" min="0" max="100" :value="volume" aria-label="音量" @input="onVolumeInput" />
          <output id="volume-value" for="volume">{{ volume }}%</output>
        </div>
        <div class="control-foot"><span>25 分钟完整录音 · 循环播放</span><span>建议佩戴耳机</span></div>
      </section>
    </main>
    <footer><span>留一点空间，给声音。</span><span class="footer-right">拨弦之后，万物渐静 <span>✦</span></span></footer>
    <aside id="credits" :hidden="!infoOpen" aria-labelledby="credits-title">
      <div class="credits-top"><h2 id="credits-title">关于音源</h2><button aria-label="关闭音源说明" @click="infoOpen = false">×</button></div>
      <p>十二个调各自播放完整约 25 分钟录音，原速播放，循环共鸣。</p>
      <p>首次播放需要点击按钮。切换调性时，声音平滑过渡。</p>
    </aside>
  </div>
</template>
