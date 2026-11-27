/**
 * Accessibility of the inspector's later panels and the MatchClaim
 * controls, each in the state a user meets it in: axe-core reports no
 * violation on the Timestamp tab (a named timestamp shown, an unnamed pin,
 * a group member's timestamp with its GroupStamp toggle), on the Journal
 * tab (a closed session expanded, an undone entry greyed), on the
 * Matchstamp tab (a loaded MatchClaim table with its filter, a named
 * MatchStamp with its MatchClaim expanded and its provenance open under
 * Show matches, then the table changed by a belief), in the tables
 * dialog, on the Elisions tab (a selected group elision's three
 * blocks shown), and on the Regions tab (a timeline's and a descendant's
 * rows, one marked) and the band list of the Properties tab. Derivation in `README.md` ("a11y-panels.spec.ts").
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { packageDir, SCHEMA_VERSION } from "./schema.ts";
import {
  BUNDLES,
  chooseItem,
  dispatch,
  importFixture,
  open,
  panel,
  SMALL,
  select,
  tab,
  withoutPickers,
} from "./support.ts";
import {
  answerHealth,
  holdHealth,
  importManifest as importFromServer,
  openPage,
} from "./tablesServer.ts";

/** axe-core's violations on the whole page. */
async function violations(page: Page): Promise<unknown[]> {
  return (await new AxeBuilder({ page }).analyze()).violations;
}

/** Open the inspector if it is closed. */
async function openInspector(page: Page): Promise<void> {
  const button = page.getByRole("button", { name: "Open inspector" });
  if (await button.isVisible()) await button.click();
}

test.describe("the Timestamp and Journal tabs", () => {
  test("axe-core reports no violation on the Timestamp tab showing a named timestamp", async ({
    page,
  }) => {
    await open(page, "small");
    await select(page, [{ block: SMALL.bare, id: "timestamp_1" }]);
    await expect(tab(page, "Timestamp")).toHaveAttribute("aria-selected", "true");
    const shown = await panel(page, "Timestamp");
    await expect(shown.getByRole("slider", { name: "Wedge rotation" })).toBeVisible();
    await expect(shown.getByRole("button", { name: "Delete", exact: true })).toBeEnabled();
    expect(await violations(page)).toEqual([]);
  });

  test("axe-core reports no violation on the Timestamp tab showing an unnamed pin", async ({
    page,
  }) => {
    await open(page, "small");
    await select(page, [{ block: SMALL.map, id: "phrase", part: ["start"] }]);
    await openInspector(page);
    await tab(page, "Timestamp").click();
    await expect(tab(page, "Timestamp")).toHaveAttribute("aria-selected", "true");
    const shown = await panel(page, "Timestamp");
    await expect(shown.getByLabel("coordinate of Phrase", { exact: true })).toBeVisible();
    await expect(shown.getByRole("button", { name: "Delete", exact: true })).toBeDisabled();
    expect(await violations(page)).toEqual([]);
  });

  test("axe-core reports no violation on the Timestamp tab of a group member's timestamp", async ({
    page,
  }) => {
    await open(page, "bundles");
    await select(page, [{ block: BUNDLES.mixed, id: "timestamp_7" }]);
    await expect(tab(page, "Timestamp")).toHaveAttribute("aria-selected", "true");
    const shown = await panel(page, "Timestamp");
    await expect(
      shown
        .getByRole("group", { name: "Group", exact: true })
        .getByRole("button", { name: "GroupStamp" }),
    ).toBeVisible();
    expect(await violations(page)).toEqual([]);
  });

  test("axe-core reports no violation on the Journal tab with a session expanded and an entry undone", async ({
    page,
  }) => {
    await open(page, "small");
    expect(await page.evaluate((block) => window.__tilie.open({ block }), SMALL.bare)).toBeNull();
    expect(
      await dispatch(page, {
        type: "set",
        changes: [{ target: { block: SMALL.bare, id: "bare" }, values: { name: "Plain" } }],
      }),
    ).toBeNull();
    await page.evaluate(() => window.__tilie.done());
    expect(
      await dispatch(page, {
        type: "set",
        changes: [{ target: { block: SMALL.bare }, values: { x: 8 } }],
      }),
    ).toBeNull();
    await page.evaluate(() => window.__tilie.store().undo());
    await openInspector(page);
    await tab(page, "Journal").click();
    const journal = await panel(page, "Journal");
    await expect(journal.locator("[data-undone]")).toHaveCount(1);
    const session = journal.getByRole("button", { name: /\(1 change\)$/u });
    await session.click();
    await expect(session).toHaveAttribute("aria-expanded", "true");
    expect(await violations(page)).toEqual([]);
  });
});

