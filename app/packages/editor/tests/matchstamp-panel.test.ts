/** The Matchstamp tab; the expected values are derived in `README.md` ("MatchClaims and the Matchstamp tab"). */

import { liveStore } from "@timetoalign/tilie-arranger";
import type { MatchClaimTable } from "@timetoalign/tilie-client";
import type { AnchorIndex, Store } from "@timetoalign/tilie-core";
import { coordinateOf, DEFAULT_MATCH_CLAIM_FILTER } from "@timetoalign/tilie-core";
import { fontMetrics } from "@timetoalign/timetoshare";
import { flushSync, mount, unmount } from "svelte";
import { afterEach, describe, expect, it } from "vitest";
import MatchstampPanel from "../src/inspector/MatchstampPanel.svelte";
import { matchIndexes } from "../src/inspector/matchstamps.ts";
import TimestampPanel from "../src/inspector/TimestampPanel.svelte";
import type { HeldMatch } from "../src/inspector/tabs.ts";
import { namedPinOf } from "../src/inspector/timestamp.ts";
import { MatchClaimTables } from "../src/matchClaims.svelte.ts";
import { BELIEFS_BY_ROW, ME, matchTable, q, tableManifest } from "./matches.ts";
import { informing, storeOf } from "./support.ts";

const A = "0000000000";
const NO_SERVER = "Matches need a server: MatchClaim tables are read through tilie-server.";
const NO_ROUTE =
  "Needs saving MatchClaims through the server, which no route does yet: the MatchClaim table is never written here.";

let mounted: ReturnType<typeof mount> | null = null;

afterEach(() => {
  if (mounted !== null) unmount(mounted);
  mounted = null;
  document.body.innerHTML = "";
});

/** Tables held without a server, `table` as block A's when given. */
function tablesWith(table: MatchClaimTable | null): MatchClaimTables {
  const tables = new MatchClaimTables(null);
  if (table !== null) tables.hold(A, { name: "match_claims.parquet", table });
  return tables;
}

/** Mount the tab on `store`, showing `match`; the MatchStamps it reports are appended to `reported`. */
function show(
  store: Store,
  match: HeldMatch | null,
  tables: MatchClaimTables,
  reported: (HeldMatch | null)[] = [],
): void {
  mounted = mount(MatchstampPanel, {
    target: document.body,
    context: informing(),
    props: {
      live: liveStore(store),
      block: store.view.blocks[A] ?? null,
      match,
      tables,
      believer: ME,
      onmatch: (next: HeldMatch | null) => {
        reported.push(next);
      },
    },
  });
  flushSync();
}

function potential(
  index: AnchorIndex,
  timeline: string,
  value: Parameters<typeof coordinateOf>[2],
) {
  const coordinate = coordinateOf(index, timeline, value);
  return {
    kind: "potential" as const,
    block: A,
    index,
    matchStamp: index.matchStamps.of[coordinate] as number,
  };
}

function nameField(): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>("input.name");
  if (input === null) throw new Error("no name field");
  return input;
}

function name(text: string): void {
  const input = nameField();
  input.value = text;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  flushSync();
}

function button(label: string): HTMLButtonElement {
  const found = [...document.querySelectorAll("button")].find(
    (item) => item.textContent?.trim() === label,
  );
  if (found === undefined) throw new Error(`no button ${label}`);
  return found;
}

/** Name the potential MatchStamp of `clt_1` 0 "Downbeat" through the tab. */
function nameDownbeat(store: Store, table: MatchClaimTable = matchTable()): (HeldMatch | null)[] {
  const { shown } = matchIndexes(table, DEFAULT_MATCH_CLAIM_FILTER, ME);
  const reported: (HeldMatch | null)[] = [];
  show(store, potential(shown, "clt_1", q(0)), tablesWith(table), reported);
  name("Downbeat");
  return reported;
}

