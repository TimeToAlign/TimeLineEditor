/** The Matchstamp tab; the expected values are derived in `README.md` ("MatchClaims and the Matchstamp tab"). */

import { liveStore } from "@timetoalign/tilie-arranger";
import type { MatchClaimTable } from "@timetoalign/tilie-client";
import type { AnchorIndex, Store } from "@timetoalign/tilie-core";
import { coordinateOf, DEFAULT_BELIEFS, DEFAULT_MATCH_CLAIM_FILTER } from "@timetoalign/tilie-core";
import { fontMetrics } from "@timetoalign/timetoshare";
import { flushSync, mount, unmount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import MatchstampPanel from "../src/inspector/MatchstampPanel.svelte";
import { matchIndexes } from "../src/inspector/matchstamps.ts";
import TimestampPanel from "../src/inspector/TimestampPanel.svelte";
import type { HeldMatch } from "../src/inspector/tabs.ts";
import { namedPinOf } from "../src/inspector/timestamp.ts";
import { MatchClaimTables } from "../src/matchClaims.svelte.ts";
import { BELIEFS_BY_ROW, indexesOver, ME, matchTable, q, tableManifest } from "./matches.ts";
import { informing, providing, storeOf } from "./support.ts";

const A = "0000000000";
const NO_SERVER = "Matches need a server: MatchClaim tables are read through tilie-server.";

let mounted: ReturnType<typeof mount> | null = null;

afterEach(() => {
  if (mounted !== null) unmount(mounted);
  mounted = null;
  document.body.innerHTML = "";
});

/** Tables held without a server, `table` as block A's when given. */
function tablesWith(table: MatchClaimTable | null): MatchClaimTables {
  const tables = new MatchClaimTables(null);
  if (table !== null) {
    tables.hold(A, { name: "match_claims.parquet", table, file: new Blob([]), changed: false });
  }
  return tables;
}

/** Mount the tab on `store`, showing `match`; the MatchStamps it reports are appended to `reported`. */
function show(
  store: Store,
  match: HeldMatch | null,
  tables: MatchClaimTables,
  reported: (HeldMatch | null)[] = [],
): void {
  const live = liveStore(store);
  mounted = mount(providing(MatchstampPanel), {
    target: document.body,
    context: informing(),
    props: {
      live,
      block: store.view.blocks[A] ?? null,
      match,
      tables,
      indexesOf: indexesOver(live, tables),
      onmatch: (next: HeldMatch | null) => {
        reported.push(next);
      },
    },
  });
  flushSync();
}

/** Unmount the tab mounted last. */
function unmountTab(): void {
  if (mounted !== null) unmount(mounted);
  mounted = null;
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
/** The indexes of `table` under `filter` for the user, under the table manifest's context. */
const indexesUnder = (table: MatchClaimTable, filter = DEFAULT_MATCH_CLAIM_FILTER) =>
  matchIndexes(table, filter, ME, tableManifest()["@context"]);

function nameDownbeat(store: Store, table: MatchClaimTable = matchTable()): (HeldMatch | null)[] {
  const { shown } = indexesUnder(table);
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
    expect(document.querySelector("[data-testid=matchstamp-hidden-anchors]")).toBe(null);
  });

  it("stores the whole MatchStamp under a timelines filter, saying so first", () => {
    const store = storeOf(tableManifest());
    const filter = { timelines: ["clt_1", "dpt_1"], beliefs: DEFAULT_BELIEFS } as const;
    expect(store.configure({ matchClaimFilters: { [A]: filter } })).toBe(null);
    const table = matchTable();
    const { shown } = indexesUnder(table, filter);
    const reported: (HeldMatch | null)[] = [];
    show(store, potential(shown, "clt_1", q(0)), tablesWith(table), reported);
    expect(
      [...document.querySelectorAll("li[data-claim]")].map((item) =>
        item.getAttribute("data-claim"),
      ),
    ).toEqual(["claim_1"]);
    const note = document.querySelector("[data-testid=matchstamp-hidden-anchors]");
    expect(note?.textContent).toBe(
      "Naming also stores 1 anchor on timelines the MatchClaim filter hides.",
    );
    expect(nameField().getAttribute("aria-describedby")?.split(" ")).toContain(note?.id);

    const before = store.journal.length;
    name("Downbeat");
    expect(store.journal.length).toBe(before + 1);
    expect(reported).toEqual([{ kind: "named", block: A, id: "matchstamp_1" }]);
    const [stored] = store.view.blocks[A]?.manifest.graphical?.matchstamps ?? [];
    expect(
      stored?.alignment_anchors.map((anchor) => [anchor.id, anchor.timestamps, anchor.display]),
    ).toEqual([
      ["anchor_1", ["timestamp_1", "timestamp_2"], ["line", "name"]],
      ["anchor_2", ["timestamp_1", "timestamp_3"], ["line"]],
    ]);
    expect(stored?.match_claims).toEqual(["claim_1", "claim_2"]);

    unmountTab();
    show(store, { kind: "named", block: A, id: "matchstamp_1" }, tablesWith(table));
    expect(document.querySelector("[data-testid=matchstamp-differences]")).toBe(null);
    expect([...document.querySelectorAll("li.gone")]).toEqual([]);
  });

  it("closes a timeline editor first, and keeps a bundle editor of the block", () => {
    const timeline = storeOf(tableManifest());
    expect(timeline.open({ block: A, id: "cpt_1" })).toBe(null);
    nameDownbeat(timeline);
    expect(timeline.editing.length).toBe(0);
    expect(timeline.view.blocks[A]?.manifest.graphical?.matchstamps?.length).toBe(1);
    unmountTab();

    const bundle = storeOf(tableManifest());
    expect(bundle.open({ block: A })).toBe(null);
    nameDownbeat(bundle);
    expect(bundle.editing.map((open) => open.kind)).toEqual(["bundle"]);
    expect(bundle.view.blocks[A]?.manifest.graphical?.matchstamps?.length).toBe(1);
  });
});

