# Contributing to TiLiE

TiLiE is a pnpm TypeScript workspace with a Svelte 5 application and a separate Python server. The application is currently a shell, so contributions should preserve the package boundaries and document exactly what a new behavior proves.

## Setup

Install Node.js 22.18 or newer, pnpm 12.10.1, Python 3.11 or newer, and uv.

The application packages consume schema 0.4.0 of `@timetoalign/timeskeleton`, which is not published yet, so they link the JavaScript package of a timeskeleton checkout beside this repository (`link:../../../../timeskeleton/js` in `core`, `layout` and `writers`). Clone it next to TimeLineEditor and build its package before installing; when 0.4.0 is published, the link is replaced by a registry range. Then prepare both parts of the repository:

```bash
(cd ../timeskeleton/js && pnpm install && pnpm build)
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
pnpm build
pnpm dev
```

Run server commands from `server/`:

```bash
uv run ruff check .
uv run ruff format --check .
uv run pytest
uv build
uv run tilie --check --no-browser
```

Build the application before building a distributable server wheel. The server build hook copies `app/packages/editor/dist` into the wheel; the CI workflow verifies this and runs the installed wheel's self-check. For a development build, run `uv run tilie --check --static-dir ../app/packages/editor/dist` from `server/`.

The writers' compile test runs each of the 16 TikZ fixtures that `figures.test.ts` reproduces through `lualatex`, which needs TikZ, the `standalone` class, `fontspec` and the DejaVu Sans font (on Ubuntu: `texlive-luatex`, `texlive-latex-recommended`, `texlive-latex-extra`, `texlive-pictures`, `fonts-dejavu-core`). Without `lualatex` the test is skipped; set `TILIE_REQUIRE_LUALATEX=1` to make its absence a failure, as the `tikz` CI job does.

The SVG and TikZ fixtures that pin the drawing belong to timeskeleton; there is no geometry schema from 0.4.0 on, and the geometry JSON is internal to TiLiE. After a change to `layout` or the writers that the geometry specification calls for, write them from `app/packages/writers/` with `node scripts/emit-geometry.ts /path/to/timeskeleton` and review the diff there. The script writes `figure.svg` and `figure.tex` of every manifest under `fixtures/<version>/drawings/<name>/`, and nothing unless `layout` reproduces each hand-derived SVG that `fixtures/<version>/drawings/README.md` lists; it refuses a version without that README, a version whose tag exists, and 0.3.0, whose fixtures are frozen. timeskeleton has no drawings for 0.4.0 yet, so today the script writes nothing.

Each package and the server has a `tests/README.md`. Update the appropriate readme first with the validation logic and exact expected values, then write the test.

## Dependencies

Add an ADR in [`decisions/`](decisions/) before adding a dependency. The record must use the repository's MADR structure, compare writing it ourselves, identify the audited version, and set a review date.

Package manifests declare compatible ranges for runtime and peer dependencies, such as `fastapi>=0.141,<1` and `uvicorn[standard]>=0.53,<1` in the server and the optional peer `yjs` `^13.6.33` in `app/packages/core`; development dependencies, the npm `devDependencies` and the server's `dev` group, are pinned exactly. The lockfiles, `server/uv.lock` and `app/pnpm-lock.yaml`, pin every resolved version. Enter only versions released at least 14 days before they enter a lockfile, and name the audited version in its ADR; the one exception to that window is this project's own schema package, `@timetoalign/timeskeleton` (`minimumReleaseAgeExclude` in `app/pnpm-workspace.yaml`). This is the dependency policy; do not treat a compatible manifest range as an error by itself.

## Packages

The ladder is enforced by [`app/.dependency-cruiser.cjs`](app/.dependency-cruiser.cjs): core has no workspace dependency; layout and client may depend on core; writers may depend on layout and core; arranger may depend on writers, layout and core; editor may depend on every workspace package. Only arranger and editor may import Svelte.

When adding a package, first establish a present need. Add its permitted edges to the dependency-cruiser configuration and the workspace ladder tests, keep it below the packages that consume it, and write its test readme before behavior tests. Do not put UI, DOM, or transport code into core.

## Known Limitations

The editor component test mounts the shell and checks its headings, health request, and displayed result. It covers the token taken from the URL fragment and cleared from the address bar, and the absent token (no fragment, so an empty bearer header is sent). It does not verify CSS grid layout, mobile rendering, or a fragment that carries an empty token (`#token=`). The server static-file tests do not exercise traversal behavior. Treat these gaps as test coverage to improve when their behavior is changed.

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
