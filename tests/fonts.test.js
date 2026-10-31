import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { messages } from '../src/i18n.js';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url));

test('发布字体使用 WOFF2 子集且大小低于原始字体的十分之一', () => {
  const font = read('public/fonts/tanpura-maple.woff2');
  const manifest = JSON.parse(read('public/fonts/subset.json').toString());
  assert.equal(font.subarray(0, 4).toString(), 'wOF2');
  assert.equal(font.length, manifest.subsetBytes);
  assert.ok(manifest.sourceBytes > 0);
  assert.ok(font.length < manifest.sourceBytes * .1);
});

test('字体子集覆盖中英文文案、动态音名和界面符号', () => {
  const manifest = JSON.parse(read('public/fonts/subset.json').toString());
  const characters = new Set(manifest.characters);
  // ASCII 保留动态数字、音名与快捷键，文案新增字符时需重新生成子集。
  const required = [
    ...Object.values(messages).flatMap(dictionary => Object.values(dictionary)).join(''),
    ...Array.from({ length: 95 }, (_, index) => String.fromCodePoint(0x20 + index)),
    ...'♯≈中文English',
  ];
  for (const character of required) {
    if (/\s/u.test(character)) continue;
    assert.ok(characters.has(character), `字体子集缺少 ${character}，请重新生成`);
  }
});

test('页面预加载本地字体并移除第三方字体请求', () => {
  const html = read('index.html').toString();
  const css = read('src/style.css').toString();
  assert.doesNotMatch(html, /fonts\.(?:googleapis|gstatic)\.com/);
  assert.match(html, /<link\b(?=[^>]*\brel=["']preload["'])(?=[^>]*\bhref=["']\/fonts\/tanpura-maple\.woff2["'])(?=[^>]*\bas=["']font["'])(?=[^>]*\bcrossorigin)[^>]*>/);
  assert.match(css, /@font-face\s*\{[^}]*font-display:\s*swap\s*;/);
  assert.match(css, /url\(["']?\/fonts\/tanpura-maple\.woff2["']?\)/);
});
