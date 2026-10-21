/**
 * The embed build inside a host page it does not own: two editors mounted
 * side by side by `mount`, each drawing its own workspace with the bundled
 * face loaded from beside the bundle, leaving the host's styles, title and
 * keys alone, asking no server, and leaving its element empty on
 * `destroy()`. The method is in `README.md` ("embed.spec.ts").
 */

import type { Page, Request } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { cardAddress } from "../packages/core/src/index.ts";
import type * as Embed from "../packages/editor/src/embed.ts";
import { type FixtureName, fixtureText, framePoint, nodeDragStart, SMALL } from "./support.ts";

/** The host's origin: no server answers it, every request to it is answered by the route below. */
const HOST = "http://host.test";

/** What the host page records and holds, read by the tests. */
interface HostKey {
  readonly key: string;
  readonly target: string;
  readonly prevented: boolean;
}

declare global {
  interface Window {
    /** The embed's module, as the host page imported it. */
    tilieEmbed?: typeof Embed;
    /** The editors the test mounted, in slot order. */
    editors?: Embed.TimeLineEditor[];
    /** Every key pressed on the page, read once every listener has run. */
    hostKeys?: HostKey[];
  }
}

/**
 * The host page: its own margin, font and title, an input of its own, and
 * two empty 600-px slots; it loads the embed's stylesheet and module from
 * `/tilie/` and records every key press after all listeners have seen it.
 */
const HOST_PAGE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Host page</title>
    <link rel="stylesheet" href="/tilie/tilie.css" />
    <style>
      body { margin: 7px; font-family: serif; }
      .slot { height: 600px; }
    </style>
    <script type="module">
      window.hostKeys = [];
      window.addEventListener("keydown", (event) => {
        setTimeout(() =>
          window.hostKeys.push({
            key: event.key,
            target: event.target.tagName,
            prevented: event.defaultPrevented,
          }),
        );
      });
      window.tilieEmbed = await import("/tilie/tilie.js");
    </script>
  </head>
  <body>
    <h1>Host</h1>
    <input aria-label="Host input" />
    <div class="slot" data-testid="first"></div>
    <div class="slot" data-testid="second"></div>
  </body>
</html>
`;

/** The workspace each slot is mounted with, and the blocks it holds. */
const SLOTS: readonly { readonly slot: string; readonly fixture: FixtureName; blocks: number }[] = [
  { slot: "first", fixture: "small", blocks: 5 },
  { slot: "second", fixture: "bundles", blocks: 4 },
];

/** The family the embed declares for drawn text. */
const FACE = "TiLiE DejaVu Sans";

/**
 * Serve the host page at `HOST`, forward `/tilie/…` to the embed build the
 * web server serves at `<baseURL>embed/…`, and answer anything else 404.
 * The editor's files thus reach the page from the host's origin, as a host
 * serving a copy of the build would serve them.
 */
async function serveHost(page: Page, baseURL: string): Promise<void> {
  await page.route(`${HOST}/**`, async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === "/") {
      await route.fulfill({ contentType: "text/html", body: HOST_PAGE });
    } else if (pathname.startsWith("/tilie/")) {
      // Fresh headers: the page's carry the host's Host and Origin, which the
      // preview server refuses (Firefox forwards them as they were sent).
      const response = await route.fetch({
        url: new URL(`embed/${pathname.slice("/tilie/".length)}`, baseURL).href,
        headers: {},
      });
      await route.fulfill({ response });
    } else {
      await route.fulfill({ status: 404, body: "" });
    }
  });
}

/** The host's body margin and title, as the host set them. */
function hostState(page: Page): Promise<[string, string]> {
  return page.evaluate(() => [getComputedStyle(document.body).margin, document.title]);
}

/** The `text()` of each mounted editor, in slot order. */
function texts(page: Page): Promise<string[]> {
  return page.evaluate(() => (window.editors ?? []).map((editor) => editor.text()));
}

let requests: Request[] = [];

