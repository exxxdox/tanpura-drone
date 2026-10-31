# Tanpura · 弦外之境

无需登录的十二调 Tanpura 单页播放器，使用 Vue 和 Vite。源码位于 `src/`，静态资源位于 `public/`，`dist/` 为可重新生成的构建产物。

开发：`pnpm dev`，然后打开终端显示的本地地址。

验证：`pnpm test`。构建：`pnpm build`。预览构建：`pnpm preview`。

## GitHub 与 Vercel

将源码、`pnpm-lock.yaml` 和 `public/audio/` 提交到 GitHub；`outputs/`、`node_modules/`、`dist/`、`.vercel/` 和本地环境变量文件不提交。

在 Vercel 导入 GitHub 仓库，项目根目录保持仓库根目录。项目使用 Vite，构建命令为 `pnpm build`，输出目录为 `dist`，已写入 `vercel.json`。安装依赖时使用 pnpm 和锁文件；本项目不需要 API key 或运行时环境变量。

Vercel 依据 `pnpm-lock.yaml` 识别 pnpm，并使用构建镜像自带的 pnpm 版本。`package.json` 因此不写 `packageManager`，避免触发 Vercel 的 Corepack 实验开关 `ENABLE_EXPERIMENTAL_COREPACK`。详见 [Vercel 包管理器说明](https://vercel.com/docs/package-managers)。

`src/main.js` 在入口调用 `@vercel/analytics` 的 `inject` 与 `@vercel/speed-insights` 的 `injectSpeedInsights` 各一次。在 Vercel 项目控制台启用 Web Analytics，并检查 Speed Insights 已启用，然后部署。监测数据需部署后的真实访问才能验证；本地预览时监测脚本请求返回 404 属预期。

官方接入说明：[Web Analytics](https://vercel.com/docs/analytics/quickstart)、[Speed Insights](https://vercel.com/docs/speed-insights/quickstart)。

各调直接播放完整录音，不做升降调或变速；频率为标称值，并非实测校准。使用媒体元素流式播放，避免解码整段 PCM；暂停和快速切调会让旧异步请求失效。

浏览器首次播放需要用户点击。线上使用每调完整约 25 分钟录音，以 96 kbps MP3 发布，播完循环；原始 320 kbps 文件不进入仓库。琴弦和共鸣光环由实际音频能量驱动，暂停、静音和系统减少动态效果设置均会停止振动。

系统休眠、手机锁屏或浏览器冻结页面可能中断播放。
