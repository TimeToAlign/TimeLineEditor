---
status: accepted
date: 2026-10-09
---

# Bundle the built editor inside the wheel

## Context

Installing tilie-server must include the browser app without requiring Node or downloads at runtime.

## Considered options

- A hatchling build hook: copy the editor bundle into the Python package before packaging.
- A separate static package: two artifacts to version and install together.
- Runtime downloads: add network requirements and possible app/server mismatches.
- An npm-published app: requires an additional toolchain for users.
- Write it ourselves: a short copy hook is appropriate; writing a wheel builder is not. Use the standard backend for archives and metadata.

## Decision

Use `server/hatch_build.py` with hatchling's custom hook API. Copy `../app/packages/editor/dist` into the ignored `src/tilie_server/static`. Wheel builds fail clearly without an index. Source checkouts must not reuse a stale static copy when the app build is missing. Editable installs skip bundling so server tests can run before building the app.

The sdist includes the built static copy when available; a wheel built from that sdist uses it without Node. A source-only sdist may omit static, but cannot produce a complete wheel until an app bundle is supplied.

CI builds the app first, downloads its artifact into the server job, builds distributions, lists wheel contents, installs into a clean environment and runs `tilie --check`. The tag workflow checks `--tag vX.Y.Z` against both manifests and publishes through PyPI OIDC with environment `pypi`. No stored publishing token is used.

## Maintenance and dependencies

The copy hook is maintained by TimeLineEditor contributors, currently a small maintainer pool led by Johannes Hentschel; its bus factor is low but it is ordinary Python file copying. It changes only with layout/build changes. Its licence is MIT, size is one small module, and it adds no dependency beyond hatchling (0009) and the standard library.

GitHub maintains checkout, setup-node and artifact actions; pnpm maintains action-setup; Astral maintains setup-uv; PyPA maintains gh-action-pypi-publish. Each organisation has multiple contributors, with action-specific expertise concentrated in smaller teams. Action updates are event-driven with periodic majors; workflows select major refs, and pnpm reads `packageManager`. The GitHub, pnpm and Astral actions use MIT licensing; gh-action-pypi-publish uses BSD-3-Clause. They are CI-only dependencies: Node actions bring their bundled JavaScript clients; the PyPI action brings a container and Python publishing tools. They add no wheel runtime size. Renovate is a service maintained by Mend and contributors (AGPL-3.0), with frequent releases; its JSON configuration adds no installed package.

Primary sources: <https://hatch.pypa.io/latest/plugins/build-hook/custom/>, <https://hatch.pypa.io/latest/config/build/#artifacts>, <https://github.com/actions/checkout>, <https://github.com/actions/setup-node>, <https://github.com/actions/upload-artifact>, <https://github.com/actions/download-artifact>, <https://github.com/pnpm/action-setup>, <https://github.com/astral-sh/setup-uv>, <https://github.com/pypa/gh-action-pypi-publish>, <https://docs.pypi.org/trusted-publishers/>, <https://github.com/renovatebot/renovate>.


## Consequences

Users install one self-contained artifact. The builder needs a compiled app, and stale-output checks prevent incomplete wheels. Exit cost is replacing one hook and the workflow artifact handoff; static serving stays unchanged.

## Review date

2027-04-09, or sooner if the selected tools stop supporting the pinned toolchain.