describe("Coordinates", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("are the Timestamp tab's fields, disabled, with its three Copy columns", async () => {
    const written: string[] = [];
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: async (text: string) => {
          written.push(text);
        },
      },
    });
    const store = storeOf(tableManifest());
    const table = matchTable();
    show(store, potential(indexesUnder(table).shown, "clt_1", q(0)), tablesWith(table));
    const area = document.querySelector("section.coordinates");
    expect(
      [...(area?.querySelectorAll("thead th.copy") ?? [])].map((item) => item.textContent),
    ).toEqual(["value", "value + unit", "pretty"]);
    const groups = [...(area?.querySelectorAll("tbody") ?? [])].map((body) => [
      body.querySelector('th[scope="colgroup"]')?.textContent,
      [...body.querySelectorAll("tr[data-row]")].map((row) => {
        const input = row.querySelector("input");
        return [
          row.querySelector('th[scope="row"]')?.textContent,
          input?.value,
          input?.disabled,
          input?.getAttribute("aria-label"),
          row.querySelector(".unit")?.textContent,
          [...row.querySelectorAll("td.copy button")].map((item) => item.getAttribute("title")),
        ];
      }),
    ]);
    const COPIES = [
      "Copy the value",
      "Copy the value with its unit written out",
      "Copy the value with symbols",
    ];
    expect(groups).toEqual([
      ["clt_1", [["coordinate", "0", true, "coordinate of clt_1", "♩", COPIES]]],
      ["cpt_1", [["coordinate", "0.0", true, "coordinate of cpt_1", "s", COPIES]]],
      ["dpt_1", [["coordinate", "0", true, "coordinate of dpt_1", "smp", COPIES]]],
    ]);
    for (const button of area?.querySelectorAll<HTMLButtonElement>("td.copy button") ?? []) {
      button.click();
    }
    await vi.waitFor(() => expect(written).toHaveLength(9));
    expect(written).toEqual([
      "0",
      "0 quarters",
      "0 ♩",
      "0.0",
      "0.0 seconds",
      "0″",
      "0",
      "0 samples",
      "0 smp",
    ]);
  });
});

