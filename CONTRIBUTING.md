# Contributing to TiLiE

TiLiE is a pnpm TypeScript workspace with a Svelte 5 application and a separate Python server. The application is an early alpha that arranges, inspects, opens and saves workspaces but does not yet load sources through the server, so contributions should preserve the package boundaries and document exactly what a new behavior proves.

## Setup

Install Node.js 22.18 or newer, pnpm 12.10.1, Python 3.11 or newer, and uv.

The application packages `core`, `layout` and `writers` take schema 0.6.0 from the `@timetoalign/timeskeleton` package. To try a change to timeskeleton itself, point their dependency at a built local checkout's `js/` package with a `link:` path, and never commit the link. `pnpm dev` may read the linked package's directory, so the editor still loads its bundled font. Prepare both parts of the repository:

```bash
cd app
pnpm install
cd ../server
uv sync
```

## Run, Test, and Build

Run application commands from `app/`:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:budget
pnpm build
pnpm dev
```

`pnpm test:budget` runs the workspace store's timing budgets alone, one file at a time; `pnpm test` excludes them.

Run server commands from `server/`:

```bash
uv run ruff check .
uv run ruff format --check .
uv run pytest
uv build
uv run tilie --check --no-browser
```

Build the application before building a distributable server wheel. The server build hook copies `app/packages/editor/dist` into the wheel; the CI workflow verifies this and runs the installed wheel's self-check. For a development build, run `uv run tilie --check --static-dir ../app/packages/editor/dist` from `server/`.

The writers' compile test runs every review drawing through `lualatex`, which needs TikZ, the `standalone` class, and `fontspec` (on Ubuntu: `texlive-luatex`, `texlive-latex-recommended`, `texlive-latex-extra`, and `texlive-pictures`). It uses the DejaVu Sans file bundled by timeskeleton. Without `lualatex` the test is skipped; set `TILIE_REQUIRE_LUALATEX=1` to make its absence a failure, as the `tikz` CI job does.

The SVG and TikZ fixtures that pin a drawing belong to timeskeleton. There is no drawing schema, and a drawing's JSON form is internal to TiLiE. The source of truth for layout and writer behavior is timeskeleton's [drawing specification](https://github.com/TimeToAlign/timeskeleton/blob/main/docs/drawing.md).

Review drawing changes with `rsvg-convert` installed:

```bash
pnpm -C app/packages/writers review
```

The command draws every 0.6.0 manifest fixture, together with resized and restyled cases, writes their SVG and PNG files under `app/packages/writers/review/`, and lists them in `review/index.html`. It rasterizes at twice the size (`rsvg-convert --zoom 2`) with fontconfig restricted to timeskeleton's bundled `DejaVuSans.ttf`, and refuses to continue if another font is visible or `rsvg-convert` fails.

### End-to-end tests

The canvas is tested in real browsers with Playwright. Every run happens inside the official Playwright image of the locked `@playwright/test` version (`mcr.microsoft.com/playwright:v<version>-noble`), which carries Chromium, Firefox and WebKit with their system libraries and fonts, so the browsers are the same on every machine. Locally, `e2e/run.ts` starts that image through rootless [podman](https://podman.io) with the `app/` directory mounted and the host network; install podman and pull the image once. In CI the job already runs inside the image, and the script starts Playwright directly.

```bash
cd app
pnpm e2e                  # Chromium, Firefox, WebKit and the touch project
pnpm e2e:budget           # the canvas timing budgets, Chromium only
pnpm e2e:visual           # the zero-tolerance screenshots; local only, never in CI
pnpm e2e:visual:update    # re-create the screenshot baselines
pnpm e2e:fixtures:check   # the committed test workspaces equal their generator's output
```

Each run builds the editor with the test hook (`VITE_TILIE_TEST_HOOK=1`) into `app/packages/editor/dist-e2e`, never into the `dist` folder the wheel bundles, and serves it on `127.0.0.1:4317`. Runs share that port and the output folder `app/e2e/test-results/`, so run one at a time. Screenshot baselines are valid only when made inside the image; review every changed image before committing it. When a schema release changes the manifest fixtures, regenerate the test workspaces with `pnpm e2e:fixtures`; never edit them by hand. For debugging, Chromium and Firefox also run natively with `pnpm exec playwright test --project=chromium --headed` after `pnpm exec playwright install chromium`; WebKit's Linux build needs the image's libraries on hosts other than Ubuntu and Debian. In `pnpm dev` the header's Fixture menu opens any of these workspaces with Load, for trying the canvas by hand. `app/e2e/README.md` states what each spec proves and the exact values it expects.

Each package and the server has a `tests/README.md`. Update the appropriate readme first with the validation logic and exact expected values, then write the test.

## Dependencies

Add an ADR in [`decisions/`](decisions/) before adding a dependency. The record must use the repository's MADR structure, compare writing it ourselves, identify the audited version, and set a review date.

Package manifests declare compatible ranges for runtime and peer dependencies, such as `fastapi>=0.141,<1` and `uvicorn[standard]>=0.53,<1` in the server and `svelte` `^5.57.1` in `app/packages/editor`; development dependencies, the npm `devDependencies` and the server's `dev` group, are pinned exactly. The lockfiles, `server/uv.lock` and `app/pnpm-lock.yaml`, pin every resolved version. Enter only versions released at least 14 days before they enter a lockfile, and name the audited version in its ADR; the one exception to that window is this project's own schema package, `@timetoalign/timeskeleton` (`minimumReleaseAgeExclude` in `app/pnpm-workspace.yaml`). This is the dependency policy; do not treat a compatible manifest range as an error by itself.

## Packages

The ladder is enforced by [`app/.dependency-cruiser.cjs`](app/.dependency-cruiser.cjs): core has no workspace dependency; layout and client may depend on core; writers may depend on layout and core; arranger may depend on writers, layout and core; editor may depend on every workspace package. Only arranger and editor may import Svelte.

When adding a package, first establish a present need. Add its permitted edges to the dependency-cruiser configuration and the workspace ladder tests, keep it below the packages that consume it, and write its test readme before behavior tests. Do not put UI, DOM, or transport code into core.

## Known Limitations

The editor component test mounts the shell and checks its headings, the focus on the canvas, the health request with the offline mark, and the inspector drawer with its remembered state. It covers the token taken from the URL fragment and cleared from the address bar, and the absent token (no fragment, so an empty bearer header is sent). It does not verify CSS layout (the drawer's and the tab's positions are checked end to end), mobile rendering, or a fragment that carries an empty token (`#token=`). The File System Access path is tested against stubbed pickers only; the end-to-end tests remove the pickers and take the file-input and download path in every engine. The server static-file tests do not exercise traversal behavior. Treat these gaps as test coverage to improve when their behavior is changed.

