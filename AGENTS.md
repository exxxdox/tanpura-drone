# Tanpura project conventions

- Use pnpm. Vue UI lives in `src/App.vue` with the entry in `src/main.js`; Web Audio scheduling and cancellation live in `src/audio-engine.js`.
- Styling uses Tailwind CSS v4 via `@tailwindcss/vite`: theme tokens, custom variants (`mobile`, `wide`, `short`) and unavoidable pseudo-element utilities live in `src/style.css`; component styles are utility classes in `src/App.vue`.
- Preserve login-free entry, twelve keys, crossfade loops, volume control, keyboard access and reduced-motion support.
- Each key uses its own full-length recording at playbackRate 1; keep the twelve files in `public/audio/` accurate.
- Original downloads live in ignored `outputs/`; preserve the full 25-minute duration in `public/audio/`. Use media streaming, not full-file PCM decoding. Never shorten recordings without explicit approval.
- Pause must invalidate pending loads. Keep Firefox/Zen compatibility; do not require `cancelAndHoldAtTime`.
- Run `pnpm test` and `pnpm build` before publication. `dist/` is generated; edit `src/` and `public/`.
- Desktop layout must fit 2560×1440 and common scaled viewports without document overflow or clipped controls. Verify actual scroll dimensions; do not hide overflow to mask layout problems. Keep mobile content scrollable.
- Deployment uses GitHub and Vercel (`vercel.json`); do not register or publish this project through Sites. Mount Vercel Analytics and Speed Insights once in `src/main.js`; never commit `.vercel/` or local environment files.
- Keep these conventions identical in AGENTS.md and CLAUDE.md.
