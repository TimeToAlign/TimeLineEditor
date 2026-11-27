/**
 * A large bundle side by side (TimeToShare's drawing specification, sections
 * 8.1, 8.6 and 8.8, Drawn once): the manifest of Beethoven's op. 2 no. 1
 * from the musical themes dataset, 28 groups of excerpts of four CD tracks,
 * MIDI and score files, imported and arranged Horizontal in its bundle
 * editor. The groups stand in name order; the three tracks that two groups
 * each hang on (tracks 1, 3 and 4) are drawn once, on one line under the
 * row, the six groups holding their excerpts hanging from it, every frame
 * at the row's top; the frames' `x` and `y` and the line's ordinate as the
 * writer prints them. Derivation in `README.md` ("bundle.spec.ts").
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

/** The drawn `x` and `y` of a frame's rectangle (its last part), as the writer prints them. */
function frameAt(frame: Locator): Promise<(string | null)[]> {
  return frame.last().evaluate((rect) => [rect.getAttribute("x"), rect.getAttribute("y")]);
}

/** The ordinate of every horizontal `line` part of the drawn elements `drawn`, as printed. */
function lineOrdinates(drawn: Locator): Promise<(string | null)[]> {
  return drawn.evaluateAll((parts) =>
    parts.flatMap((part) =>
      part.tagName === "line" && part.getAttribute("y1") === part.getAttribute("y2")
        ? [part.getAttribute("y1")]
        : [],
    ),
  );
}

/** The row's top, every frame's drawn `y` (README). */
const ROW_TOP = "28.8047";

/** The drawn `x` of the 28 frames, in name order (README). */
const FRAME_XS = [
  "209.966",
  "934.4763",
  "1634.5461",
  "2506.8127",
  "3446.4016",
  "4168.101",
  "4868.1708",
  "5740.4374",
  "6664.4732",
  "14201.543",
  "14901.6129",
  "15773.8795",
  "16725.6906",
  "17447.6053",
  "18147.6752",
  "19019.9418",
  "19942.864",
  "20664.4628",
  "21364.5326",
  "22064.6024",
  "22937.1913",
  "23657.2373",
  "24357.3071",
  "25229.5737",
  "26155.5262",
  "26875.4499",
  "27575.5198",
  "28447.7864",
];

/** The ordinate of the line tracks 1, 3 and 4 lie on (README). */
const TRACK_LINE = "82.0117";

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

  // The groups stand left to right in name order at the row's top, once the motion has come to rest.
  expect(groups).toHaveLength(FRAME_XS.length);
  await expect
    .poll(() => Promise.all(frames.map(frameAt)))
    .toEqual(FRAME_XS.map((x) => [x, ROW_TOP]));

  // Tracks 1, 3 and 4 lie on one line: every horizontal part of their lines, each once card's and
  // each ancestor line in the frames hanging on them, four for each track, at one ordinate.
  expect(
    await Promise.all(
      SHARED_TRACKS.map((track) => lineOrdinates(element(page, block, idAddress(track)))),
    ),
  ).toEqual(SHARED_TRACKS.map(() => [TRACK_LINE, TRACK_LINE, TRACK_LINE, TRACK_LINE]));
});
