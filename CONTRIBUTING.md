# Contributing to TiLiE

TiLiE is a pnpm TypeScript workspace with a Svelte 5 application and a separate Python server. The application is currently a shell, so contributions should preserve the package boundaries and document exactly what a new behavior proves.

## Setup

Install Node.js 22.12 or newer, pnpm 12.10.1, Python 3.11 or newer, and uv. Then prepare both parts of the repository:

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

Each package and the server has a `tests/README.md`. Update the appropriate readme first with the validation logic and exact expected values, then write the test.

## Dependencies

Add an ADR in [`decisions/`](decisions/) before adding a dependency. The record must use the repository's MADR structure, compare writing it ourselves, identify the audited version, and set a review date.

The published server manifest declares compatible ranges for its runtime and build dependencies, such as `fastapi>=0.141,<1` and `uvicorn[standard]>=0.53,<1`, and pins the development tools of its `dev` group exactly; the private app workspace, bundled into the wheel, pins exact versions. The lockfiles, `server/uv.lock` and `app/pnpm-lock.yaml`, pin the resolved versions. Enter only versions released at least 14 days before they enter a lockfile, and name the audited version in its ADR. This is the dependency policy; do not treat a compatible manifest range as an error by itself.

## Packages

The ladder is enforced by [`app/.dependency-cruiser.cjs`](app/.dependency-cruiser.cjs): core has no workspace dependency; layout and client may depend on core; writers and arranger may depend on layout and core; editor may depend on every workspace package. Only arranger and editor may import Svelte.

When adding a package, first establish a present need. Add its permitted edges to the dependency-cruiser configuration and the workspace ladder tests, keep it below the packages that consume it, and write its test readme before behavior tests. Do not put UI, DOM, or transport code into core.

## Known Limitations

The editor component test mounts the shell and checks its headings, health request, and displayed result. It covers the token taken from the URL fragment and cleared from the address bar, and the absent token (no fragment, so an empty bearer header is sent). It does not verify CSS grid layout, mobile rendering, or a fragment that carries an empty token (`#token=`). The server static-file tests do not exercise traversal behavior. Treat these gaps as test coverage to improve when their behavior is changed.

## Release

1. Set the same version in `server/pyproject.toml` and `app/package.json`.
2. From the repository root, run `python3 scripts/check_versions.py --tag vX.Y.Z`.
3. Tag the matching version and publish the tag.

The `release.yml` workflow checks the tag, installs the locked app dependencies, lints, type-checks, tests, builds the app, installs locked server dependencies, tests, builds the distributions, verifies that the wheel contains `index.html`, and publishes the wheel through PyPI OpenID Connect.

Before the first release, a maintainer configures this PyPI trusted publisher once:

| Setting | Value |
| --- | --- |
| Project name | `tilie-server` |
| Owner | `TimeToAlign` |
| Repository | `TimeLineEditor` |
| Workflow file name | `release.yml` |
| Environment name | `pypi` |

Use PyPI's [trusted-publisher instructions](https://docs.pypi.org/trusted-publishers/adding-a-publisher/) to configure it. The repository does not use a stored PyPI publishing token.
