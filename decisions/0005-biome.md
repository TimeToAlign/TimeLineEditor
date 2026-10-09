---
status: accepted
date: 2026-10-09
---

# Lint and format with Biome

## Context

TypeScript and configuration files need one consistent formatting and lint command.

## Considered options

- Biome: one formatter, import organiser and linter.
- ESLint + Prettier: broader plugin support, more packages and configuration.
- Write it ourselves: formatting requires syntax-aware rewriting and lint rules require analysis; neither is product work.

## Decision

Use @biomejs/biome 2.5.14 with recommended rules, spaces, double quotes and line width 100. `pnpm lint` runs `biome ci` and dependency-cruiser; `pnpm format` applies changes.

The Svelte override disables unused-import and unused-variable diagnostics that cannot account for markup references; `svelte-check --fail-on-warnings` is the component check. Generated files and the lockfile are excluded.

## Maintenance and dependencies

Biome's maintainers include Emanuele Stoppa, Nicolas Hedger, conaclos, dominionl and siketyan. Several maintainers reduce individual concentration, but Rust tooling remains specialised. Patch releases are frequent; major releases may change formatting. It is MIT OR Apache-2.0. The npm wrapper adds a platform binary through optional dependencies rather than a JavaScript plugin graph. ESLint and Prettier each have separate contributor teams and MIT licensing.

Primary sources: <https://github.com/biomejs/biome>, <https://biomejs.dev/internals/language-support/>, <https://biomejs.dev/reference/configuration/>.

Registry metadata checked on 2026-10-09. Sizes below are package bytes, not installed graphs: npm unpacked bytes; PyPI smallest release artifact. The lockfiles record the complete transitive graphs. Bus-factor assessments are qualitative; publisher counts do not prove how many people can maintain a project.

| Dependency | Release date | Licence | Size (bytes) | Direct dependency footprint |
|---|---|---|---:|---|
| @biomejs/biome 2.5.14 | 2026-09-16 | MIT OR Apache-2.0 | 779,173 | No runtime package dependencies |

Primary package metadata: <https://registry.npmjs.org/@biomejs/biome>.

## Consequences

One command handles style and common mistakes. Component markup coverage is limited. Exit cost is replacing configuration and reformatting once; application code has no Biome imports.

## Review date

2027-04-09, or sooner if the selected tools stop supporting the pinned toolchain.
