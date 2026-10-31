import React, { useEffect, useRef, useState } from 'react';
import { Drone, NOTES, frequencyFor } from './audio-engine.js';
const STRING_SHAPES = [[230, -38], [275, -16], [325, 16], [370, 38]];

export default function App() {
  const drone = useRef(null);
  const playButton = useRef(null);
  const scene = useRef(null);
  const strings = useRef([]);
  const request = useRef(0);
  const intent = useRef(false);
  const [selected, setSelected] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [volume, setVolume] = useState(65);
  const [infoOpen, setInfoOpen] = useState(false);

  useEffect(() => {
    // 音频资源跟随组件生命周期，StrictMode 重挂载也不会复用已关闭的 Context。
    const engine = new Drone();
    drone.current = engine;
    const stop = () => {
      ++request.current;
      intent.current = false;
      engine.stop();
      setPlaying(false);
      setLoading(false);
    };
    const onKey = event => {
      if (event.key === 'Escape') setInfoOpen(false);
      if (event.code === 'Space' && [document.body, document.documentElement].includes(event.target)) {
        event.preventDefault();
        playButton.current?.click();
      }
    };
    window.addEventListener('pagehide', stop);
    document.addEventListener('keydown', onKey);
    return () => {
      ++request.current;
      intent.current = false;
      engine.dispose();
      window.removeEventListener('pagehide', stop);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame;
    let energy = 0;
    const reset = () => {
      scene.current?.style.setProperty('--energy', '0');
      scene.current?.parentElement.style.setProperty('--energy', '0');
      strings.current.forEach((path, index) => {
        const [x, bow] = STRING_SHAPES[index];
        path?.setAttribute('d', `M${x} 72 C${x + bow} 180 ${x + bow} 420 ${x} 528`);
      });
    };
    const draw = time => {
      // 直接更新 SVG 与 CSS 变量，不让逐帧音量采样触发 React 重渲染。
      const level = Math.min(1, (drone.current?.getEnergy() ?? 0) * 2.8);
      energy += (level - energy) * .14;
      scene.current?.style.setProperty('--energy', energy.toFixed(3));
      scene.current?.parentElement.style.setProperty('--energy', energy.toFixed(3));
      strings.current.forEach((path, index) => {
        const [x, bow] = STRING_SHAPES[index];
        const vibration = Math.sin(time * (.014 + index * .002) + index * 1.7) * energy * (13 + index * 3);
        path?.setAttribute('d', `M${x} 72 C${x + bow + vibration} 180 ${x + bow - vibration} 420 ${x} 528`);
      });
      frame = requestAnimationFrame(draw);
    };
    const update = () => {
      cancelAnimationFrame(frame);
      reset();
      // 遵循系统减少动态效果设置，暂停时也完全停止逐帧采样。
      if (playing && !motion.matches) frame = requestAnimationFrame(draw);
    };
    update();
    motion.addEventListener('change', update);
    return () => { cancelAnimationFrame(frame); motion.removeEventListener('change', update); reset(); };
  }, [playing]);

  async function play(index) {
    const current = ++request.current;
    intent.current = true;
    setLoading(true);
    setError('');
    try {
      const started = await drone.current.play(index);
      // 暂停或下一次选调拥有最终状态，晚返回的下载不能把界面改回播放。
      if (current !== request.current || !started) return;
      setPlaying(true);
      setLoading(false);
    } catch {
      if (current !== request.current) return;
      drone.current.stop();
      intent.current = false;
      setPlaying(false);
      setLoading(false);
      setError('音源加载失败，请检查网络后重试');
    }
  }

  function togglePlayback() {
    if (!intent.current) { void play(selected); return; }
    ++request.current;
    intent.current = false;
    drone.current.stop();
    setPlaying(false);
    setLoading(false);
    setError('');
  }

  function selectKey(index) {
    if (index === selected) return;
    setSelected(index);
    setError('');
    if (intent.current) void play(index);
  }

  const note = NOTES[selected];
  const active = playing || loading;
  const status = error || (loading ? `正在加载 ${note} 调…` : playing ? `${note} 调 · 持续共鸣中` : '轻触播放，开启共鸣');

  return <div className={`app-shell${playing ? ' playing' : ''}`}>
    <div className="grain" aria-hidden="true" />
    <header>
      <a className="brand" href="./" aria-label="Tanpura 首页"><span className="brand-mark">≋</span> tanpura<span className="brand-dot">.</span></a>
      <span className="header-note">为专注而鸣</span>
      <button id="sound-info" className="quiet" aria-expanded={infoOpen} aria-controls="credits" onClick={() => setInfoOpen(!infoOpen)}>音源 ↗</button>
    </header>
    <main>
      <section className="intro">
        <div className="eyebrow"><span /> 你的随身印度持续音</div>
        <h1>一弦，<br />进入心流。</h1>
        <p>让声音延展。<br />找到你的调，回到此刻。</p>
        <div className="intro-bottom"><span className="tiny-orbit">✳</span><span>十二个调 · 无限共鸣</span></div>
      </section>
      <section className="instrument" aria-label="Tanpura 播放器">
        <div ref={scene} className="orbit-scene" id="scene">
          <div className="resonance-halo" aria-hidden="true" />
          <div className="resonance-wave wave-one" aria-hidden="true" /><div className="resonance-wave wave-two" aria-hidden="true" />
          <div className="orbit orbit-outer" /><div className="orbit orbit-middle" /><div className="orbit orbit-inner" />
          <div className="orbit-label top">共 鸣</div><div className="orbit-label bottom">Pa · Sa · Sa · Sa</div>
          <svg className="strings" viewBox="0 0 600 600" aria-hidden="true">
            <defs><linearGradient id="thread"><stop stopColor="#c5a46b" stopOpacity="0" /><stop offset=".5" stopColor="#e8c78c" /><stop offset="1" stopColor="#c5a46b" stopOpacity="0" /></linearGradient></defs>
            <g fill="none" stroke="url(#thread)">{STRING_SHAPES.map(([x, bow], index) => <path ref={element => { strings.current[index] = element; }} key={x} d={`M${x} 72 C${x + bow} 180 ${x + bow} 420 ${x} 528`} />)}</g>
            <g className="string-anchors" fill="#dfbd81">{STRING_SHAPES.flatMap(([x]) => [72, 528].map(y => <circle key={`${x}-${y}`} cx={x} cy={y} r="2" />))}</g>
          </svg>
          <div className="pitch-display"><span className="pitch-kicker">当前主音</span><div id="pitch">{note[0]}<span>{note.length > 1 ? '♯' : '♮'}</span></div><span id="frequency">≈ {frequencyFor(selected).toFixed(1)} Hz</span></div>
          <button ref={playButton} id="play" className="play" aria-label={active ? '暂停播放' : '开始播放'} aria-pressed={active} aria-busy={loading} onClick={togglePlayback}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d={active ? 'M7 5H10V19H7ZM14 5H17V19H14Z' : 'M9 5 19 12 9 19Z'} /></svg>
          </button>
        </div>
        <div className="play-state" role="status"><span id="status-dot" /><span id="status">{status}</span><span className="equalizer" aria-hidden="true"><i /><i /><i /><i /></span></div>
      </section>
      <section className="controls" aria-label="声音控制">
        <div className="control-head"><h2>选择你的调</h2><span>主音 / Sa</span></div>
        <div className="keys" id="keys" role="group" aria-label="十二个调">{NOTES.map((key, index) => <button type="button" key={key} className="key" aria-label={`${key} 调`} aria-pressed={index === selected} onClick={() => selectKey(index)}>{key[0]}{key.length > 1 && <small>♯</small>}</button>)}</div>
        <div className="volume">
          <label htmlFor="volume"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4V5Zm4 3q5 4 0 8m3-11q8 7 0 14" /></svg>音量</label>
          <input id="volume" type="range" min="0" max="100" value={volume} aria-label="音量" onChange={event => { const value = Number(event.target.value); setVolume(value); drone.current.setVolume(value / 100); }} />
          <output id="volume-value" htmlFor="volume">{volume}%</output>
        </div>
        <div className="control-foot"><span>25 分钟完整录音 · 循环播放</span><span>建议佩戴耳机</span></div>
      </section>
    </main>
    <footer><span>留一点空间，给声音。</span><span className="footer-right">拨弦之后，万物渐静 <span>✦</span></span></footer>
    <aside id="credits" hidden={!infoOpen} aria-labelledby="credits-title">
      <div className="credits-top"><h2 id="credits-title">关于音源</h2><button aria-label="关闭音源说明" onClick={() => setInfoOpen(false)}>×</button></div>
      <p>十二个调各自播放完整约 25 分钟录音，原速播放，循环共鸣。</p>
      <p>首次播放需要点击按钮。切换调性时，声音平滑过渡。</p>
    </aside>
  </div>;
}
