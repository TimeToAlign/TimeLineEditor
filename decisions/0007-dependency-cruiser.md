---
status: accepted
date: 2026-10-09
---

# Enforce the package ladder with dependency-cruiser

## Context

Package declarations alone cannot stop relative imports that point upwards in the ladder.

## Considered options

- dependency-cruiser: resolves imports, detects circular dependencies and emits named violations.
- eslint-plugin-boundaries: good boundary rules, but requires introducing ESLint.
- Write it ourselves: a regex scanner misses re-exports, type imports and resolver behaviour; a correct resolver and graph walker would be substantial maintenance.

## Decision

Use dependency-cruiser 18.4.0. Core imports no other workspace package; layout imports core; writers and arranger import layout/core; client imports core; editor may import all. Only arranger/editor may import Svelte. Circular dependencies are forbidden. Rules recognise resolved package paths and unresolved bare and relative specifiers.

Core also rejects known DOM-only module families and `.svelte` components. Omitting DOM from its TypeScript libraries rejects direct DOM globals; the named module rule covers import-only violations that type checking would miss. New DOM-specific dependencies must extend the rule as needed.

Scratch tests prove every ladder edge, relative targets that exist or are missing, Svelte resolution and subpaths, DOM-only imports and circular imports. `pnpm lint` checks sources and tests.

## Maintenance and dependencies

Sander Verweij leads dependency-cruiser; the registry also lists foureightone. Bus-factor risk is concentrated despite multiple publishers. Releases are regular, often monthly, with parser and resolver updates. MIT licensing and declarative configuration make replacement possible. Its 18 direct dependencies expand transitively into parsers, enhanced-resolve, filesystem helpers and CLI utilities; this is development tooling only.

Primary sources: <https://github.com/sverweij/dependency-cruiser>, <https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md>, <https://github.com/javierbrea/eslint-plugin-boundaries>.

Registry metadata checked on 2026-10-09. Sizes below are package bytes, not installed graphs: npm unpacked bytes; PyPI smallest release artifact. The lockfiles record the complete transitive graphs. Bus-factor assessments are qualitative; publisher counts do not prove how many people can maintain a project.

| Dependency | Release date | Licence | Size (bytes) | Direct dependency footprint |
|---|---|---|---:|---|
| dependency-cruiser 18.4.0 | 2026-09-20 | MIT | 1,034,925 | acorn, json5, ignore, semver, prompts, rechoir, acorn-jsx, commander, interpret, picomatch, acorn-walk, safe-regex, watskeburt, acorn-loose, acorn-jsx-walk, enhanced-resolve, is-installed-globally, tsconfig-paths-webpack-plugin |

Primary package metadata: <https://registry.npmjs.org/dependency-cruiser>.

## Consequences

Violations are concrete CI failures, including unresolved forbidden imports. Rules need upkeep when new module families enter. Exit cost is replacing the resolver and graph checks while preserving the scratch-test contract.

## Review date

2027-04-09, or sooner if the selected tools stop supporting the pinned toolchain.
