---
status: accepted
date: 2026-10-09
---

# Build the editor with Svelte 5 and Vite

## Context

The browser app needs a status request and three fixed panes, built into static files for a Python wheel.

## Considered options

- Svelte 5 with Vite: compiled components, runes and integrated tooling.
- React 19 with Vite: broad ecosystem, with runtime rendering conventions unnecessary for this shell.
- Vue 3.5 with Vite: capable component system, but introduces another component dialect without a local advantage.
- Vanilla TypeScript / write it ourselves: adequate for three panes, but manual reactive status updates and component cleanup would become our responsibility.

## Decision

Use Svelte 5.57.1, Vite 8.3.1, @sveltejs/vite-plugin-svelte 7.3.1 and svelte-check 4.7.6. `App.svelte` uses `$state`, CSS grid and `onMount`; it requests authenticated health and lists the five library names. No UI library is needed. Vite uses `base: "./"` and writes `packages/editor/dist`.

Only arranger and editor may import Svelte. Component tests resolve Svelte under the browser condition. Svelte checking covers types and compiler accessibility warnings.

## Maintenance and dependencies

Svelte's maintainers include Rich Harris, Conduitry and the sveltejs team; Simon Holthausen maintains language tools with contributors. Vite's team includes Evan You and contributors. There are multiple publishers, but compiler and language-tool expertise is concentrated. Both projects release frequent fixes and periodic breaking majors, so pins and compatibility checks matter. Transitive tools include parsers, source maps, CSS processing and platform-specific Rolldown binaries; only the compiled runtime reaches the browser.

Primary sources: <https://svelte.dev/docs/svelte/overview>, <https://svelte.dev/docs/svelte/$state>, <https://github.com/sveltejs/language-tools>, <https://vite.dev/guide/>, <https://github.com/sveltejs/vite-plugin-svelte>.

Registry metadata checked on 2026-10-09. Sizes below are package bytes, not installed graphs: npm unpacked bytes; PyPI smallest release artifact. The lockfiles record the complete transitive graphs. Bus-factor assessments are qualitative; publisher counts do not prove how many people can maintain a project.

| Dependency | Release date | Licence | Size (bytes) | Direct dependency footprint |
|---|---|---|---:|---|
| svelte 5.57.1 | 2026-09-18 | MIT | 2,941,384 | clsx, acorn, esrap, devalue, esm-env, aria-query, zimmerframe, is-reference, magic-string, @types/estree, axobject-query, locate-character, @jridgewell/remapping, @sveltejs/acorn-typescript, @jridgewell/sourcemap-codec |
| vite 8.3.1 | 2026-09-24 | MIT | 2,375,009 | postcss, rolldown, picomatch, tinyglobby, lightningcss |
| @sveltejs/vite-plugin-svelte 7.3.1 | 2026-09-23 | MIT | 148,026 | obug, vitefu, deepmerge, magic-string |
| svelte-check 4.7.6 | 2026-08-13 | MIT | 5,485,151 | fdir, sade, chokidar, picocolors, @sveltejs/load-config, @jridgewell/trace-mapping |

Primary package metadata: <https://registry.npmjs.org/svelte>, <https://registry.npmjs.org/vite>, <https://registry.npmjs.org/@sveltejs/vite-plugin-svelte>, <https://registry.npmjs.org/svelte-check>.

## Consequences

The shell has a small explicit component surface and one build command. Native bundler dependencies increase install size. Exit cost is rewriting components and build configuration; the five name-export packages remain framework independent.

## Review date

2027-04-09, or sooner if the selected tools stop supporting the pinned toolchain.