describe("naming", () => {
  it("names a potential MatchStamp in one entry and reports the named one", () => {
    const store = storeOf(tableManifest());
    const before = store.journal.length;
    expect(nameDownbeat(store)).toEqual([{ kind: "named", block: A, id: "matchstamp_1" }]);
    expect(store.journal.length).toBe(before + 1);
    expect(store.view.blocks[A]?.manifest.graphical?.matchstamps?.map((m) => m.name)).toEqual([
      "Downbeat",
    ]);
  });

  it("closes a timeline editor first, and keeps a bundle editor of the block", () => {
    const timeline = storeOf(tableManifest());
    expect(timeline.open({ block: A, id: "cpt_1" })).toBe(null);
    nameDownbeat(timeline);
    expect(timeline.editing.length).toBe(0);
    expect(timeline.view.blocks[A]?.manifest.graphical?.matchstamps?.length).toBe(1);
    unmount(mounted as ReturnType<typeof mount>);
    mounted = null;

    const bundle = storeOf(tableManifest());
    expect(bundle.open({ block: A })).toBe(null);
    nameDownbeat(bundle);
    expect(bundle.editing.map((open) => open.kind)).toEqual(["bundle"]);
    expect(bundle.view.blocks[A]?.manifest.graphical?.matchstamps?.length).toBe(1);
  });
});

describe("a named MatchStamp", () => {
  /** Block A with "Downbeat" named, the tab unmounted again. */
  function named(): Store {
    const store = storeOf(tableManifest());
    nameDownbeat(store);
    unmount(mounted as ReturnType<typeof mount>);
    mounted = null;
    return store;
  }
  const DOWNBEAT: HeldMatch = { kind: "named", block: A, id: "matchstamp_1" };
  const doubted = () => matchTable([[[ME, "false"]], ...BELIEFS_BY_ROW.slice(1)]);

  it("shows what differs from the table, marks the anchor gone, updates and removes", () => {
    const store = named();
    const reported: (HeldMatch | null)[] = [];
    show(store, DOWNBEAT, tablesWith(doubted()), reported);
    expect(nameField().value).toBe("Downbeat");
    const anchors = [...document.querySelectorAll("li[data-anchor]")];
    expect(anchors.map((item) => [item.getAttribute("data-anchor"), item.className])).toEqual([
      ["anchor_1", expect.not.stringContaining("gone")],
      ["anchor_2", expect.stringContaining("gone")],
    ]);
    expect(anchors[1]?.querySelector(".gone-word")?.textContent).toBe("not stated by the table");
    const differences = document.querySelector("[data-testid=matchstamp-differences] dl");
    expect([...(differences?.children ?? [])].map((item) => item.textContent)).toEqual([
      "MatchClaims believed false",
      "claim_1",
      "Anchors gone",
      "anchor_2",
    ]);

    const before = store.journal.length;
    button("Update").click();
    flushSync();
    expect(store.journal.length).toBe(before + 1);
    expect(store.view.blocks[A]?.manifest.graphical?.matchstamps?.[0]?.match_claims).toEqual([
      "claim_2",
    ]);
    expect(document.querySelector("[data-testid=matchstamp-differences]")).toBe(null);

    button("Remove").click();
    flushSync();
    expect(store.journal.length).toBe(before + 2);
    expect(reported).toEqual([null]);
    expect(store.view.blocks[A]?.manifest.graphical?.matchstamps).toEqual([]);
  });

  it("compares nothing without a table", () => {
    const store = named();
    show(store, DOWNBEAT, tablesWith(null));
    expect(document.querySelectorAll("li.gone").length).toBe(0);
    expect(document.querySelector("[data-testid=matchstamp-differences]")).toBe(null);
    expect([...document.querySelectorAll(".actions button")].map((b) => b.textContent)).toEqual([
      "Remove",
    ]);
    expect(
      [...document.querySelectorAll("li[data-claim] .hint")].map((item) => item.textContent),
    ).toEqual(["no table loaded", "no table loaded"]);
  });

  it("toggles an anchor's name in one entry", () => {
    const store = named();
    show(store, DOWNBEAT, tablesWith(null));
    const toggles = document.querySelectorAll("li[data-anchor='anchor_2'] .toggle");
    expect([...toggles].map((item) => item.getAttribute("aria-pressed"))).toEqual([
      "true",
      "false",
    ]);
    (toggles[1] as HTMLButtonElement).click();
    flushSync();
    const anchor = store.view.blocks[A]?.manifest.graphical?.matchstamps?.[0]?.alignment_anchors[1];
    expect(anchor?.display).toEqual(["line", "name"]);
  });
});

