---
status: accepted
date: 2026-10-10
---

# Depend on `@timetoalign/timetoshare` for the schema and fixtures

## Context

A TiLiE manifest is a TimeToShare manifest. Its JSON Schema, the validator, the complete and minimal forms, the lossless reader and the standard writer, and the golden fixtures are published from the TimeToAlign/TimeToShare repository on npm and PyPI, and the Python side of TimeToAlign reads the same files. `core` must validate on load and save and prove its writer against the fixtures.

## Considered options

- Depend on the published `@timetoalign/timetoshare` package: `validate`, `SCHEMA_VERSION`, the generated types, the reader and writer, and the shipped `fixtures/`.
- Copy the schema into this repository and validate with our own Ajv setup: two copies of the contract that drift.
- Write a validator ourselves: re-implements JSON Schema 2020-12 for one schema, including the shared rule for which violation path is reported.

## Decision

Depend on `@timetoalign/timetoshare` with a manifest range. The package was audited at 0.3.0 under its former name `@timetoalign/timeskeleton`, which it carried up to 0.6.0; as `@timetoalign/timetoshare` its versions restart at 0.1.0. `core` writes no JSON and no ordering of its own: it reads manifests with the package's `parseJson` (lossless), validates them with `validate`, which refuses any version other than the current one, writes them with `dumps` (canonical order, the standard text that the Python writer also produces), keeps the canonical order of edited timelines with `canonicalOrder`, and builds its coordinates on the package's `JsonNumber` and `JsonFloat`. It migrates nothing. Its tests read the manifest fixtures of `fixtures/<version>/` with their minimal twins, `fixtures/rejections/` and `fixtures/warnings/` from the installed package.

Every package that uses the schema, `core`, `layout`, `writers`, `arranger` and `editor`, depends on it in the same form. While TiLiE is built against a schema version that is not yet released, that form is a committed `link:` to the `js/` directory of a TimeToShare checkout beside this repository (`link:../../../../TimeToShare/js`), and the repository is not published in that state. Once that schema version is released, the `link:` is replaced by a compatible range from npm.

The package is exempted from the fourteen-day release-age window (`minimumReleaseAgeExclude` in `app/pnpm-workspace.yaml`): it is the contract this project and the library publish together, and TiLiE must be able to consume a schema release as soon as it exists. Every other dependency keeps the window.

The package requires Node 22.18 or later, so the workspace engines field is raised to `>=22.18`.

## Maintenance and dependencies

`@timetoalign/timetoshare` is published by the TimeToAlign maintainers under the MIT licence; most of its size is fixtures and generated schema. Its one runtime dependency is Ajv 8.20.0 (released 2026-04-24, MIT, 1,033,496 bytes unpacked; maintainers Evgeny Poberezkin and Blake Embrey; dependencies fast-deep-equal, fast-uri, json-schema-traverse, require-from-string).

Primary sources: <https://github.com/TimeToAlign/TimeToShare>, <https://registry.npmjs.org/ajv>, <https://github.com/ajv-validator/ajv>.

## Consequences

The schema has one home and both languages read it. A schema release changes TiLiE only through a version bump of this dependency and the fixture round trips that come with it. Exit cost: the package is ours; leaving it would mean vendoring the schema and its validator.

## Review date

2027-04-10, or at every schema release.
