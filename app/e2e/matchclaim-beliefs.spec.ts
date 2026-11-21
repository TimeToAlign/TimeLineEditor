/**
 * A MatchClaim's provenance and the user's belief in the built editor.
 * TimeToShare's table fixture is imported with its MatchClaim table, and a
 * MatchStamp naming `claim_1` is shown. The server is replayed:
 * `POST /api/match-claims` by the client's recording
 * (`packages/client/tests/data/match-claims.answer.bin`, the server's answer
 * for exactly this manifest and table), and after the belief by the same
 * recording with the user's belief in `claim_1` turned `false`, which is the
 * server's answer for the new table (the server's tests prove its beliefs);
 * `POST /api/match-claims/provenance` by the fixture's provenance for the
 * MatchClaims asked for; `POST /api/match-claims/events` by the events of
 * `claim_1` written below; `POST /api/match-claims/belief` by a Parquet file's
 * bytes, which the editor holds, sends back to the table route and saves
 * unchanged. A changed table is then never dropped unasked: New asks to
 * save it with the workspace, or alone once the workspace is saved.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import type { Download, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { packageDir, SCHEMA_VERSION } from "./schema.ts";
import { chooseItem, downloaded, select, withoutPickers } from "./support.ts";

const TABLES = path.join(packageDir, "fixtures", "tables", SCHEMA_VERSION);
const MANIFEST = readFileSync(path.join(TABLES, "manifest.yaml"));
const PARQUET = readFileSync(path.join(TABLES, "match_claims.parquet"));
const ANSWER = readFileSync(
  path.join(import.meta.dirname, "../packages/client/tests/data/match-claims.answer.bin"),
);
/** The user: the actor whose `true` the fixture records in `claim_1`. */
const ORCID = "0000-0002-1825-0097";
const ME = `https://orcid.org/${ORCID}`;

/** The table route's answer with the first belief of the table, `claim_1`'s, turned `false`. */
function believedAnswer(): Buffer {
  const length = ANSWER.readUInt32LE(0);
  const header = JSON.parse(ANSWER.subarray(4, 4 + length).toString("utf8"));
  const base = Math.ceil((4 + length) / 8) * 8;
  const answer = Buffer.from(ANSWER);
  answer[base + header.arrays.belief_words[0]] = header.beliefs.indexOf("false");
  return answer;
}

/**
 * The new file the belief route answers: Parquet bytes other than the picked
 * file's (the fixture's Projections table), which the editor keeps unchanged.
 */
const BELIEVED = readFileSync(path.join(TABLES, "projections.parquet"));

/** The fixture's provenance of `claim_1`, as the server answers it. */
const CLAIM_1 = {
  stated_by: [ME],
  date: "2026-11-20",
  method: "manual",
  beliefs: [{ actor: ME, belief: "true", date: "2026-11-20" }],
};

/** The events of `claim_1`, as the server answers them. */
const CLAIM_1_EVENTS = {
  id: "claim_1",
  timeline_a_id: "clt_1",
  event_a_id: "note_1",
  event_a_name: "C4",
  timeline_b_id: "dpt_1",
  event_b_id: "onset_1",
  event_b_name: null,
  certainty: 0.75,
  is_synchronous: true,
};

interface Seen {
  tables: number;
  events: number;
  provenance: unknown[];
  beliefs: unknown[];
}

/** The page function the parameters of a provenance or belief request are handed to. */
const REPORT = "__tilieSentParameters";

/**
 * Report the parameters of every request of the provenance and belief routes
 * to `seen`, read from the body the page sends, before the request leaves.
 * The body is a Blob, and WebKit's network inspector, which Playwright reads
 * a request's post data from, leaves a Blob body out (Chromium and Firefox
 * hand it over), so the parameters are read in the page.
 */
async function reportParameters(page: Page, seen: Seen): Promise<void> {
  await page.exposeFunction(REPORT, (route: string, parameters: unknown) => {
    (route === "provenance" ? seen.provenance : seen.beliefs).push(parameters);
  });
  await page.addInitScript((report) => {
    const send = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      const route = /(?:^|\/)api\/match-claims\/(provenance|belief)$/u.exec(url)?.[1];
      if (route !== undefined) {
        const body = new Uint8Array(await new Response(init?.body ?? null).arrayBuffer());
        const length = new DataView(body.buffer).getUint32(0, true);
        const parameters: unknown = JSON.parse(
          new TextDecoder().decode(body.subarray(4, 4 + length)),
        );
        await Reflect.get(window, report)(route, parameters);
      }
      return send(input, init);
    };
  }, REPORT);
}