const TABLES = path.join(packageDir, "fixtures", "tables", SCHEMA_VERSION);
const MANIFEST = readFileSync(path.join(TABLES, "manifest.yaml"));
const PARQUET = readFileSync(path.join(TABLES, "match_claims.parquet"));
const ANSWER = readFileSync(
  path.join(import.meta.dirname, "../packages/client/tests/data/match-claims.answer.bin"),
);
/** The user, the actor whose `true` the fixture records in `claim_1`. */
const ORCID = "0000-0002-1825-0097";
const ME = `https://orcid.org/${ORCID}`;

/** The table route's answer with `claim_1`'s belief turned `false`, the answer for the believed table. */
function believedAnswer(): Buffer {
  const length = ANSWER.readUInt32LE(0);
  const header = JSON.parse(ANSWER.subarray(4, 4 + length).toString("utf8"));
  const base = Math.ceil((4 + length) / 8) * 8;
  const answer = Buffer.from(ANSWER);
  answer[base + header.arrays.belief_words[0]] = header.beliefs.indexOf("false");
  return answer;
}

/**
 * A fresh page as the user `ME`, the four MatchClaim routes answered in the
 * page: the table route by the recording (after a belief, by the believed
 * answer), provenance and events of `claim_1`, and the belief route by
 * Parquet bytes the editor holds as the changed table; the health check
 * held until the import has used the browser's picker.
 */
async function openWithRoutes(page: Page): Promise<void> {
  let believed = false;
  await withoutPickers(page);
  await holdHealth(page);
  await page.addInitScript((orcid) => {
    localStorage.setItem("tilie.user", JSON.stringify({ name: "Ana", orcid }));
  }, ORCID);
  await page.clock.setFixedTime(new Date(2026, 10, 22, 12));
  await page.route("**/api/match-claims", (route) =>
    route.fulfill({
      contentType: "application/octet-stream",
      body: believed ? believedAnswer() : ANSWER,
    }),
  );
  await page.route("**/api/match-claims/provenance", (route) =>
    route.fulfill({
      json: {
        claims: [
          {
            id: "claim_1",
            provenance: {
              stated_by: [ME],
              date: "2026-11-20",
              method: "manual",
              beliefs: [{ actor: ME, belief: "true", date: "2026-11-20" }],
            },
          },
        ],
      },
    }),
  );
  await page.route("**/api/match-claims/events", (route) =>
    route.fulfill({
      json: {
        claims: [
          {
            id: "claim_1",
            timeline_a_id: "clt_1",
            event_a_id: "note_1",
            event_a_name: "C4",
            timeline_b_id: "dpt_1",
            event_b_id: "onset_1",
            event_b_name: null,
            certainty: 0.75,
            is_synchronous: true,
          },
        ],
      },
    }),
  );
  await page.route("**/api/match-claims/belief", (route) => {
    believed = true;
    return route.fulfill({
      contentType: "application/vnd.apache.parquet",
      body: readFileSync(path.join(TABLES, "projections.parquet")),
    });
  });
  await page.goto("/");
  await page.waitForFunction(() => window.__tilie !== undefined);
}

/**
 * Import the table fixture's manifest, with its MatchClaim table when
 * `withTable`, through the browser's picker, then answer the held health
 * check, so a server reads tables; the block.
 */
async function importManifest(page: Page, withTable: boolean): Promise<string> {
  const chooser = page.waitForEvent("filechooser");
  await chooseItem(page, "Import manifest…");
  await (await chooser).setFiles([
    { name: "manifest.yaml", mimeType: "application/octet-stream", buffer: MANIFEST },
    ...(withTable
      ? [{ name: "match_claims.parquet", mimeType: "application/octet-stream", buffer: PARQUET }]
      : []),
  ]);
  await expect
    .poll(() => page.evaluate(() => Object.keys(window.__tilie.store().view.blocks).length))
    .toBe(1);
  await answerHealth(page);
  return page.evaluate(() => Object.keys(window.__tilie.store().view.blocks)[0] ?? "");
}

