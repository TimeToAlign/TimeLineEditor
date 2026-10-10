---
status: accepted
date: 2026-10-10
---

# Depend on `@timetoalign/timeskeleton` for the schema, migrations and fixtures

## Context

A TiLiE document is a TimeSkeleton document. Its JSON Schema, the validator, the migrations between schema versions and the golden fixtures are published from the TimeToAlign/timeskeleton repository on npm and PyPI, and the Python side of TimeToAlign reads the same files. `core` must validate on load and save, migrate older documents, and prove its writer against the fixtures.

## Considered options

- Depend on the published `@timetoalign/timeskeleton` package: `validate`, `migrate`, `SCHEMA_VERSION`, the generated types and the shipped `fixtures/`.
- Copy the schema into this repository and validate with our own Ajv setup: two copies of the contract that drift.
- Write a validator ourselves: re-implements JSON Schema 2020-12 for one schema, including the shared rule for which violation path is reported.

## Decision

Depend on `@timetoalign/timeskeleton` with a manifest range (0.2.1 audited). `core` writes no JSON and no ordering of its own: it reads documents with the package's `parse` (lossless, and checked against the declared schema version), migrates them with `migrate`, validates with `validate`, writes them with `dumps` (canonical order, the standard text that the Python writer also produces), keeps the canonical order of edited timelines with `canonicalOrder`, stores atomic values in Yjs as `compactJson` text read back with `parseJson`, and builds its coordinates on the package's `JsonNumber` and `JsonFloat`. Its tests read `fixtures/<version>/`, `fixtures/rejections/` and `fixtures/migrations/` from the installed package.

While a schema release is being prepared, the workspace depends on the sibling checkout through `link:` (built with its own `pnpm build`); the released range replaces the link.

The package is exempted from the fourteen-day release-age window (`minimumReleaseAgeExclude` in `app/pnpm-workspace.yaml`): it is the contract this project and the library publish together, and TiLiE must be able to consume a schema release as soon as it exists. Every other dependency keeps the window.

The package requires Node 22.18 or later, so the workspace engines field is raised to `>=22.18`.

## Maintenance and dependencies

`@timetoalign/timeskeleton` is published by the TimeToAlign maintainers (0.2.0 released 2026-10-10, MIT, 764,114 bytes unpacked, most of it fixtures and generated schema; 0.2.1, which adds the lossless reader, the writer and the canonical order, is consumed from the sibling checkout until it is released). Its one runtime dependency is Ajv 8.20.0 (released 2026-04-24, MIT, 1,033,496 bytes unpacked; maintainers Evgeny Poberezkin and Blake Embrey; dependencies fast-deep-equal, fast-uri, json-schema-traverse, require-from-string).

Primary sources: <https://registry.npmjs.org/@timetoalign/timeskeleton>, <https://github.com/TimeToAlign/timeskeleton>, <https://registry.npmjs.org/ajv>, <https://github.com/ajv-validator/ajv>.

## Consequences

The schema has one home and both languages read it. A schema release changes TiLiE only through a version bump of this dependency and the fixture round trips that come with it. Exit cost: the package is ours; leaving it would mean vendoring the schema and its validator.

## Review date

2027-04-10, or at every schema release.
