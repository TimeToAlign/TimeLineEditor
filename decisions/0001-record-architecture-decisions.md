---
status: accepted
date: 2026-10-09
---

# Record architecture decisions

## Context

The repository needs durable reasons for tool choices, including their maintenance and removal costs.

## Considered options

- MADR: named options, decision and consequences in ordinary Markdown.
- Nygard records: shorter, but no explicit options comparison.
- One decision log: easy to start, harder to navigate and edit concurrently.
- Write it ourselves: a custom template has no dependency, but requires inventing and maintaining conventions.

## Decision

Use MADR-shaped documents under `decisions/`, with Context, Considered options, Decision, Consequences and Review date. Record present needs, primary sources, maintenance risk, licence, size, transitive dependencies and exit cost. No template package is installed.

Pin direct tools and retain lockfiles. Package releases must be at least fourteen days old: pnpm uses `minimumReleaseAge: 20160`, uv uses the fixed `2026-09-25` cutoff, and Renovate applies a fourteen-day window. The required pnpm 12.10.1 toolchain is an explicit exception: published 2026-10-06. The required `timetoalign>=1.2.0` runtime range remains a range; `uv.lock` fixes the development installation.

## Maintenance and dependencies

MADR is maintained by the adr organisation, including Oliver Kopp and contributors. Its small maintainer group presents concentration risk, but the adopted text has no runtime dependency or upgrade requirement. Template releases are occasional; local records change with decisions. MADR's template is CC0-1.0 and its tooling MIT; we use the structure only. Size is ten text records, with no transitive dependencies.

Primary sources: <https://adr.github.io/madr/>, <https://github.com/adr/madr>, <https://pnpm.io/settings#minimumreleaseage>, <https://docs.astral.sh/uv/reference/settings/#exclude-newer>, <https://docs.renovatebot.com/configuration-options/#minimumreleaseage>.


## Consequences

Contributors can review choices independently of their authors. Records require upkeep. Exit cost is editing headings; there is no tool migration.

## Review date

2027-04-09, or sooner if the selected tools stop supporting the pinned toolchain.
