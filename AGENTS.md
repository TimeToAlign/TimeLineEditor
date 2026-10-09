# Contributor Rules

These rules apply to every contributor, whether human or automated.

## Package Ladder

`app/.dependency-cruiser.cjs` enforces these allowed workspace dependencies:

| Package | May depend on | Must never contain |
| --- | --- | --- |
| `tilie-core` | no workspace package | Svelte, DOM code, rendering, transport code, or mutable canvas geometry |
| `tilie-layout` | core | Svelte, DOM interaction, transport code, or writers |
| `tilie-writers` | layout and core | Svelte, DOM interaction, or application state |
| `tilie-arranger` | layout and core | document mutations outside commands, writers, or client transport |
| `tilie-client` | core | Svelte, layout, rendering, or editor state |
| `tilie-editor` | every workspace package | reusable domain behavior that belongs lower in the ladder |

Only arranger and editor may import `svelte`. Add a package only for a present need, and update the dependency-cruiser rules and their tests with any allowed edge.

## Design Rules

- Add no dependency without an ADR in `decisions/`. Use the MADR structure, weigh writing it ourselves, record the audited version and a review date.
- Write the relevant `tests/README.md` before tests. State validation logic and exact expected values; tests follow that document.
- TypeScript is strict ESM. Use Svelte 5 runes. Name commands `verbNoun`.
- Never construct rationals from floats. A rational coordinate is atomic: `{ value, numerator, denominator }`; integers above `2^53` are strings.
- Commands are serializable and validated. Return typed, machine-readable errors rather than display-oriented strings.
- Python uses type hints and Google-style docstrings.
- Server security is invariant: bind only `127.0.0.1`; generate a token for each run; reject foreign Host and Origin headers; require exact `Authorization: Bearer <token>` for every `/api/` route.

## Dependency Policy

`server/pyproject.toml` and all `app/**/package.json` files declare compatible ranges where required by the contract; `timetoalign>=1.2.0` is correct. `server/uv.lock` and `app/pnpm-lock.yaml` pin exact resolved versions released at least 14 days before entry. The ADR for a dependency names the version that was audited. Preserve this policy rather than replacing compatible ranges with exact manifest pins.

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
| `server/` | `uv sync` | Create or update the locked environment. |
| `server/` | `uv run ruff check .` | Run Python lint checks. |
| `server/` | `uv run ruff format --check .` | Check Python formatting. |
| `server/` | `uv run pytest` | Run server tests. |
| `server/` | `uv build` | Build the source distribution and wheel. |
| `server/` | `uv run tilie --check --no-browser` | Verify the installed server and bundled app. |
| repository root | `python3 scripts/check_versions.py --tag vX.Y.Z` | Check a release tag against declared versions. |
