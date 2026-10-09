---
status: accepted
date: 2026-10-09
---

# Test with Vitest and Svelte mounting utilities

## Context

Name exports, dependency rules and the Svelte shell need deterministic automated tests.

## Considered options

- Vitest: uses the Vite compilation pipeline and workspace projects.
- Jest: familiar assertions, but a separate Svelte transformation setup.
- node:test: no runner dependency, but component compilation needs additional wiring.
- Svelte mount/unmount/flushSync with jsdom: public utilities sufficient for the current component.
- @testing-library/svelte: useful accessible queries, unnecessary for these text assertions.
- Write it ourselves: assertions and DOM simulation would recreate mature test infrastructure.

## Decision

Use Vitest 5.0.1 and jsdom 30.1.1, with Svelte's public `mount`, `unmount` and `flushSync` as the component-test utility. This is the documented Svelte testing path and adds no wrapper package. Each library has one name test. The component tests verify the panes, footer, authenticated health request and error display.

The workspace tests execute dependency-cruiser in disposable scratch directories. DOM tests stub fetch and clean up after each test. Vite's browser resolution condition selects Svelte's mount-capable runtime.

## Maintenance and dependencies

Vitest's publishers include Anthony Fu, Ari Perkkio, Hiroshi Ogawa and Evan You. jsdom's include Domenic Denicola, Timothy Gu and Sebastian Mayr. Both have several contributors, with browser emulation expertise concentrated in fewer maintainers. Vitest releases frequent fixes and periodic majors; jsdom releases track web-platform and Node changes. Both are MIT. Vitest adds assertions and runner helpers; jsdom adds HTML, XML, URL and CSS parsers, cookies and networking support. It is a dev-only cost.

Primary sources: <https://vitest.dev/guide/projects>, <https://svelte.dev/docs/svelte/testing>, <https://github.com/jsdom/jsdom>, <https://github.com/vitest-dev/vitest>.

Registry metadata checked on 2026-10-09. Sizes below are package bytes, not installed graphs: npm unpacked bytes; PyPI smallest release artifact. The lockfiles record the complete transitive graphs. Bus-factor assessments are qualitative; publisher counts do not prove how many people can maintain a project.

| Dependency | Release date | Licence | Size (bytes) | Direct dependency footprint |
|---|---|---|---:|---|
| vitest 5.0.1 | 2026-09-15 | MIT | 2,736,905 | chai, obug, std-env, tinyexec, picomatch, tinybench, tinyglobby, @types/chai, expect-type, magic-string, @vitest/mocker, es-module-lexer, why-is-node-running |
| jsdom 30.1.1 | 2026-09-22 | MIT | 7,142,894 | saxes, parse5, undici, css-tree, data-urls, lru-cache, decimal.js, whatwg-url, tough-cookie, @exodus/bytes, whatwg-mimetype, w3c-xmlserializer, webidl-conversions, xml-name-validator, @bramus/specificity, @asamuzakjp/css-color, html-encoding-sniffer, @asamuzakjp/dom-selector, is-potential-custom-element-name, @csstools/css-syntax-patches-for-csstree |

Primary package metadata: <https://registry.npmjs.org/vitest>, <https://registry.npmjs.org/jsdom>.

## Consequences

Tests compile components using app tooling. jsdom cannot prove real-browser layout. Exit cost is replacing runner imports and the DOM harness; assertions and public Svelte APIs remain reusable.

## Review date

2027-04-09, or sooner if the selected tools stop supporting the pinned toolchain.