/** Open a fresh page as the user `ME`, every route replayed; the requests are counted. */
async function openPage(page: Page): Promise<Seen> {
  const seen: Seen = { tables: 0, events: 0, provenance: [], beliefs: [] };
  await withoutPickers(page);
  await reportParameters(page, seen);
  await page.addInitScript((orcid) => {
    localStorage.setItem("tilie.user", JSON.stringify({ name: "Ana", orcid }));
  }, ORCID);
  await page.clock.setFixedTime(new Date(2026, 10, 22, 12));
  await page.route("**/api/match-claims", async (route) => {
    seen.tables += 1;
    const body = seen.beliefs.length === 0 ? ANSWER : believedAnswer();
    await route.fulfill({ status: 200, contentType: "application/octet-stream", body });
  });
  await page.route("**/api/match-claims/provenance", async (route) => {
    const claims = (seen.provenance.at(-1) as { claims: string[] }).claims;
    await route.fulfill({
      status: 200,
      json: { claims: claims.map((id) => ({ id, provenance: id === "claim_1" ? CLAIM_1 : null })) },
    });
  });
  await page.route("**/api/match-claims/events", async (route) => {
    seen.events += 1;
    await route.fulfill({ status: 200, json: { claims: [CLAIM_1_EVENTS] } });
  });
  await page.route("**/api/match-claims/belief", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/vnd.apache.parquet",
      body: BELIEVED,
    });
  });
  await page.goto("/");
  await page.waitForFunction(() => window.__tilie !== undefined);
  return seen;
}

/** Import the manifest with its table; the one block's ID. */
async function importTable(page: Page): Promise<string> {
  const chooser = page.waitForEvent("filechooser");
  await chooseItem(page, "Import manifest…");
  await (await chooser).setFiles([
    { name: "manifest.yaml", mimeType: "application/octet-stream", buffer: MANIFEST },
    { name: "match_claims.parquet", mimeType: "application/octet-stream", buffer: PARQUET },
  ]);
  await expect
    .poll(() => page.evaluate(() => Object.keys(window.__tilie.store().view.blocks).length))
    .toBe(1);
  return page.evaluate(() => Object.keys(window.__tilie.store().view.blocks)[0] ?? "");
}

/** Name the MatchStamp "Downbeat" on `claim_1` in block `block` and select it. */
async function nameDownbeat(page: Page, block: string): Promise<void> {
  const refusal = await page.evaluate(
    (id) =>
      window.__tilie.store().dispatch({
        type: "add",
        into: { block: id },
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
      }),
    block,
  );
  expect(refusal).toBe(null);
  await select(page, [{ block, id: "matchstamp_1" }]);
}

/** The Matchstamp tab's MatchClaims. */
const claims = (page: Page) => page.getByRole("region", { name: "MatchClaims", exact: true });

/** The button answering `label` in the open question. */
const answerButton = (page: Page, label: string) =>
  page.getByRole("dialog").getByRole("button", { name: label, exact: true });

/** Import the table, name "Downbeat" and believe `claim_1` false: the table is then changed. */
async function changeTable(page: Page): Promise<void> {
  await nameDownbeat(page, await importTable(page));
  const claim = claims(page).locator("li[data-claim='claim_1']");
  await claim.getByRole("button", { name: "claim_1", exact: true }).click();
  const yours = claim.getByRole("group", { name: "Your belief in claim_1" });
  await yours.getByRole("button", { name: "False" }).click();
  await expect(page.getByTestId("matchclaims-status")).toHaveText(
    "match_claims.parquet: 15 MatchClaims, changed",
  );
}

const blockCount = (page: Page) =>
  page.evaluate(() => Object.keys(window.__tilie.store().view.blocks).length);