## Release

Releases are made by [release-please](https://github.com/googleapis/release-please) and `.github/workflows/release.yml`. Write commit messages in the [Conventional Commits](https://www.conventionalcommits.org/) form; release-please derives the next version and the `CHANGELOG.md` entry from them. Before 1.0, a `feat` bumps the patch version and a breaking change the minor version; a commit footer `Release-As: X.Y.Z` sets a version explicitly.

On every push to `main`, release-please opens or updates a release pull request that sets the version in `server/pyproject.toml`, `app/package.json` and the `tilie-server` entry of `server/uv.lock`, and adds the changelog entry. Merging it tags `vX.Y.Z` and creates the GitHub release. The workflow then checks the tag with `scripts/check_versions.py`, installs the locked app dependencies, lints, type-checks, tests and builds the app, installs the locked server dependencies, tests, builds the distributions, verifies that the wheel contains `index.html`, and publishes them through PyPI OpenID Connect. Do not push version tags by hand.

The workflow needs GitHub Actions to be allowed to create pull requests in this repository, and this PyPI trusted publisher:

| Setting | Value |
| --- | --- |
| Project name | `tilie-server` |
| Owner | `TimeToAlign` |
| Repository | `TimeLineEditor` |
| Workflow file name | `release.yml` |
| Environment name | `pypi` |

The repository does not use a stored PyPI publishing token.
