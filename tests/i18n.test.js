import test from 'node:test';
import assert from 'node:assert/strict';
import { messages, readLocale, resolveLocale, saveLocale } from '../src/i18n.js';

test('浏览器首选中文使用中文，其余语言回退英文', () => {
  for (const language of ['zh', 'zh-CN', 'zh-TW', 'ZH-hk']) {
    assert.equal(resolveLocale(null, [language]), 'zh');
  }
  for (const languages of [[], ['en-US'], ['fr-FR', 'zh-CN'], ['zhx']]) {
    assert.equal(resolveLocale(null, languages), 'en');
  }
});

test('已保存的有效手动选择优先于浏览器语言', () => {
  assert.equal(resolveLocale('en', ['zh-CN']), 'en');
  assert.equal(resolveLocale('zh', ['en-US']), 'zh');
  assert.equal(resolveLocale('fr', ['zh-CN']), 'zh');
  assert.equal(resolveLocale('__proto__', ['en-US']), 'en');
});

test('读取偏好支持浏览器语言列表及单语言回退', () => {
  const storage = { getItem(key) {
    assert.equal(key, 'tanpura-language');
    return null;
  } };
  assert.equal(readLocale(storage, { languages: ['zh-TW', 'en-US'], language: 'en-US' }), 'zh');
  assert.equal(readLocale(storage, { languages: [], language: 'zh-CN' }), 'zh');
  assert.equal(readLocale(storage, { language: 'en-US' }), 'en');
  assert.equal(readLocale({ getItem: () => 'en' }, { languages: ['zh-CN'] }), 'en');
});

test('浏览器禁止存储时仍能识别语言和切换', () => {
  const storage = {
    getItem() { throw new Error('Storage disabled'); },
    setItem() { throw new Error('Storage disabled'); },
  };
  assert.equal(readLocale(storage, { languages: ['zh-CN'] }), 'zh');
  assert.doesNotThrow(() => saveLocale(storage, 'en'));
});

test('只持久化支持的语言，刷新后保留手动选择', () => {
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  saveLocale(storage, 'en');
  assert.equal(values.get('tanpura-language'), 'en');
  assert.equal(readLocale(storage, { languages: ['zh-CN'] }), 'en');
  saveLocale(storage, 'zh');
  saveLocale(storage, 'fr');
  assert.equal(values.get('tanpura-language'), 'zh');
});

test('中英文字典覆盖相同文案且无空翻译', () => {
  assert.deepEqual(Object.keys(messages.zh).sort(), Object.keys(messages.en).sort());
  assert.ok(Object.keys(messages.zh).length > 0);
  for (const [locale, dictionary] of Object.entries(messages)) {
    for (const [key, value] of Object.entries(dictionary)) {
      assert.equal(typeof value, 'string', `${locale}.${key}`);
      assert.ok(value.trim(), `${locale}.${key}`);
    }
  }
});