test.beforeEach(async ({ page, baseURL }) => {
  if (baseURL === undefined) throw new Error("the configuration names no base URL");
  requests = [];
  page.on("request", (request) => requests.push(request));
  await serveHost(page, baseURL);
  await page.goto(`${HOST}/`);
  await page.waitForFunction(() => window.tilieEmbed !== undefined);
  await page.evaluate(
    (slots) => {
      const embed = window.tilieEmbed;
      if (embed === undefined) throw new Error("the embed is not loaded");
      window.editors = slots.map(({ slot, text }) => {
        const element = document.querySelector(`[data-testid="${slot}"]`);
        if (!(element instanceof HTMLElement)) throw new Error(`no slot ${slot}`);
        return embed.mount(element, { workspace: text });
      });
    },
    SLOTS.map(({ slot, fixture }) => ({ slot, text: fixtureText(fixture) })),
  );
  for (const { slot, blocks } of SLOTS) {
    await expect(page.getByTestId(slot).getByTestId("block")).toHaveCount(blocks);
  }
});

test("each slot draws its own workspace with the bundled face, asking no server", async ({
  page,
}) => {
  expect(await texts(page)).toEqual(SLOTS.map(({ fixture }) => fixtureText(fixture)));
  expect(
    await page.evaluate(async (family) => {
      await document.fonts.ready;
      const faces = [...document.fonts].filter(
        (face) => face.family.replaceAll('"', "") === family,
      );
      return {
        statuses: faces.map((face) => face.status),
        check: document.fonts.check(`16px "${family}"`),
      };
    }, FACE),
  ).toEqual({ statuses: ["loaded"], check: true });
  const font = requests.filter((request) => request.url().endsWith(".ttf"));
  expect(font.map((request) => new URL(request.url()).pathname)).toEqual([
    expect.stringMatching(/^\/tilie\/assets\/[^/]+\.ttf$/),
  ]);
  expect((await font[0]?.response())?.status()).toBe(200);
  expect(await page.evaluate(() => window.__tilie === undefined)).toBe(true);
  expect(requests.filter((request) => new URL(request.url()).pathname.includes("/api/"))).toEqual(
    [],
  );
});

test("a drag changes its own editor's text and leaves the host's styles and title", async ({
  page,
}) => {
  const before = await texts(page);
  expect(await hostState(page)).toEqual(["7px", "Host page"]);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(["Host"]);
  // An embedded editor has no test hook: the drag starts on the card `bare`'s manifest draws.
  await nodeDragStart(page, await framePoint(page, SMALL.bare, cardAddress("bare")), 40, 30);
  await page.mouse.up();
  await expect.poll(async () => (await texts(page))[0]).not.toBe(before[0]);
  expect((await texts(page))[1]).toBe(before[1]);
  expect(await hostState(page)).toEqual(["7px", "Host page"]);
});

test("the host's keys are not prevented", async ({ page }) => {
  await page.getByRole("textbox", { name: "Host input" }).press("ControlOrMeta+s");
  // The body is not focusable: leave the input, so the next key goes to the body.
  await page.getByRole("textbox", { name: "Host input" }).blur();
  await page.keyboard.press("ControlOrMeta+z");
  // The modifiers' own key events are left out: what counts is the shortcut's key.
  const shortcuts = async () =>
    (await page.evaluate(() => window.hostKeys ?? [])).filter(({ key }) => key.length === 1);
  await expect.poll(shortcuts).toEqual([
    { key: "s", target: "INPUT", prevented: false },
    { key: "z", target: "BODY", prevented: false },
  ]);
});

test("destroy() empties its own slot and leaves the other editor", async ({ page }) => {
  await page.evaluate(async () => {
    await window.editors?.[0]?.destroy();
  });
  const first = page.getByTestId("first");
  await expect(first.locator("*")).toHaveCount(0);
  await expect(first).not.toHaveAttribute("data-tilie");
  await expect(page.getByTestId("second").getByTestId("block")).toHaveCount(4);
});
