# Contributor Rules

These rules apply to every contributor, whether human or automated.

## Package Ladder

`app/.dependency-cruiser.cjs` enforces these allowed workspace dependencies:

| Package | May depend on | Must never contain |
| --- | --- | --- |
| `tilie-core` | no workspace package | Svelte, DOM code, rendering, transport code, or mutable drawing data |
| `tilie-layout` | core | Svelte, DOM interaction, transport code, or writers |
| `tilie-writers` | layout and core | Svelte, DOM interaction, or application state |
| `tilie-arranger` | writers, layout and core | workspace or manifest mutations outside commands, or client transport |
| `tilie-client` | core | Svelte, layout, rendering, or editor state |
| `tilie-editor` | every workspace package | reusable domain behavior that belongs lower in the ladder |

Only arranger and editor may import `svelte`. Add a package only for a present need, and update the dependency-cruiser rules and their tests with any allowed edge.

## Design Rules

- Add no dependency without an ADR in `decisions/`. Use the MADR structure, weigh writing it ourselves, record the audited version and a review date.
- Write the relevant `tests/README.md` before tests. State validation logic and exact expected values; tests follow that file.
- TypeScript is strict ESM. Use Svelte 5 runes. Name commands `verbNoun`.
- A float never constructs a coordinate; page arithmetic in the writers may read a float's exact binary value (`fromFloat`), never an approximation of it. A coordinate is atomic: `{ unit, number_type, value }`, where `value` is a JSON integer, a JSON number or a `[numerator, denominator]` Fraction pair as `number_type` selects (the BOPP core primitives).
- `draw(manifest, placement, layers, metrics)`, `toDescriptors(drawing)`, `writeSvg(placed)` and `writeTikz(placed, options)` implement timeskeleton's drawing specification (`docs/drawing.md` there) and nothing beyond it. A rule the code applies that the specification does not state is a defect, fixed in the specification first. The specification and the SVG and TikZ fixtures of a version pin the drawing; there is no drawing schema, and a drawing's JSON form is internal to an implementation.
- Keep the three layers apart: a manifest knows nothing about the canvas, a block adds placement to one manifest, and the workspace holds records. Name each layer by its own word only: manifest, block, workspace.
- Commands are serializable and validated. Return typed, machine-readable errors rather than display-oriented strings.
- Python uses type hints and Google-style docstrings.
- Server security is invariant: bind only `127.0.0.1`; generate a token for each run; hand the token to the editor only in the URL fragment (`/#token=…`), never in a path or query, so it never reaches the server or its access log, and have the editor remove it from the address bar with `history.replaceState`; reject foreign Host and Origin headers; require exact `Authorization: Bearer <token>` for every `/api/` route; send `Referrer-Policy: no-referrer` with every response.

## Dependency Policy

- Runtime and peer dependencies declare compatible ranges in every package manifest: `server/pyproject.toml` (for example `fastapi>=0.141,<1`) and each `app/**/package.json` (for example the optional peer `yjs` `^13.6.33` of `core`).
- Development dependencies are pinned exactly: the npm `devDependencies` and the server's `dev` group.
- The lockfiles, `server/uv.lock` and `app/pnpm-lock.yaml`, pin every resolved version. A version enters a lockfile only once it has been released for at least 14 days (`minimumReleaseAge` in `app/pnpm-workspace.yaml`).
- The one exception to that window is this project's own schema package, `@timetoalign/timeskeleton`, listed in `minimumReleaseAgeExclude`, so that a schema release can be consumed as soon as it is published.
- The ADR for a dependency names the version that was audited.

Preserve this policy: never replace a runtime or peer range with an exact pin in a package manifest, and never widen a development dependency to a range.

## Commands

Run each command from the stated directory.

| Directory | Command | Purpose |
| --- | --- | --- |
| `app/` | `pnpm install` | Install workspace dependencies. |
| `app/` | `pnpm lint` | Run Biome and dependency-cruiser. |
| `app/` | `pnpm format` | Apply Biome formatting. |
| `app/` | `pnpm typecheck` | Type-check the workspace. |
| `app/` | `pnpm test` | Run Vitest. |
| `app/` | `pnpm build` | Build the editor bundle. |
| `app/` | `pnpm dev` | Start the editor development server. |
| `app/` | `TILIE_REQUIRE_LUALATEX=1 pnpm vitest run --project writers packages/writers/tests/compile.test.ts` | Parse every review SVG and compile every review TikZ document, failing when `lualatex` is missing. |
| repository root | `pnpm -C app/packages/writers review` | Render the writer review sheet into `app/packages/writers/review/` with `rsvg-convert`. |
| `server/` | `uv sync` | Create or update the locked environment. |
| `server/` | `uv run ruff check .` | Run Python lint checks. |
| `server/` | `uv run ruff format --check .` | Check Python formatting. |
| `server/` | `uv run pytest` | Run server tests. |
| `server/` | `uv build` | Build the source distribution and wheel. |
| `server/` | `uv run tilie --check --no-browser` | Verify the installed server and bundled app. |
| repository root | `python3 scripts/check_versions.py --tag vX.Y.Z` | Check a release tag against declared versions. |
