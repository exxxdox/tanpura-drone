import { createApp } from 'vue';
import { inject } from '@vercel/analytics';
import { injectSpeedInsights } from '@vercel/speed-insights';
import App from './App.vue';
import './style.css';

// 入口统一注入官方监测脚本一次；两包均为浏览器端注入，Vue 项目无需要额外适配组件。
inject();
injectSpeedInsights();
createApp(App).mount('#root');
