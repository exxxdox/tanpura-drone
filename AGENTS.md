# Tanpura project conventions

- Use pnpm. React UI lives in `src/App.jsx`; Web Audio scheduling and cancellation live in `src/audio-engine.js`.
- Preserve login-free entry, twelve keys, crossfade loops, volume control, keyboard access and reduced-motion support.
- Each key uses its own  Sa–Pa recording at playbackRate 1. keep the twelve files in `public/audio/` accurate.
- Original downloads live in ignored `outputs/`; deploy only the one-minute excerpts in `public/audio/`.
- Pause must invalidate pending loads. Keep Firefox/Zen compatibility; do not require `cancelAndHoldAtTime`.
- Run `pnpm test` and `pnpm build` before publication. `dist/` is generated; edit `src/` and `public/`.
- Keep these conventions identical in AGENTS.md and CLAUDE.md.