describe("MatchClaims and beliefs", () => {
  it("lists the beliefs and the user's own, every belief button disabled", () => {
    const store = storeOf(tableManifest());
    const table = matchTable();
    const { shown } = matchIndexes(table, DEFAULT_MATCH_CLAIM_FILTER, ME);

    show(store, potential(shown, "clt_1", q(4)), tablesWith(table));
    const other = document.querySelector("li[data-claim='claim_4']");
    expect(other?.querySelector(".beliefs")?.textContent?.trim()).toBe(
      "tag:example.org,2026:other: true",
    );
    unmount(mounted as ReturnType<typeof mount>);
    mounted = null;

    show(store, potential(shown, "cpt_1", 8), tablesWith(table));
    const mine = document.querySelector("li[data-claim='claim_5']");
    const buttons = [...(mine?.querySelectorAll("button") ?? [])];
    expect(
      buttons.map((item) => [
        item.textContent,
        item.getAttribute("aria-pressed"),
        item.disabled,
        item.title,
      ]),
    ).toEqual([
      ["True", "true", true, NO_ROUTE],
      ["Unlikely", "false", true, NO_ROUTE],
      ["False", "false", true, NO_ROUTE],
    ]);
  });
});

describe("the MatchClaim filter", () => {
  it("lists the timelines and stores the filter per block, outside the journal", () => {
    const store = storeOf(tableManifest());
    show(store, null, tablesWith(matchTable()));
    expect(document.querySelector("[data-testid=matchstamp-hint]")).not.toBe(null);
    expect(document.querySelector("[data-testid=matchclaims-status]")?.textContent).toBe(
      "match_claims.parquet: 5 MatchClaims",
    );
    const boxes = [...document.querySelectorAll<HTMLInputElement>("input[type=checkbox]")];
    expect(boxes.map((box) => [box.parentElement?.textContent?.trim(), box.checked])).toEqual([
      ["clt_1", true],
      ["clt_2", true],
      ["cpt_1", true],
      ["dpt_1", true],
    ]);
    const journal = store.journal.length;
    boxes[2]?.click();
    flushSync();
    expect(store.view.settings.matchClaimFilters[A]).toEqual({
      timelines: ["clt_1", "clt_2", "dpt_1"],
      belief: "not_false",
    });
    boxes[2]?.click();
    flushSync();
    expect(store.view.settings.matchClaimFilters[A]).toEqual({
      timelines: null,
      belief: "not_false",
    });
    const radios = [...document.querySelectorAll<HTMLInputElement>("input[type=radio][value]")];
    radios.find((radio) => radio.value === "true")?.click();
    flushSync();
    expect(store.view.settings.matchClaimFilters[A]).toEqual({ timelines: null, belief: "true" });
    expect(store.journal.length).toBe(journal);
  });

  it("says that matches need a server, Load MatchClaims… disabled", () => {
    const store = storeOf(tableManifest());
    show(store, null, tablesWith(null));
    const load = button("Load MatchClaims…");
    expect(load.disabled).toBe(true);
    const described = document.getElementById(load.getAttribute("aria-describedby") ?? "");
    expect(described?.textContent).toBe(NO_SERVER);
    expect(document.querySelector("[data-testid=matchclaims-status]")?.textContent).toBe(
      "No MatchClaim table loaded.",
    );
  });
});

describe("the Timestamp tab", () => {
  /** The list "MatchStamps" of the Timestamp tab showing `id` of block A; `null` without one. */
  function listed(store: Store, id: string): string[] | null {
    const pin = namedPinOf(store.view, { block: A, id }, fontMetrics);
    mounted = mount(TimestampPanel, {
      target: document.body,
      context: informing(),
      props: { live: liveStore(store), pin, onpin: () => undefined },
    });
    flushSync();
    const list = document.querySelector("ul.matchstamps");
    const items = list === null ? null : [...list.children].map((item) => item.textContent ?? "");
    unmount(mounted);
    mounted = null;
    return items;
  }

  it("lists the MatchStamps a match timestamp belongs to, and none for an ordinary one", () => {
    const store = storeOf(tableManifest());
    nameDownbeat(store);
    unmount(mounted as ReturnType<typeof mount>);
    mounted = null;
    expect(
      store.dispatch({
        type: "add",
        into: { block: A, id: "clt_1" },
        timestamp: { name: "Theme", coordinate: [1, 1] },
      }),
    ).toBe(null);
    expect(listed(store, "timestamp_1")).toEqual(["Downbeat matchstamp_1"]);
    expect(listed(store, "timestamp_4")).toBe(null);
  });
});
