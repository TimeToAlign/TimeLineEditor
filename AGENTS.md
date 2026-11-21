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

Only arranger and editor may import `svelte`, and only arranger may import the canvas engine, `@xyflow/svelte` and `@xyflow/system`; the editor uses the canvas through arranger's components. Add a package only for a present need, and update the dependency-cruiser rules and their tests with any allowed edge.

## Design Rules

- Add no dependency without an ADR in `decisions/`. Use the MADR structure, weigh writing it ourselves, record the audited version and a review date.
- Write the relevant `tests/README.md` before tests. State validation logic and exact expected values; tests follow that file.
- TypeScript is strict ESM. Use Svelte 5 runes.
- The workspace changes only through four commands, `add`, `set`, `remove` and `style`, each aimed at addresses. An address is an object, never a string composed from IDs: `{}` the workspace, `{block}` a block, and `{block, id?, facet?, part?}` an element of the block's manifest, its members addressing the element as TimeToShare's drawing specification does (section 2.2). The kind of the target decides what a command does; never infer it from the shape of the arguments, and add no other command.
- A float never constructs a coordinate; page arithmetic in the writers may read a float's exact binary value (`fromFloat`), never an approximation of it. A value on its timeline's own axis (a length, an offset, a region's start and end, a flow-control element's coordinate) is bare: a JSON integer, a JSON number or a `[numerator, denominator]` Fraction pair as the axis's number type selects (the BOPP core primitives). A coordinate on another axis is atomic: `{ unit, number_type, value }`, its `value` represented the same way.
- `draw(manifest, placement, layers, metrics)`, `toDescriptors(drawing)`, `writeSvg(placed)` and `writeTikz(placed, options)` implement TimeToShare's drawing specification (`docs/drawing.md` there) and nothing beyond it. A rule the code applies that the specification does not state is a defect, fixed in the specification first. The specification and the SVG and TikZ fixtures of a version pin the drawing; there is no drawing schema, and a drawing's JSON form is internal to an implementation.
- One vocabulary for containers, the manifest's and the drawing's (TimeToShare's README, "Containers"): the semantic levels bundle, group, timeline and facet, drawn by the graphical containers **block** (a block's whole drawing), **frame** (a group's), **card** (a timeline drawn as a root, held by the block or by a frame) and **band** (a facet of a timeline). A **box** is any of the four, never the name of one. Manifest content and addresses take the semantic words, the drawing's containers the graphical ones. "Item" is the role of a frame or a block-held card, "member" is a fact about a timeline, and neither is a kind; never call a band an element. Core's container registry is the one table of these facts.
- One resolver and one key: what an address names is decided only by core's `resolveAddress`; addresses are compared as whole objects, and `addressKey(address)` is an address's one string form, the only key a map or a Svelte keyed block takes for it. No package writes an address as any other string, parses an ID, or reads anything out of an address's key.
- No shelved code: no commented-out code, no branch kept for a feature that is not enabled, no exported but unmounted component, no comment about a deleted name. A design kept for later is a tested module listed under "Not yet wired" in `docs/architecture.md`, and nothing else refers to it.
- Keep the three layers apart: a manifest knows nothing about the canvas, a block adds placement to one manifest, and the workspace holds blocks. A manifest has one shape and no kind; a kind word, where one is shown, is derived from its content. Keep a manifest's keys the schema does not declare: spread values, never rebuild them from known fields. A block's styling is its manifest's `graphical`; the block has no style layer of its own. Name each layer by its own word only: manifest, block, workspace.
- The test hook `window.__tilie` and the header's Fixture menu (every manifest and warning-case fixture of the schema version, each imported as one more block as the Examples menu imports a manifest, and the end-to-end workspaces, each opened as the Examples menu opens a workspace) are installed only when the page asks for them in a test build: a development build or one made with `VITE_TILIE_TEST_HOOK=1` (the Playwright web server's build). An embedded editor never has them; a production build, and so the wheel, must contain neither, nor any fixture file but what the standalone page's Examples menu offers: a few manifest fixtures of the schema package and the workspaces in `app/packages/editor/examples/`, which `pnpm e2e:fixtures` writes and nobody edits by hand. End-to-end tests read state through the hook and never from pixels, except the screenshot tests.
- Commands are serializable and validated. Return typed, machine-readable errors rather than display-oriented strings.
- Python uses type hints and Google-style docstrings.
- Server security is invariant: bind only `127.0.0.1`; generate a token for each run; hand the token to the editor only in the URL fragment (`/#token=…`), never in a path or query, so it never reaches the server or its access log, and have the editor remove it from the address bar with `history.replaceState`; reject foreign Host and Origin headers; require exact `Authorization: Bearer <token>` for every `/api/` route; send `Referrer-Policy: no-referrer` with every response.
- Outside requests are the user's to allow: the editor asks a public service only from a lookup (`src/lookup/`, ADR 0028), never with the `lookup: false` option, and reaches a service whose rules of use a browser cannot keep only through the server, which keeps them for every request of the run (MusicBrainz: one request a second, a User-Agent naming the server and its repository and no person, answers cached). Viewer settings (the user, the type profiles) live in the browser under the keys the host gives, never in a workspace or a manifest.

