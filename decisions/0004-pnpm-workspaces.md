---
status: accepted
date: 2026-10-09
---

# Use pnpm workspaces

## Context

Six private packages need local links, one dependency lock and repeatable commands.

## Considered options

- pnpm workspaces: workspace links, isolated dependency layout and release-age controls.
- npm workspaces: familiar bundled tool, but a different hoisting model.
- Yarn: workspace support, with additional resolver conventions to choose.
- Turborepo or Nx: useful task graphs and caching, unnecessary for one app build.
- Write it ourselves: scripts could create links, but would duplicate resolution, integrity checks and lock handling.

## Decision

Use pnpm 12.10.1 in `packageManager`, `packages/*` in the workspace file and `workspace:*` links. Root scripts run lint, strict type checking, tests and the editor build. CI installs the frozen lockfile. Root development tools are shared; isolation alone is not the ladder enforcement mechanism (0007).

The explicitly required pnpm version was released only three days before this decision; its version is retained as a toolchain exception. Application dependencies still observe the fourteen-day window.

## Maintenance and dependencies

Zoltan Kochan and the pnpm organisation maintain pnpm. Multiple contributors support it, with substantial lead-maintainer concentration. Releases are frequent. The npm distribution is MIT and bundles its implementation rather than declaring runtime dependencies. npm is maintained by GitHub, Yarn by its core team, Turborepo by Vercel and Nx by the Nx team; adding any task runner would introduce another upgrade surface.

Primary sources: <https://pnpm.io/workspaces>, <https://pnpm.io/pnpm-workspace_yaml>, <https://pnpm.io/settings#minimumreleaseage>, <https://github.com/pnpm/pnpm>, <https://github.com/pnpm/action-setup>.

Registry metadata checked on 2026-10-09. Sizes below are package bytes, not installed graphs: npm unpacked bytes; PyPI smallest release artifact. The lockfiles record the complete transitive graphs. Bus-factor assessments are qualitative; publisher counts do not prove how many people can maintain a project.

| Dependency | Release date | Licence | Size (bytes) | Direct dependency footprint |
|---|---|---|---:|---|
| pnpm 12.10.1 | 2026-10-06 | MIT | 4,134,710 | No runtime package dependencies |

Primary package metadata: <https://registry.npmjs.org/pnpm>.

## Consequences

One lockfile makes local and CI installs comparable. Contributors need the pinned tool. Exit cost is translating workspace links and scripts and regenerating a lockfile with npm or Yarn.

## Review date

2027-04-09, or sooner if the selected tools stop supporting the pinned toolchain.
