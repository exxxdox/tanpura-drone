# Tanpura · 弦外之境

无需登录的十二调 Tanpura 单页播放器，使用 Vue 和 Vite。源码位于 `src/`，静态资源位于 `public/`，`dist/` 为可重新生成的构建产物。

开发：`pnpm dev`，然后打开终端显示的本地地址。

验证：`pnpm test`。构建：`pnpm build`。预览构建：`pnpm preview`。

## GitHub 与 Vercel

将源码、`pnpm-lock.yaml` 和 `public/audio/` 提交到 GitHub；`outputs/`、`node_modules/`、`dist/`、`.vercel/` 和本地环境变量文件不提交。

在 Vercel 导入 GitHub 仓库，项目根目录保持仓库根目录。项目使用 Vite，构建命令为 `pnpm build`，输出目录为 `dist`，已写入 `vercel.json`。安装依赖时使用 pnpm 和锁文件；本项目不需要 API key 或运行时环境变量。

Vercel 依据 `pnpm-lock.yaml` 识别 pnpm；`package.json` 用 `packageManager` 固定为 `pnpm@11.18.0`。若 Vercel 未按该版本执行构建，在项目环境变量中开启 `ENABLE_EXPERIMENTAL_COREPACK=1`。详见 [Vercel 包管理器说明](https://vercel.com/docs/package-managers)。

`src/main.js` 在入口调用 `@vercel/analytics` 的 `inject` 与 `@vercel/speed-insights` 的 `injectSpeedInsights` 各一次。在 Vercel 项目控制台启用 Web Analytics，并检查 Speed Insights 已启用，然后部署。监测数据需部署后的真实访问才能验证；本地预览时监测脚本请求返回 404 属预期。

官方接入说明：[Web Analytics](https://vercel.com/docs/analytics/quickstart)、[Speed Insights](https://vercel.com/docs/speed-insights/quickstart)。

各调直接播放完整录音，不做升降调或变速；频率为标称值，并非实测校准。使用媒体元素流式播放，避免解码整段 PCM；暂停和快速切调会让旧异步请求失效。

浏览器首次播放需要用户点击。线上使用每调完整约 25 分钟录音，以 96 kbps MP3 发布，播完循环；原始 320 kbps 文件不进入仓库。琴弦和共鸣光环由实际音频能量驱动，暂停、静音和系统减少动态效果设置均会停止振动。

系统休眠、手机锁屏或浏览器冻结页面可能中断播放。


## 本地字体与子集化

网站统一使用用户提供的 Maple Mono Normal NF CN Regular，发布文件为 `public/fonts/tanpura-maple.woff2`。子集保留完整 ASCII、中英文文案与界面符号；装饰图案使用 SVG。仅提供 Regular 字重，较粗文字由浏览器合成。字体使用 SIL OFL 1.1，授权保留在 `public/fonts/OFL.txt`；修改后的子集内部命名为 Tanpura Maple。

原文件 20,646,968 字节，当前 WOFF2 子集 72,596 字节。原始 TTF 保存在被 Git 忽略的 `local/MapleMonoNormal-NF-CN-Regular.ttf`，本地生成工具也不提交，线上不请求 Google Fonts。

新增文案后，使用 Python 3 和 Node 重新生成；在独立 Python 环境安装 `fonttools[woff]==4.60.2`，然后执行 `python scripts/subset-font.py local/MapleMonoNormal-NF-CN-Regular.ttf`。脚本读取实际字典与静态界面文字，验证源字体和产物字符覆盖，更新字体及 `subset.json`。运行 `pnpm test` 和 `pnpm build`，并检查浏览器加载与布局。测试会提示新增文案字符未进入子集的情况。
