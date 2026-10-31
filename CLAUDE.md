# Tanpura project conventions

- Use pnpm. React UI lives in `src/App.jsx`; Web Audio scheduling and cancellation live in `src/audio-engine.js`.
- Preserve login-free entry, twelve keys, crossfade loops, volume control, keyboard access and reduced-motion support.
- Each key uses its own  Sa–Pa recording at playbackRate 1. keep the twelve files in `public/audio/` accurate.
- Original downloads live in ignored `outputs/`; preserve the full 25-minute duration in `public/audio/`. Use media streaming, not full-file PCM decoding. Never shorten recordings without explicit approval.
- Pause must invalidate pending loads. Keep Firefox/Zen compatibility; do not require `cancelAndHoldAtTime`.
- Run `pnpm test` and `pnpm build` before publication. `dist/` is generated; edit `src/` and `public/`.
- Desktop layout must fit 2560×1440 and common scaled viewports without document overflow or clipped controls. Verify actual scroll dimensions; do not hide overflow to mask layout problems. Keep mobile content scrollable.
- Keep these conventions identical in AGENTS.md and CLAUDE.md.