## Dependency Policy

- Runtime and peer dependencies declare compatible ranges in every package manifest: `server/pyproject.toml` (for example `fastapi>=0.141,<1`) and each `app/**/package.json` (for example `svelte` `^5.57.1` in `editor`).
- Development dependencies are pinned exactly: the npm `devDependencies` and the server's `dev` group.
- The lockfiles, `server/uv.lock` and `app/pnpm-lock.yaml`, pin every resolved version. A version enters a lockfile only once it has been released for at least 14 days (`minimumReleaseAge` in `app/pnpm-workspace.yaml`).
- The one exception to that window is this project's own schema package, `@timetoalign/timetoshare`, listed in `minimumReleaseAgeExclude`, so that a schema release can be consumed as soon as it is published.
- Three exceptions take a checkout beside this repository in the place of a release that does not exist yet; the repository is not published in any of these states:
  - the same schema package, while TiLiE is built against a schema version that is not yet released: every package that uses it (`core`, `layout`, `writers`, `arranger` and `editor`) then declares a committed `link:` to the sibling checkout's built package (`link:../../../../TimeToShare/js`, that is `../TimeToShare/js` from the repository root, built there with `pnpm build` first; CI builds it from TimeToShare's `main`, `.github/actions/install-app`). Once the schema version is released, the `link:` is replaced by a compatible range from npm (for schema 0.2.0, `^0.2.0`).
  - `timetoalign`, while the server needs a version of it that is not yet released: `server/pyproject.toml` keeps its range (`timetoalign>=1.2.0`) and adds a uv source, `[tool.uv.sources] timetoalign = { path = "../../timetoalign", editable = true }`, the sibling timetoalign checkout (`../timetoalign` from the repository root), which `uv sync` installs editable; published metadata does not see the source. CI checks timetoalign out at the commit `server/uv.lock` was locked against, named in `.github/workflows/ci.yml` and `release.yml`; a lockfile refreshed against another commit moves it there. Once a timetoalign release carries what the server needs, the source is removed and the range names that release.
  - `timetoshare`, the schema's Python package, while timetoalign checks statements through a schema version of it that is not yet released: timetoalign requires it by a git reference to TimeToShare's `main`, so `server/pyproject.toml` replaces that requirement with an override, `[tool.uv] override-dependencies = ["timetoshare>=0.2.0,<1"]`, and serves the override with a uv source, `[tool.uv.sources] timetoshare = { path = "../../TimeToShare/python", editable = true }`, the TimeToShare checkout the schema package is built from (`../TimeToShare/python` from the repository root). Without the override the lockfile would follow timetoalign's git reference, and uv takes no package from two places. The server reaches timetoshare through timetoalign's requirement and imports it only inside its routes (the measure-maps route answers 501 without it, the MusicBrainz route answers 501 where a request needs its catalogue), so its `[project]` dependencies do not list it; the override and the source act on the lockfile alone (`server/uv.lock` records the override under `[manifest] overrides`), and published metadata sees neither. CI's server job checks TimeToShare's `main` out beside the repository. Once a timetoshare release carries the schema version timetoalign reads, the override and the source are removed.
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
| `app/` | `pnpm test:budget` | Run the timing budgets alone, in one run, one file at a time (excluded from `pnpm test`): core's, the workspace store's and the MatchClaim anchor index's, and the arranger's, Show matches' overlay and hover; a failing budget stops none of the others. |
| `app/` | `pnpm test:build` | Run the tests that need a production build (the attributions and notices file) alone (excluded from `pnpm test`). |
| `app/` | `pnpm build` | Build the editor bundle. |
| `app/` | `pnpm build:embed` | Build the embeddable editor into `app/packages/editor/dist-embed/` (`tilie.js`, `tilie.css`, `assets/`, the notices file). |
| `app/` | `pnpm dev` | Start the editor development server. |
| `app/` | `pnpm e2e` | Run the Playwright suite in Chromium only, inside the pinned Playwright image through rootless podman (directly when already inside the image); `pnpm e2e <spec file>` runs one spec. |
| `app/` | `pnpm e2e:all` | Run the Playwright suite in Chromium, Firefox, WebKit and the touch project, as CI does, inside the image through podman; `pnpm e2e:all <spec file>` runs one spec in all four. |
| `app/` | `pnpm e2e:budget` | Run the canvas timing budgets in Chromium, inside the image through podman. |
| `app/` | `pnpm e2e:visual` | Compare the zero-tolerance screenshots with their baselines; only inside the image through podman, never in CI. |
| `app/` | `pnpm e2e:visual:update` | Re-create the screenshot baselines inside the image through podman; review every changed image before committing it. |
| `app/` | `pnpm e2e:fixtures` | Write the end-to-end workspaces in `e2e/fixtures/` from the schema package's manifest fixtures, and the Examples menu's workspaces in `packages/editor/examples/`, through the store's commands; never edit them by hand. |
| `app/` | `pnpm e2e:fixtures:check` | Fail unless every committed end-to-end and example workspace equals the generator's output byte for byte. |
| `app/` | `TILIE_REQUIRE_LUALATEX=1 pnpm vitest run --project writers packages/writers/tests/compile.test.ts` | Parse every drawing fixture's `figure.svg` and compile every `figure.tex`, failing when `lualatex` is missing. |
| repository root | `pnpm -C app/packages/writers emit-drawings --into <TimeToShare checkout>` | Write the drawing fixtures into a TimeToShare checkout (an absolute path, or one relative to `app/packages/writers`); never rewrites the hand-derived figures. While the schema package is a `link:`, rebuild the checkout's `js/` package with `pnpm build` afterwards, since TiLiE's tests read the drawings from that package's copy of the fixtures. |
| `app/packages/editor/` | `node scripts/record-lookup.ts` | Record the answers of Wikidata, lobid-gnd and YouTube that the lookup tests replay, into `tests/lookup/`, one request a second; with `--route ../../../server` the answers of the server's MusicBrainz endpoint, replayed from the server's own recordings. Run only to refresh the recordings. |
| `server/` | `uv run python scripts/record_musicbrainz.py` | Record the MusicBrainz answers the server's lookup tests replay, into `tests/data/musicbrainz/`, with the server's User-Agent and pace. Run only to refresh the recordings. |
| `server/` | `uv run python scripts/record_match_claims.py` | Record the match-claims answer for TimeToShare's MatchClaim table fixture that the client's tests decode, into `app/packages/client/tests/data/match-claims.answer.bin`. Run only after the answer's layout or the fixture changed. |
| repository root | `pnpm -C app/packages/writers review` | Render the writer review sheet into `app/packages/writers/review/` with `rsvg-convert`. |
| `server/` | `uv sync` | Create or update the locked environment. |
| `server/` | `uv run ruff check .` | Run Python lint checks. |
| `server/` | `uv run ruff format --check .` | Check Python formatting. |
| `server/` | `uv run pytest` | Run server tests. |
| `server/` | `uv build` | Build the source distribution and wheel. |
| `server/` | `uv run tilie --check --no-browser` | Verify the installed server and bundled app. |
| repository root | `python3 scripts/check_versions.py --tag vX.Y.Z` | Check a release tag against declared versions. |

Playwright runs share one port (4317) and one output folder (`app/e2e/test-results/`), so run them one at a time. `TILIE_E2E_WORKERS`, a positive integer, sets the number of Playwright workers (default 4) and is passed into the container. Every run builds the editor with the test hook into `app/packages/editor/dist-e2e`, never into `dist`, the folder the wheel bundles; CI fails the server job if the wheel contains `__tilie`.
