/**
 * A large bundle side by side (TimeToShare's drawing specification, sections
 * 8.1, 8.6 and 8.8, Drawn once): the manifest of Beethoven's op. 2 no. 1
 * from the musical themes dataset, 28 groups of excerpts of four CD tracks,
 * MIDI and score files, imported and arranged Horizontal in its bundle
 * editor. The groups stand in name order; the three tracks that two groups
 * each hang on (tracks 1, 3 and 4) are drawn once, on one line under the
 * row, the six groups holding their excerpts hanging from it; every other
 * group, the one whose excerpt lies on track 2 among them, stands at the
 * row's top. Derivation in `README.md` ("bundle.spec.ts").
 *
 * The dataset is not part of this repository: `MUSICAL_THEMES_DATASET`
 * names its directory, and without it the test does not run.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { idAddress } from "../packages/core/src/index.ts";
import {
  element,
  enter,
  entriesLength,
  journalLength,
  pick,
  viewportOf,
  withoutPickers,
} from "./support.ts";

const DATASET = process.env.MUSICAL_THEMES_DATASET;
const MANIFEST =
  DATASET === undefined ? null : path.join(DATASET, "beethoven", "op2_no1", "manifest.json");

test.skip(
  MANIFEST === null || !existsSync(MANIFEST),
  "MUSICAL_THEMES_DATASET names no directory holding beethoven/op2_no1/manifest.json",
);

test.use({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });

/** The CD tracks two groups hang on (1, 3 and 4), and track 2, which one group hangs on. */
const SHARED_TRACKS = ["cpt_3856xdsl3z3hd", "cpt_3p04tgywxp05z", "cpt_323f74gjyd6li"];
const TRACK_2 = "cpt_18o5vli1d8q4n";

interface Group {
  readonly id: string;
  readonly name: string;
  readonly members: readonly string[];
}

/** The manifest's groups, their IDs without the file's `#`, in name order (section 8.1). */
function groupsInNameOrder(text: string): Group[] {
  const value = JSON.parse(text) as {
    groups: { id: string; name?: string | null; members: string[] }[];
  };
  const bare = (id: string) => id.replace(/^#/, "");
  const groups = value.groups.map((group) => ({
    id: bare(group.id),
    name: group.name ?? bare(group.id),
    members: group.members.map(bare),
  }));
  const byCodePoint = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0);
  return groups.sort((a, b) => byCodePoint(a.name, b.name) || byCodePoint(a.id, b.id));
}

/** The children of each root of the manifest, by the root's ID without `#`. */
function childrenOf(text: string): Map<string, string[]> {
  const value = JSON.parse(text) as {
    timelines: { id: string; children?: { id: string }[] }[];
  };
  return new Map(
    value.timelines.map((root) => [
      root.id.replace(/^#/, ""),
      (root.children ?? []).map((child) => child.id.replace(/^#/, "")),
    ]),
  );
}

/** The drawn `x` and `y` of a frame's rectangle (its last part). */
function frameAt(frame: Locator): Promise<{ x: number; y: number }> {
  return frame
    .last()
    .evaluate((rect) => ({ x: Number(rect.getAttribute("x")), y: Number(rect.getAttribute("y")) }));
}

/** The ordinates of every horizontal `line` part of the drawn elements `drawn`. */
function lineOrdinates(drawn: Locator): Promise<number[]> {
  return drawn.evaluateAll((parts) =>
    parts.flatMap((part) =>
      part.tagName === "line" && part.getAttribute("y1") === part.getAttribute("y2")
        ? [Number(part.getAttribute("y1"))]
        : [],
    ),
  );
}

/** Choose Horizontal in the Arrange menu: one entry more, the choice shown pressed. */
async function chooseHorizontal(page: Page): Promise<void> {
  const toggle = page.getByTestId("arrange");
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  const horizontal = page.getByTestId("arrange-menu").getByTestId("arrange-horizontal");
  const before = await entriesLength(page);
  await horizontal.click();
  await expect.poll(() => entriesLength(page)).toBe(before + 1);
  await expect(horizontal).toHaveAttribute("aria-pressed", "true");
}

test("op. 2 no. 1 side by side: its groups in name order, three tracks on one line under the row", async ({
  page,
}) => {
  const text = readFileSync(MANIFEST ?? "", "utf8");
  const groups = groupsInNameOrder(text);
  const children = childrenOf(text);
  await withoutPickers(page);
  await page.goto("/");
  await page.waitForFunction(() => window.__tilie !== undefined);
  await pick(page, "Import manifest…", "manifest.json", text);
  await expect.poll(() => journalLength(page)).toBe(1);
  const [block] = await page.evaluate(() => Object.keys(window.__tilie.store().view.blocks));
  if (block === undefined) throw new Error("the import added no block");

  await enter(page, { block }, await viewportOf(page));
  await chooseHorizontal(page);
  expect(
    await page.evaluate(
      (id) => window.__tilie.store().view.blocks[id]?.arrangement?.direction,
      block,
    ),
  ).toBe("horizontal");

  const frames = groups.map((group) => element(page, block, idAddress(group.id)));
  const hangsOn = (group: Group, root: string) =>
    group.members.some((member) => (children.get(root) ?? []).includes(member));
  const hanging = groups.filter((group) => SHARED_TRACKS.some((track) => hangsOn(group, track)));
  expect(hanging.map((group) => group.name)).toEqual([
    "B689 (MTD 0807), EDM-alig",
    "B690 (MTD 0808), EDM-alig",
    "B692 (MTD 0810), EDM-alig",
    "B693 (MTD 0811), EDM-alig",
    "B694 (MTD 0812), EDM-alig",
    "B695 (MTD 0813), EDM-alig",
  ]);
  expect(groups.filter((group) => hangsOn(group, TRACK_2)).map((group) => group.name)).toEqual([
    "B691 (MTD 0809), EDM-alig",
  ]);

  // The groups stand left to right in name order, once the motion has come to rest.
  const places = async () => Promise.all(frames.map(frameAt));
  await expect
    .poll(async () => {
      const xs = (await places()).map((place) => place.x);
      return xs.every((x, index) => index === 0 || x > (xs[index - 1] ?? x));
    })
    .toBe(true);

  // Tracks 1, 3 and 4 lie on one line: every horizontal part of their lines, each once card's and
  // each ancestor line in the frames hanging on them, at one ordinate.
  const trackLines = async () =>
    (
      await Promise.all(
        SHARED_TRACKS.map((track) => lineOrdinates(element(page, block, idAddress(track)))),
      )
    ).flat();
  await expect.poll(async () => new Set(await trackLines()).size).toBe(1);
  const [line] = await trackLines();
  expect((await trackLines()).length).toBeGreaterThan(SHARED_TRACKS.length);

  // Every group hanging on no shared track at one top, the row's, as high as the highest frame;
  // each of the six hanging groups lower, its track's ancestor line in it on the tracks' line.
  const tops = new Map(groups.map((group, index) => [group.id, index]));
  const all = await places();
  const at = (group: Group) => all[tops.get(group.id) ?? -1]?.y ?? Number.NaN;
  const others = groups.filter((group) => !hanging.includes(group));
  const rowTop = Math.min(...all.map((place) => place.y));
  expect(new Set(others.map(at))).toEqual(new Set([rowTop]));
  for (const group of hanging) expect(at(group), group.name).toBeGreaterThanOrEqual(rowTop);
  expect(line).toBeGreaterThan(rowTop);
});
