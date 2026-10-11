# AGENTS.md – PnP Soundboard

Browser soundboard for pen & paper sessions using the Web Audio API: sound library with categories, search and
hotkeys, plus a background playlist and an effects playlist. User-facing docs live in `README.md`.

## Layout

- `index.html` – the whole UI (Bootstrap 3 markup, jQuery).
- `js/board.js` – all client logic, plain browser script (no modules, no build step). State lives in top-level
  `var`s; functions are global because the test suite `eval`s the file.
- `css/custom.css` – styling on top of Bootstrap 3.
- `start-server.js` – `live-server` on :8080 with a middleware that serves `sounds/` itself (real paths,
  symlinks, HTTP range requests, path-traversal guard).
- `generateSoundJson.js` – walks the sound dir and writes `sounds.json` (`{ "<category>": ["file", …] }`);
  nested folders become categories like `packs/rain`.
- `copyScript.js` – creates `js/customizations.json` from `js/example.customizations.json` if missing.
- `spec/board.spec.js` – Jest tests (jsdom, `web-audio-test-api`).
- `example_sounds/` – sample sounds; `sounds/` is the user's library and is gitignored.

## Commands

```sh
npm install --include=dev   # needed here: NODE_ENV=production would otherwise skip devDependencies
npm run test:ci             # run tests once (use this; `npm test` starts Jest in watch mode)
npm start                   # updateSounds + live-server on :8080
npm run pretty              # Prettier 1.x over css/js/html/json
```

## Conventions

- **Language:** code, comments and commit messages in English.
- **No build tooling:** keep `js/board.js` a plain script that runs directly in the browser. Don't introduce
  ES modules, bundlers or frameworks without asking first.
- **Testability:** the spec loads jQuery, `board.js` and Bootstrap via `eval` and then calls `gotSoundJson(...)`.
  New logic must stay reachable as global functions; constructor-style "classes" (e.g. `BufferLoader`) use
  prototypes because class syntax broke the test harness.
- **Audio:** decode sounds lazily (only when added to a playlist / played), unlock the `AudioContext` on user
  interaction, and fail loads cleanly instead of throwing.
- **Hotkeys** are disabled while typing in an input; keep that invariant for new shortcuts.
- **Style:** Prettier 1.x defaults – 2 spaces, double quotes, semicolons. Run `npm run pretty` on touched files.
- Generated/local files are gitignored and never committed: `sounds.json`, `sounds/*`, `js/customizations.json`,
  `package-lock.json`.

## Tests

- Every behaviour change gets a test in `spec/board.spec.js`; run `npm run test:ci` before committing.
- CI (`.github/workflows/nodejs.yml`) runs `npm run test:ci` on Node 22, 24 and 26 for every push and PR.
  Keep the suite green on all three.

## Git

- Branch `master`, remote `origin` = github.com/KarrAcaRn/pnp-soundboard (originally forked from devp00l).
- Commit messages: one short English sentence in imperative mood, ending with a period
  (e.g. "Let effects be reordered by drag and drop.").
