---
status: accepted
date: 2026-10-12
---

# Test the editor end to end with Playwright, inside its image

## Context

The arranger's behaviour (drag, snap, marquee, resize handles, keyboard
moves, touch, culling, panning) happens in a real browser and depends on
layout, pointer events and focus, which jsdom does not provide. It has to be
checked in the three engines users run (Blink, Gecko, WebKit) and with touch
input. Screenshots of block drawings are compared with zero tolerance, so the
browser builds and fonts that render them must be identical on every machine
that creates or checks a baseline.

## Considered options

- Playwright 1.63.0 (`@playwright/test`), Apache-2.0: one runner for Chromium,
  Firefox and WebKit, device emulation with touch, `toHaveScreenshot`, a
  managed web server, and an official container image per version with the
  browsers and their system libraries.
- Cypress 16.1.1, MIT: Chromium-family and Firefox; WebKit support is
  experimental; tests run inside the page, which complicates multi-step
  pointer gestures.
- WebdriverIO 10.0.2, MIT: all engines through WebDriver, but Safari only on
  macOS, and no built-in pixel comparison.
- Vitest browser mode: uses Playwright underneath for real browsers and is
  aimed at component tests, not at the built application.
- Write it ourselves over the Chrome DevTools Protocol: Chromium only.

Scores run from 1 (least suitable) to 5 (most suitable).

| Criterion | Playwright | Cypress | WebdriverIO | Own code |
| --- | ---: | ---: | ---: | ---: |
| Maintenance cost | 5 | 4 | 4 | 1 |
| Size and transitive dependencies | 4 | 2 | 2 | 5 |
| Licence | 5 | 5 | 5 | 5 |
| Fit (three engines, touch, screenshots, gestures) | 5 | 2 | 3 | 1 |
| Exit cost | 3 | 3 | 3 | 5 |
| **Total** | **22** | **16** | **17** | **17** |

## Decision

Use `@playwright/test` 1.63.0 (pinned exactly). 1.64.0 (2026-10-07) is not
yet 14 days old.

`app/playwright.config.ts` defines six projects over `app/e2e/*.spec.ts`:

| Project | Engine | Selects |
| --- | --- | --- |
| `chromium`, `firefox`, `webkit` | Desktop Chrome, Firefox, Safari at 1280 × 800 | every spec except `touch.spec.ts`, without `@visual` and `@budget` |
| `touch` | Chromium as Pixel 7, `hasTouch`, `isMobile` | `touch.spec.ts` only |
| `visual` | Desktop Chrome | `@visual` only; `toHaveScreenshot` with `maxDiffPixels: 0`, `threshold: 0` |
| `budget` | Desktop Chrome | `@budget` only |

The web server builds the editor with `VITE_TILIE_TEST_HOOK=1` and serves it
with `vite preview` on `127.0.0.1:4317`; `workers: 2`. Baselines are stored at
`app/e2e/__screenshots__/<spec file>/<name>.png`, with no platform suffix,
because only one platform creates them.

Every run happens inside `mcr.microsoft.com/playwright:v1.63.0-noble`.
`app/e2e/run.ts` starts Playwright directly when it is already inside the
image (CI) and otherwise re-runs itself through rootless podman with the app
directory mounted at its own path, `--network=host` and `--ipc=host`; the
image tag is derived from the installed `@playwright/test` version, so the two
cannot drift.

| Script | Projects |
| --- | --- |
| `pnpm e2e` | `chromium`, `firefox`, `webkit`, `touch` |
| `pnpm e2e:budget` | `budget` |
| `pnpm e2e:visual` | `visual` |
| `pnpm e2e:visual:update` | `visual`, rewriting the baselines |

CI runs `pnpm e2e` in a job whose container is the same image; the `visual`
project is not run in CI. Vitest's include patterns (`tests/**/*.test.ts`)
never select `*.spec.ts`.

Update 2026-10-18: `pnpm e2e` runs the `chromium` project only, the quick
local run; the new `pnpm e2e:all` runs `chromium`, `firefox`, `webkit` and
`touch` (the former `pnpm e2e`), and CI runs `pnpm e2e:all`. The number of
workers comes from `TILIE_E2E_WORKERS` (a positive integer, default 4)
instead of the fixed 2; `run.ts` passes the variable into the container when
it is set.

Why everything runs in the image: on hosts other than Ubuntu and Debian,
Playwright's WebKit build lacks system libraries (on an Arch-based host
1.63.0 reports missing `libicu74`, `libxml2` and `libflite1` and refuses to
start), while Chromium and Firefox start natively. Running the whole suite
in the image keeps one environment for all engines and for screenshots.
Developers may still run Chromium or Firefox natively for debugging with
`pnpm exec playwright test --project=chromium --headed`.

Verified on 2026-10-12: in the image, Chromium 153.0.8010.12, Firefox 155.0,
WebKit 26.6 and the touch project (`navigator.maxTouchPoints` 1) launched;
`playwright --version` in the image prints 1.63.0.

## Maintenance and dependencies

Playwright is developed by Microsoft; the npm publishers include Pavel
Feldman, Yury Semikhatsky and Dmitry Gozman, with a large contributor base. It
releases a minor version roughly every four to six weeks (1.60.0 on
2026-05-11, 1.61.0 on 2026-06-15, 1.62.0 on 2026-07-24, 1.63.0 on 2026-09-04,
1.64.0 on 2026-10-07), each with new browser builds; the image tag and the
lockfile move together.

Registry metadata checked on 2026-10-12 (unpacked bytes):

| Package | Release | Licence | Size (bytes) | Dependencies |
| --- | --- | --- | ---: | --- |
| `@playwright/test` 1.63.0 | 2026-09-04 | Apache-2.0 | 28,544 | `playwright` 1.63.0 |
| `playwright` 1.63.0 | 2026-09-04 | Apache-2.0 | | `playwright-core` 1.63.0 |
| `playwright-core` 1.63.0 | 2026-09-04 | Apache-2.0 | 13,453,369 | none |

The browsers are downloaded separately (about 0.5 GB for three engines) or
come with the image.

Primary sources: <https://registry.npmjs.org/@playwright/test>,
<https://github.com/microsoft/playwright>,
<https://github.com/microsoft/playwright/blob/main/LICENSE>,
<https://playwright.dev/docs/test-projects>,
<https://playwright.dev/docs/test-snapshots>,
<https://playwright.dev/docs/docker>,
<https://playwright.dev/docs/ci#via-containers>,
<https://mcr.microsoft.com/en-us/artifact/mar/playwright/about>.

## Consequences

Running the suite needs podman (or the image in CI); screenshot baselines are
only valid when produced by `pnpm e2e:visual:update`. Each Playwright upgrade
changes the browser builds, so baselines are re-created and reviewed with it.
The exit cost is the specs: their `page`, `locator` and `mouse` calls are
Playwright API, while what they assert (store values, commands, node counts)
is ours.

## Review date

2027-04-12, or with the next Playwright minor version that the dependency
window admits.
