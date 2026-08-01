# CLAUDE.md

**Read `README.md` first.** It explain what plugin do and how user use it. This file
only cover how to work on code.

## Stack

Obsidian community plugin. TypeScript -> esbuild -> single `main.js`. Desktop only.
Dataview query pick the notes. jest for test. eslint 9 flat config.

## Package manager: pnpm. Only pnpm.

No npm, no yarn. `package-lock.json` deleted on purpose — do not bring back.
`packageManager` field in `package.json` pin exact pnpm; CI read it from there.

```
pnpm install
pnpm run dev      # esbuild watch
pnpm run build    # tsc -noEmit + esbuild production
pnpm test         # jest
pnpm run lint     # eslint .
pnpm run release  # see below
```

## Release

`pnpm run release [patch|minor|major|X.Y.Z]`. Script refuse dirty tree, refuse non-main.

**Tag is bare — `2.0.16`, never `v2.0.16`.** Obsidian release checker demand tag equal
`manifest.json` version exactly. Wrong tag = update invisible to users, no error.

Tag push trigger `.github/workflows/release.yml`, which attach `main.js`,
`manifest.json`, `styles.css` as separate release assets. Zip not accepted.

Version live in three files, kept in sync by `version-bump.mjs`: `package.json`,
`manifest.json`, `versions.json`.

## Tests

`src/test/`. Unit only. `local-link-replace.test.ts` data-driven: expected counts come
from frontmatter of fixtures in `test-vault/`, snapshotted into `src/test/test-vault.json`.
**That JSON is what test read** — edit fixture `.md` alone do nothing.

## Gotchas

- `main.js` gitignored. Build artifact, ship via release only.
- `obsidian-dataview` `.d.ts` re-export via bare specifiers. Never resolve under
  `moduleResolution: "node"`, so every Dataview type collapse to error type. Masked by
  `-skipLibCheck`. Deep-import concrete declaration files to work around.
- `obsidian` pinned on purpose. Plugin reach into undocumented internals (see remaining
  `@ts-ignore`), so minor bump can break. Build warn when npm `latest` drift.
- Errors go quiet easy here. `view.ts` catch export failure to `console.error` only, and
  palette command in `main.ts` not awaited. Bug report say "nothing happen" because user
  genuinely see nothing. When touch export path: make failure visible.
- Export loop must never let one bad file kill batch. Per-file error stay per-file.
