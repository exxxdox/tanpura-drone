# Tanpura project conventions

- Use pnpm. Vue UI lives in `src/App.vue` with the entry in `src/main.js`; Web Audio scheduling and cancellation live in `src/audio-engine.js`.
- Styling uses Tailwind CSS v4 via `@tailwindcss/vite`: theme tokens, custom variants (`mobile`, `wide`, `short`) and unavoidable pseudo-element utilities live in `src/style.css`; component styles are utility classes in `src/App.vue`.
- Preserve login-free entry, twelve keys, crossfade loops, volume control, keyboard access and reduced-motion support.
- The synth lives in `src/synth.js`, shows two octaves from a selectable start (C0–C5), shares the Drone AudioContext but has its own volume, and keeps both latch and hold modes playable by pointer and computer keyboard.
- Each key uses its own full-length recording at playbackRate 1; keep the twelve files in `public/audio/` accurate.
- Original downloads live in ignored `outputs/`; preserve the full 25-minute duration in `public/audio/`. Use media streaming, not full-file PCM decoding. Never shorten recordings without explicit approval.
- Pause must invalidate pending loads. Keep Firefox/Zen compatibility; do not require `cancelAndHoldAtTime`.
- Run `pnpm test` and `pnpm build` before publication. `dist/` is generated; edit `src/` and `public/`.
- Desktop layout must fit 2560×1440 and common scaled viewports without document overflow or clipped controls. Verify actual scroll dimensions; do not hide overflow to mask layout problems. Keep mobile content scrollable.
- Deployment uses GitHub and Vercel (`vercel.json`); do not register or publish this project through Sites. Mount Vercel Analytics and Speed Insights once in `src/main.js`; never commit `.vercel/` or local environment files.
- UI copy lives in `src/i18n.js` (Chinese and English). Use the browser’s preferred language on first visit, persist manual selection, and translate status, accessibility labels and document metadata without restarting audio.
- Fonts are self-hosted in `public/fonts/`: regenerate the Maple WOFF2 subset with `scripts/subset-font.py` when copy adds characters, retain OFL.txt, and verify font coverage plus bilingual layout. Do not restore third-party font requests.
- Keep these conventions identical in AGENTS.md and CLAUDE.md.