describe("the pane", () => {
  it("opens with the name header, has no Properties heading and waits for a name", () => {
    const store = storeOf(tableManifest());
    const table = matchTable();
    show(store, potential(indexesUnder(table).shown, "clt_1", q(0)), tablesWith(table));
    const pane = document.querySelector("section")?.parentElement;
    const described = (nameField().getAttribute("aria-describedby") ?? "")
      .split(" ")
      .map((id) => document.getElementById(id)?.textContent)
      .filter((text) => text !== "");
    expect([
      pane?.querySelector("section")?.getAttribute("data-testid"),
      pane?.querySelector("section label")?.textContent,
      [...(pane?.querySelectorAll(":scope > section > h3") ?? [])].map((item) => item.textContent),
      described,
      [...document.querySelectorAll<HTMLButtonElement>("section.anchors .toggle")].map(
        (item) => item.disabled,
      ),
    ]).toEqual([
      "matchstamp-name",
      "Name",
      ["Coordinates", "Alignment anchors", "MatchClaims", "MatchClaim filter"],
      ["Naming the MatchStamp stores it; then its anchors' display can be set."],
      [true, true, true, true],
    ]);
  });
});

describe("a named MatchStamp", () => {
  /** Block A with "Downbeat" named, the tab unmounted again. */
  function named(): Store {
    const store = storeOf(tableManifest());
    nameDownbeat(store);
    unmountTab();
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
      "MatchClaims the belief filter leaves out",
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
  it("lists the beliefs and the user's own, every belief button disabled without a server", () => {
    const store = storeOf(tableManifest());
    const table = matchTable();
    const { shown } = indexesUnder(table);
    const beliefs = (claim: string) =>
      document
        .querySelector(`li[data-claim='${claim}'] [data-testid=metadata-beliefs]`)
        ?.textContent?.replace(/\s+/g, " ")
        .trim();

    show(store, potential(shown, "clt_1", q(0)), tablesWith(table));
    expect([beliefs("claim_1"), beliefs("claim_2")]).toEqual([
      "No one has stated a belief.",
      "No one has stated a belief.",
    ]);
    unmountTab();

    show(store, potential(shown, "clt_1", q(4)), tablesWith(table));
    expect(beliefs("claim_4")).toBe("tag:example.org,2026:other believes it true");
    unmountTab();

    show(store, potential(shown, "cpt_1", 8), tablesWith(table));
    expect(beliefs("claim_5")).toBe("Gerhardt believes it true");
    const mine = document.querySelector("li[data-claim='claim_5']");
    const buttons = [...(mine?.querySelectorAll<HTMLButtonElement>("[role=group] button") ?? [])];
    expect(
      buttons.map((item) => [
        item.textContent,
        item.getAttribute("aria-pressed"),
        item.disabled,
        item.getAttribute("title"),
      ]),
    ).toEqual([
      ["True", "true", true, NO_SERVER],
      ["Unlikely", "false", true, NO_SERVER],
      ["False", "false", true, NO_SERVER],
    ]);
  });

  it("collapses every MatchClaim, expanded one at a time, its provenance behind its own button", () => {
    const store = storeOf(tableManifest());
    const table = matchTable();
    const { shown } = indexesUnder(table);
    show(store, potential(shown, "clt_1", q(0)), tablesWith(table));
    const item = (claim: string) => {
      const found = document.querySelector(`li[data-claim='${claim}']`);
      if (found === null) throw new Error(`no MatchClaim ${claim}`);
      return found;
    };
    const toggle = (claim: string) => {
      const found = item(claim).querySelector<HTMLButtonElement>("button[aria-expanded]");
      if (found === null) throw new Error(`no disclosure for ${claim}`);
      return found;
    };
    const region = (claim: string) =>
      document.getElementById(toggle(claim).getAttribute("aria-controls") ?? "");
    expect([toggle("claim_1").textContent?.trim(), toggle("claim_2").textContent?.trim()]).toEqual([
      "claim_1",
      "claim_2",
    ]);
    expect(
      ["claim_1", "claim_2"].map((claim) => [
        toggle(claim).getAttribute("aria-expanded"),
        region(claim)?.hidden,
      ]),
    ).toEqual([
      ["false", true],
      ["false", true],
    ]);

    toggle("claim_1").click();
    flushSync();
    expect(
      ["claim_1", "claim_2"].map((claim) => [
        toggle(claim).getAttribute("aria-expanded"),
        region(claim)?.hidden,
      ]),
    ).toEqual([
      ["true", false],
      ["false", true],
    ]);
    const open = region("claim_1");
    expect(open?.querySelector("p.hint")?.textContent).toBe(NO_SERVER);
    expect(open?.querySelector("[role=status]")?.textContent).toBe("");
    // The provenance opens behind its own button: the paradata alone, never the beliefs again.
    const provenance = item("claim_1").querySelector<HTMLButtonElement>(
      "button[aria-label='Provenance of claim_1']",
    );
    expect([provenance?.textContent, provenance?.getAttribute("aria-expanded")]).toEqual([
      "Provenance",
      "false",
    ]);
    expect(provenance?.hasAttribute("aria-controls")).toBe(false);
    expect(item("claim_1").querySelector("[data-testid=provenance]")).toBe(null);
    provenance?.click();
    flushSync();
    const opened = item("claim_1").querySelector("[data-testid=provenance]");
    expect(provenance?.getAttribute("aria-controls")).toBe(opened?.id);
    expect(opened?.querySelectorAll("[data-testid=metadata-beliefs], [role=group]").length).toBe(0);
    expect(opened?.querySelector("p.hint")?.textContent).toBe(NO_SERVER);
    expect(item("claim_1").querySelectorAll("[data-testid=metadata-beliefs]").length).toBe(1);

    toggle("claim_1").click();
    flushSync();
    expect([toggle("claim_1").getAttribute("aria-expanded"), region("claim_1")?.hidden]).toEqual([
      "false",
      true,
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
      beliefs: ["true", "undecided", "unlikely"],
    });
    boxes[2]?.click();
    flushSync();
    expect(store.view.settings.matchClaimFilters[A]).toEqual({
      timelines: null,
      beliefs: ["true", "undecided", "unlikely"],
    });
    const group = [...document.querySelectorAll("[role=group]")].find(
      (item) =>
        document.getElementById(item.getAttribute("aria-labelledby") ?? "")?.textContent ===
        "Beliefs",
    );
    const toggles = () =>
      [...(group?.querySelectorAll<HTMLButtonElement>("button") ?? [])].map((item) => [
        item.textContent,
        item.getAttribute("aria-pressed"),
      ]);
    expect(toggles()).toEqual([
      ["True", "true"],
      ["Undecided", "true"],
      ["Unlikely", "true"],
      ["False", "false"],
    ]);
    const press = (label: string) => {
      [...(group?.querySelectorAll<HTMLButtonElement>("button") ?? [])]
        .find((item) => item.textContent === label)
        ?.click();
      flushSync();
    };
    press("False");
    expect(store.view.settings.matchClaimFilters[A]).toEqual({
      timelines: null,
      beliefs: ["true", "undecided", "unlikely", "false"],
    });
    press("Undecided");
    expect(store.view.settings.matchClaimFilters[A]).toEqual({
      timelines: null,
      beliefs: ["true", "unlikely", "false"],
    });
    expect(toggles()).toEqual([
      ["True", "true"],
      ["Undecided", "false"],
      ["Unlikely", "true"],
      ["False", "true"],
    ]);
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
    unmountTab();
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