test("a MatchClaim's provenance is read for it, and the user's belief makes a table to save", async ({
  page,
}) => {
  const seen = await openPage(page);
  const block = await importTable(page);
  await nameDownbeat(page, block);

  // The MatchClaim is collapsed; expanded, its events, its beliefs, and the provenance behind its own button.
  const claim = claims(page).locator("li[data-claim='claim_1']");
  const disclosure = claim.getByRole("button", { name: "claim_1", exact: true });
  await expect(disclosure).toHaveAttribute("aria-expanded", "false");
  await expect(claim.getByRole("list", { name: "Beliefs" })).toBeHidden();
  expect(seen.events).toBe(0);
  await disclosure.click();
  await expect(disclosure).toHaveAttribute("aria-expanded", "true");
  const events = claim.getByTestId("matchclaim-events");
  await expect(events.getByRole("term")).toHaveText(["clt_1", "dpt_1", "certainty"]);
  await expect(events.getByRole("definition")).toHaveText(["note_1 “C4”", "onset_1", "0.75"]);
  expect(seen.events).toBe(1);
  await expect(claim.getByRole("list", { name: "Beliefs" })).toHaveText(
    "Ana believes it true (2026-11-20)",
  );
  // The provenance of the MatchStamp's one MatchClaim, and of nothing else, as the Metadata tab words it.
  await claim.getByRole("button", { name: "Provenance of claim_1" }).click();
  const provenance = claim.getByTestId("provenance");
  await expect(provenance.getByRole("term")).toHaveText(["stated by", "method", "date"]);
  await expect(provenance.getByRole("definition")).toHaveText(["Ana", "manual", "2026-11-20"]);
  await expect(provenance.getByRole("list", { name: "Beliefs" })).toHaveCount(0);
  expect(seen.provenance).toEqual([{ claims: ["claim_1"] }]);
  const yours = claim.getByRole("group", { name: "Your belief in claim_1" });
  await expect(yours.getByRole("button", { name: "True" })).toHaveAttribute("aria-pressed", "true");

  // False: one belief sent, the new table read and held, changed.
  const journal = await page.evaluate(() => window.__tilie.store().journal.length);
  await yours.getByRole("button", { name: "False" }).click();
  await expect(page.getByTestId("matchclaims-status")).toHaveText(
    "match_claims.parquet: 15 MatchClaims, changed",
  );
  expect(seen.beliefs).toEqual([
    { claim: "claim_1", actor: ME, belief: "false", date: "2026-11-22" },
  ]);
  expect(seen.tables).toBe(2);
  await expect(yours.getByRole("button", { name: "False" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  // The index is rebuilt with the block's filter: the named MatchStamp now rests on a MatchClaim it leaves out.
  await expect(page.getByTestId("matchstamp-differences")).toContainText(
    "MatchClaims the belief filter leaves out",
  );
  expect(await page.evaluate(() => window.__tilie.store().journal.length)).toBe(journal);
  // Nothing of the table enters the workspace file.
  expect((await page.evaluate(() => window.__tilie.text())).includes("claim_2")).toBe(false);

  // Save MatchClaims… downloads the answered file unchanged; the table is then no longer changed.
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save MatchClaims…" }).click();
  const done = await download;
  expect(done.suggestedFilename()).toBe("match_claims.parquet");
  expect(readFileSync(await done.path()).equals(BELIEVED)).toBe(true);
  await expect(page.getByTestId("matchclaims-status")).toHaveText(
    "match_claims.parquet: 15 MatchClaims",
  );
  await expect(page.getByRole("button", { name: "Save MatchClaims…" })).toHaveCount(0);
});

test("New asks to save a changed table with the unsaved workspace, and saves both", async ({
  page,
}) => {
  await openPage(page);
  await changeTable(page);

  await chooseItem(page, "New workspace");
  await expect(page.getByRole("dialog")).toHaveText(
    /untitled\.tle\.json and the MatchClaim table match_claims\.parquet have unsaved changes\. Save them\?/u,
  );
  await answerButton(page, "Cancel").click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await blockCount(page)).toBe(1);
  await expect(page.getByTestId("matchclaims-status")).toHaveText(
    "match_claims.parquet: 15 MatchClaims, changed",
  );

  const workspace = await page.evaluate(() => window.__tilie.text());
  const downloads: Download[] = [];
  page.on("download", (download) => downloads.push(download));
  await chooseItem(page, "New workspace");
  await answerButton(page, "Save").click();
  await expect.poll(() => blockCount(page)).toBe(0);
  expect(downloads.length).toBe(2);
  const [first, second] = downloads;
  if (first === undefined || second === undefined) throw new Error("two downloads expected");
  expect(await downloaded(Promise.resolve(first))).toEqual(["untitled.tle.json", workspace]);
  expect(second.suggestedFilename()).toBe("match_claims.parquet");
  expect(readFileSync(await second.path()).equals(BELIEVED)).toBe(true);
  await expect(page).toHaveTitle("untitled.tle.json – TimeLineEditor");
});

test("New asks about a changed table alone once the workspace is saved, and Discard drops it", async ({
  page,
}) => {
  await openPage(page);
  await changeTable(page);
  const saved = page.waitForEvent("download");
  await page.keyboard.press("Control+S");
  await saved;
  await expect(page).toHaveTitle("untitled.tle.json – TimeLineEditor");

  await chooseItem(page, "New workspace");
  await expect(page.getByRole("dialog")).toHaveText(
    /The MatchClaim table match_claims\.parquet has unsaved changes\. Save them\?/u,
  );
  await answerButton(page, "Discard").click();
  await expect.poll(() => blockCount(page)).toBe(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // The table went with the workspace: New asks nothing more.
  await chooseItem(page, "New workspace");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