test.describe("the Matchstamp tab and the MatchClaim controls", () => {
  test("axe-core reports no violation on the Matchstamp tab with a table loaded", async ({
    page,
  }) => {
    await openWithRoutes(page);
    const block = await importManifest(page, true);
    await select(page, [{ block }]);
    await openInspector(page);
    await tab(page, "Matchstamp").click();
    await expect(page.getByTestId("matchclaims-status")).toHaveText(
      "match_claims.parquet: 18 MatchClaims",
    );
    await expect(page.getByTestId("matchstamp-hint")).toBeVisible();
    await expect(page.getByRole("group", { name: "Timelines" }).getByRole("checkbox")).toHaveCount(
      4,
    );
    expect(await violations(page)).toEqual([]);
  });

  test("axe-core reports no violation with a named MatchStamp's MatchClaim expanded, then its table changed", async ({
    page,
  }) => {
    await openWithRoutes(page);
    const block = await importManifest(page, true);
    expect(
      await dispatch(page, {
        type: "add",
        into: { block },
        matchstamp: {
          name: "Downbeat",
          anchors: [
            [
              { timeline: "clt_1", coordinate: [0, 1] },
              { timeline: "dpt_1", coordinate: 0 },
            ],
          ],
          match_claims: ["claim_1"],
        },
        ids: ["downbeat"],
      }),
    ).toBeNull();
    await select(page, [{ block, id: "downbeat" }]);
    await expect(tab(page, "Matchstamp")).toHaveAttribute("aria-selected", "true");
    await page.getByTestId("matches").click();
    await expect(page.getByTestId("matches")).toHaveAttribute("aria-pressed", "true");
    const claim = page
      .getByRole("region", { name: "MatchClaims", exact: true })
      .locator("li[data-claim='claim_1']");
    await claim.getByRole("button", { name: "claim_1", exact: true }).click();
    await expect(claim.getByTestId("matchclaim-events").getByRole("definition")).toHaveText([
      "note_1 “C4”",
      "onset_1",
      "0.75",
    ]);
    await claim.getByRole("button", { name: "Provenance of claim_1" }).click();
    await expect(claim.getByTestId("provenance").getByRole("definition")).toHaveText([
      "Ana",
      "manual",
      "2026-11-20",
    ]);
    const yours = claim.getByRole("group", { name: "Your belief in claim_1" });
    await expect(yours.getByRole("button", { name: "True" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(await violations(page)).toEqual([]);

    await yours.getByRole("button", { name: "False" }).click();
    await expect(page.getByTestId("matchclaims-status")).toHaveText(
      "match_claims.parquet: 18 MatchClaims, changed",
    );
    await expect(page.getByTestId("matchstamp-differences")).toContainText(
      "MatchClaims the belief filter leaves out",
    );
    await expect(page.getByRole("button", { name: "Save MatchClaims…" })).toBeVisible();
    expect(await violations(page)).toEqual([]);
  });

  test("axe-core reports no violation in the tables dialog, before and after a URL is entered", async ({
    page,
  }) => {
    await openPage(page);
    await importFromServer(page);
    await page.getByTestId("matches").click();
    const dialog = page.getByRole("dialog", {
      name: "match_claims.parquet is not beside The manifest, at story/manifest.yaml",
    });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Locate…" })).toBeVisible();
    const load = dialog.getByRole("button", { name: "Load" });
    await expect(load).toBeDisabled();
    expect(await violations(page)).toEqual([]);

    await dialog
      .getByRole("textbox", { name: "URL of the MatchClaim table" })
      .fill("https://tables.example.org/package/match_claims.parquet");
    await expect(load).toBeEnabled();
    expect(await violations(page)).toEqual([]);
  });
});

test.describe("the Elisions tab", () => {
  test("axe-core reports no violation in the Elisions tab with its three blocks shown", async ({
    page,
  }) => {
    const block = await importFixture(page, "groups/group_elided_members");
    await select(page, [{ block, id: "elision_1" }]);
    await openInspector(page);
    await tab(page, "Elisions").click();
    const shown = await panel(page, "Elisions");
    await shown.getByTestId("elisions-expand").click();
    for (const testid of ["elisions", "group-elisions", "elision-form"]) {
      await expect(shown.getByTestId(`${testid}-expand`)).toHaveAttribute("aria-expanded", "true");
    }
    await expect(shown.getByRole("button", { name: "Delete elision" })).toBeVisible();
    expect(await violations(page)).toEqual([]);
  });
});

test.describe("the Regions tab and the band list", () => {
  test("axe-core reports no violation on the Regions tab and on the band list", async ({
    page,
  }) => {
    const block = await importFixture(page, "styled_score_flow_inner");
    expect(
      await dispatch(page, {
        type: "add",
        into: { block, id: "b" },
        region: { id: "motif", name: "motif", start: [1, 1], end: [3, 1] },
      }),
    ).toBeNull();
    await select(page, [{ block, id: "score", part: ["card"] }]);
    await openInspector(page);
    await tab(page, "Regions").click();
    const shown = await panel(page, "Regions");
    await expect(shown.getByRole("heading", { name: "b" })).toBeVisible();
    await expect(shown.getByTestId("region-row")).toHaveCount(2);
    await shown.getByTestId("region-row").first().locator(".select").click();
    await expect(shown.getByTestId("region-row").first().locator(".select")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(await violations(page)).toEqual([]);

    await select(page, [{ block, id: "score", part: ["card"] }]);
    await tab(page, "Properties").click();
    await expect(
      (await panel(page, "Properties")).getByRole("table", { name: "Bands" }).getByRole("checkbox"),
    ).toHaveCount(10);
    expect(await violations(page)).toEqual([]);
  });
});
