---
status: accepted
date: 2026-10-09
---

# Use strict TypeScript

## Context

The five library packages and editor need checked interfaces and one ESM source language.

## Considered options

- TypeScript: static checks and native support from Svelte and Vite.
- JavaScript with JSDoc: fewer syntax constructs, more verbose type declarations.
- Write it ourselves: a custom type checker or transpiler would duplicate established compiler work without a present benefit.

## Decision

Use TypeScript 6.0.3 with strict checking, unchecked-index and exact-optional checks. Library sources export only their package name. Core, layout, writers and client omit the DOM library. The editor uses `svelte-check`; workspace tests and each library use `tsc`.

Use `@types/node` 22.20.4 only where test and tool code needs Node APIs; the base configuration has `types: []`. Its `undici-types` dependency supplies declarations and adds no application runtime.

## Maintenance and dependencies

Microsoft maintains TypeScript with multiple compiler contributors, including Wesley Wigham and Jake Bailey. DefinitelyTyped and Microsoft maintain Node declarations. Both have several maintainers, reducing individual concentration, though compiler direction is institution-dependent. TypeScript has periodic feature releases and patches; declaration updates track Node changes. The compiler has no runtime dependencies; declarations add undici-types.

Primary sources: <https://github.com/microsoft/TypeScript>, <https://www.typescriptlang.org/tsconfig/strict.html>, <https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/node>.

Registry metadata checked on 2026-10-09. Sizes below are package bytes, not installed graphs: npm unpacked bytes; PyPI smallest release artifact. The lockfiles record the complete transitive graphs. Bus-factor assessments are qualitative; publisher counts do not prove how many people can maintain a project.

| Dependency | Release date | Licence | Size (bytes) | Direct dependency footprint |
|---|---|---|---:|---|
| typescript 6.0.3 | 2026-04-16 | Apache-2.0 | 24,346,827 | No runtime package dependencies |
| @types/node 22.20.4 | 2026-09-19 | MIT | 2,438,105 | undici-types |

Primary package metadata: <https://registry.npmjs.org/typescript>, <https://registry.npmjs.org/@types/node>.

## Consequences

Type errors fail CI before bundling. Compiler upgrades must remain compatible with Svelte tooling. Exit cost: erase annotations and replace the checks; the ESM code remains usable.

## Review date

2027-04-09, or sooner if the selected tools stop supporting the pinned toolchain.
