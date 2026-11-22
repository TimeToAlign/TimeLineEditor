/** The Matchstamp tab; the expected values are derived in `README.md` ("MatchClaims and the Matchstamp tab"). */

import { liveStore } from "@timetoalign/tilie-arranger";
import type { MatchClaimTable } from "@timetoalign/tilie-client";
import type { AnchorIndex, CommandEntry, Store } from "@timetoalign/tilie-core";
import {
  coordinateOf,
  DEFAULT_BELIEFS,
  DEFAULT_MATCH_CLAIM_FILTER,
  matchClaimColumns,
} from "@timetoalign/tilie-core";
import { fontMetrics, JsonFloat } from "@timetoalign/timetoshare";
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

/** The command of the store's last journal entry. */
function lastCommand(store: Store): unknown {
  return (store.journal.at(-1) as CommandEntry | undefined)?.command;
}

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

/** On `bundle_mixed`: the child "Second half" of the group member `score`, 4 quarters at offset 4. */
const SECOND_HALF = {
  type: "add",
  into: { block: A, id: "score" },
  child: {
    id: "second-half",
    name: "Second half",
    offset: [4, 1],
    unit: "quarters",
    length: [4, 1],
    locked: true,
  },
} as const;

/** The groups of the Coordinates shown, each [heading, rows as [label, text, disabled, unit]]. */
function shownGroups(): unknown[] {
  return [...(document.querySelector("section.coordinates")?.querySelectorAll("tbody") ?? [])].map(
    (body) => [
      body.querySelector('th[scope="colgroup"]')?.textContent,
      [...body.querySelectorAll("tr[data-row]")].map((row) => {
        const input = row.querySelector("input");
        return [
          row.querySelector('th[scope="row"]')?.textContent,
          input?.value,
          input?.disabled,
          row.querySelector(".unit")?.textContent,
        ];
      }),
    ],
  );
}

/** Press the GroupStamp toggle in the Lines entry of the match timestamp `id`. */
function pressGroupstamp(id: string): void {
  const toggle = document.querySelector<HTMLButtonElement>(
    `section.lines li[data-timestamp='${id}'] .groupstamp .toggle`,
  );
  if (toggle === null) throw new Error(`no GroupStamp toggle on ${id}`);
  toggle.click();
  flushSync();
}

/** Shown read-only in the Matchstamp tab, editable in the Timestamp tab: groups compared without that. */
function withoutDisabled(groups: unknown[]): unknown[] {
  return (groups as [string, unknown[][]][]).map(([heading, rows]) => [
    heading,
    rows.map(([label, text, , unit]) => [label, text, unit]),
  ]);
}

/**
 * The groups the Timestamp tab shows for the match timestamp on `timeline`
 * of block A (its own pin, `namedPinOf`), without the disabled flags; the
 * tab is mounted and left for `afterEach` to unmount.
 */
function timestampTabGroups(store: Store, timeline: string): unknown[] {
  const own = store.view.blocks[A]?.manifest.graphical?.timestamps?.find(
    (item) => item.matchstamp && item.timeline === timeline,
  );
  if (own === undefined) throw new Error("the match timestamp is stored");
  const pin = namedPinOf(store.view, { block: A, id: own.id }, fontMetrics);
  mounted = mount(TimestampPanel, {
    target: document.body,
    context: informing(),
    props: { live: liveStore(store), pin, onpin: () => undefined },
  });
  flushSync();
  return withoutDisabled(shownGroups());
}

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

  it("list each timestamp's conversion-map rows beside its coordinate as they are drawn", async () => {
    const written: string[] = [];
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: async (text: string) => {
          written.push(text);
        },
      },
    });
    const store = storeOf(tableManifest());
    expect(
      store.dispatch({
        type: "add",
        into: { block: A, id: "cpt_1" },
        map: {
          type: "LinearMap",
          id: "rate",
          name: "Rate",
          source_unit: "seconds",
          target_unit: "samples",
          scalar: 44100,
          offset: 0,
        },
      }),
    ).toBe(null);
    const table = matchTable();
    show(store, potential(indexesUnder(table).shown, "cpt_1", 8.0), tablesWith(table));
    const area = document.querySelector("section.coordinates");
    const groups = [...(area?.querySelectorAll("tbody") ?? [])].map((body) => [
      body.querySelector('th[scope="colgroup"]')?.textContent,
      [...body.querySelectorAll("tr[data-row]")].map((row) => {
        const input = row.querySelector("input");
        return [
          row.querySelector('th[scope="row"]')?.textContent,
          input?.value,
          input?.disabled,
          row.querySelector(".unit")?.textContent,
        ];
      }),
    ]);
    // `rate` is drawn above `cpt_1`'s line, so before its coordinate.
    expect(groups).toEqual([
      [
        "cpt_1",
        [
          ["Rate", "352800", true, "smp"],
          ["coordinate", "8.0", true, "s"],
        ],
      ],
      ["dpt_1", [["coordinate", "352800", true, "smp"]]],
    ]);
    const rate = area?.querySelectorAll<HTMLButtonElement>("tr[data-row] td.copy button");
    for (const button of [...(rate ?? [])].slice(0, 3)) button.click();
    await vi.waitFor(() => expect(written).toHaveLength(3));
    expect(written).toEqual(["352800", "352800 samples", "352 800 smp"]);
  });

  it("list the ancestors of each timestamp's timeline exactly as the Timestamp tab does", () => {
    const store = storeOf("bundles/bundle_mixed");
    expect(store.dispatch(SECOND_HALF)).toBe(null);
    expect(
      store.dispatch({
        type: "add",
        into: { block: A },
        matchstamp: {
          name: "Climax",
          anchors: [
            [
              { timeline: "second-half", coordinate: [2, 1] },
              { timeline: "performance", coordinate: 3.0 },
            ],
          ],
          match_claims: ["claim_1"],
        },
      }),
    ).toBe(null);
    show(store, { kind: "named", block: A, id: "matchstamp_1" }, tablesWith(null));
    const before = store.journal.length;
    pressGroupstamp("timestamp_11");
    pressGroupstamp("timestamp_12");
    expect(store.journal.length).toBe(before + 2);
    const matchstamp = shownGroups();
    expect(matchstamp).toEqual([
      ["Second half", [["coordinate", "2", true, "♩"]]],
      ["Score", [["coordinate", "6", true, "♩"]]],
      [
        "Performance",
        [
          ["cmap_3", "132300", true, "smp"],
          ["coordinate", "3.0", true, "s"],
        ],
      ],
    ]);
    unmountTab();

    expect(timestampTabGroups(store, "second-half")).toEqual(
      withoutDisabled(matchstamp.slice(0, 2)),
    );
  });

  it("list the crossed descendants and only the drawn maps, exactly as the Timestamp tab does", () => {
    const store = storeOf("bundles/bundle_mixed");
    expect(store.dispatch(SECOND_HALF)).toBe(null);
    expect(
      store.dispatch({
        type: "style",
        select: { addresses: [{ id: "score", facet: "conversion_maps" }] },
        set: { display: "none" },
        blocks: [A],
      }),
    ).toBe(null);
    expect(
      store.dispatch({
        type: "add",
        into: { block: A },
        matchstamp: {
          name: "Turn",
          anchors: [
            [
              { timeline: "score", coordinate: [6, 1] },
              { timeline: "performance", coordinate: 3.0 },
            ],
          ],
          match_claims: ["claim_1"],
        },
      }),
    ).toBe(null);
    show(store, { kind: "named", block: A, id: "matchstamp_1" }, tablesWith(null));
    pressGroupstamp("timestamp_11");
    pressGroupstamp("timestamp_12");
    const matchstamp = shownGroups();
    expect(matchstamp).toEqual([
      ["Second half", [["coordinate", "2", true, "♩"]]],
      ["Score", [["coordinate", "6", true, "♩"]]],
      [
        "Performance",
        [
          ["cmap_3", "132300", true, "smp"],
          ["coordinate", "3.0", true, "s"],
        ],
      ],
    ]);
    unmountTab();
    expect(timestampTabGroups(store, "score")).toEqual(withoutDisabled(matchstamp.slice(0, 2)));
  });
});

describe("an ancestor card raised", () => {
  /** The timelines of `group_parent_both` the tables below hold MatchClaims on. */
  const TIMELINES = [
    { id: "middle", numberType: "fraction" },
    { id: "piece", numberType: "fraction" },
    { id: "recording", numberType: "float" },
  ] as const;
  /** `middle` 1 ↔ `piece` 3. */
  const MIDDLE_PIECE = { id: "p_2", timelines: [0, 1], start: [q(1), q(3)] } as const;
  /** `piece` 3 ↔ `recording` 2.5, the group partner of `piece`'s child `middle`. */
  const PIECE_RECORDING = { id: "p_1", timelines: [1, 2], start: [q(3), 2.5] } as const;

  /** A table of `claims` on `TIMELINES` without beliefs. */
  function claimTable(
    claims: readonly Parameters<typeof matchClaimColumns>[1][number][],
  ): MatchClaimTable {
    const columns = matchClaimColumns(TIMELINES, claims);
    const beliefs = {
      actors: [],
      offsets: new Uint32Array(claims.length + 1),
      actor: Uint32Array.from([]),
      word: Uint8Array.from([]),
    };
    return { columns, beliefs };
  }

  /** A table of one MatchClaim `p_1`: `middle` 1 ↔ `piece` 3 of `group_parent_both`. */
  const pieceTable = () => claimTable([{ ...MIDDLE_PIECE, id: "p_1" }]);

  it("orders the Coordinates by the places the raised card gives", () => {
    const store = storeOf("groups/group_parent_both");
    const table = pieceTable();
    const { shown } = indexesUnder(table);
    show(store, potential(shown, "middle", q(1)), tablesWith(table));
    const group = (heading: string, value: string, unit: string) => [
      heading,
      [["coordinate", value, true, unit]],
    ];
    const piece5 = group("Piece", "5", "♩");
    const middle = group("Middle", "1", "♩");
    const recording = group("Recording", "1.25", "s");
    // On the arranger `piece`'s ancestor line (67.78125) lies above `middle`'s line (81.78125).
    const throughMiddle = [piece5, middle, recording];
    const piece = group("Piece", "3", "♩");
    expect(shownGroups()).toEqual([...throughMiddle, piece]);
    expect(store.open({ block: A, id: "piece" })).toBeNull();
    flushSync();
    // Raised: `middle` 1 on the card's row (33.8046875) above `piece` 3 on its line (67.78125).
    expect(shownGroups()).toEqual([middle, piece5, recording, piece]);
    store.done();
    flushSync();
    expect(shownGroups()).toEqual([...throughMiddle, piece]);
  });

  /**
   * The command naming the potential MatchStamp of `piece` 3 "Pickup"
   * stores, as JSON, with `piece`'s timeline editor open when `raised`;
   * the store, left with the MatchStamp named, is handed to `named`.
   */
  function namePickup(raised: boolean, named?: (store: Store) => void): string {
    const store = storeOf("groups/group_parent_both");
    const table = claimTable([PIECE_RECORDING]);
    show(store, potential(indexesUnder(table).shown, "piece", q(3)), tablesWith(table));
    const group = (heading: string, value: string, unit: string) => [
      heading,
      [["coordinate", value, true, unit]],
    ];
    const throughRecording = [
      group("Piece", "6", "♩"),
      group("Middle", "2", "♩"),
      group("Recording", "2.5", "s"),
    ];
    const piece = group("Piece", "3", "♩");
    if (raised) {
      expect(store.open({ block: A, id: "piece" })).toBeNull();
      flushSync();
      // Raised: `recording` 2.5's group member `middle` 2 is read on the card's row (33.8046875),
      // its ancestor `piece` 6 on the card's `piece` line (67.78125), above `recording` (139.16015625).
      const [piece6, middle2, recording] = throughRecording;
      expect(shownGroups()).toEqual([piece, middle2, piece6, recording]);
    } else expect(shownGroups()).toEqual([...throughRecording, piece]);
    const before = store.journal.length;
    name("Pickup");
    expect(store.journal.length).toBe(before + 1);
    const command = JSON.stringify(lastCommand(store));
    unmountTab();
    named?.(store);
    return command;
  }

  it("stores what naming stores with no editor open, whichever editor is open", () => {
    const stored = namePickup(false);
    expect(JSON.parse(stored)).toEqual({
      type: "add",
      into: { block: A },
      matchstamp: {
        name: "Pickup",
        anchors: [
          [
            { timeline: "recording", coordinate: 2.5 },
            { timeline: "piece", coordinate: [3, 1] },
          ],
        ],
        match_claims: ["p_1"],
      },
    });
    expect(namePickup(true)).toBe(stored);
  });

  it("stores what Update stores with no editor open, whichever editor is open", () => {
    /** The `set` Update sends against the table of both MatchClaims, `piece`'s editor open when `raised`. */
    function update(raised: boolean): string {
      let command = "";
      namePickup(false, (store) => {
        const table = claimTable([PIECE_RECORDING, MIDDLE_PIECE]);
        const pickup = store.view.blocks[A]?.manifest.graphical?.matchstamps?.[0]?.id;
        if (pickup === undefined) throw new Error("Pickup is named");
        show(store, { kind: "named", block: A, id: pickup }, tablesWith(table));
        if (raised) {
          expect(store.open({ block: A, id: "piece" })).toBeNull();
          flushSync();
        }
        const before = store.journal.length;
        button("Update").click();
        flushSync();
        expect(store.journal.length).toBe(before + 1);
        command = JSON.stringify(lastCommand(store));
        unmountTab();
      });
      return command;
    }
    const stored = update(false);
    expect(JSON.parse(stored)).toEqual({
      type: "set",
      changes: [
        {
          target: { block: A, id: "matchstamp_1" },
          values: {
            anchors: [
              [
                { timeline: "middle", coordinate: [1, 1] },
                { timeline: "piece", coordinate: [3, 1] },
              ],
              [
                { timeline: "recording", coordinate: 2.5 },
                { timeline: "piece", coordinate: [3, 1] },
              ],
            ],
            match_claims: ["p_1", "p_2"],
          },
        },
      ],
    });
    expect(update(true)).toBe(stored);
  });
});

describe("Lines", () => {
  /** The lines as [kind, label, the labels of the toggles pressed, disabled]. */
  function lines(): unknown[] {
    return [...document.querySelectorAll("section.lines li")].map((item) => {
      const toggles = [...item.querySelectorAll<HTMLButtonElement>(".toggle")];
      return [
        item.getAttribute("data-line"),
        item.querySelector(".line-name")?.textContent?.replace(/\s+/g, " ").trim(),
        toggles.filter((t) => t.getAttribute("aria-pressed") === "true").map((t) => t.textContent),
        toggles.every((t) => t.disabled),
      ];
    });
  }
  const ALL = ["Wedge", "Name", "ID", "Coordinate", "Line"];
  /** The toggle `label` of the line whose element matches `selector`. */
  function toggleOf(selector: string, label: string): HTMLButtonElement {
    const found = [...document.querySelectorAll<HTMLButtonElement>(`${selector} .toggle`)].find(
      (item) => item.textContent === label,
    );
    if (found === undefined) throw new Error(`no toggle ${label} in ${selector}`);
    return found;
  }

  it("list a potential MatchStamp's lines in screen order, alternating, inactive", () => {
    const store = storeOf(tableManifest());
    const table = matchTable();
    show(store, potential(indexesUnder(table).shown, "clt_1", q(0)), tablesWith(table));
    expect(lines()).toEqual([
      ["timestamp", "clt_1 0 ♩", ["Line"], true],
      ["anchor", "clt_1 – cpt_1", [], true],
      ["timestamp", "cpt_1 0″", ["Line"], true],
      ["anchor", "clt_1 – dpt_1", [], true],
      ["timestamp", "dpt_1 0 smp", ["Line"], true],
    ]);
    expect(
      [...document.querySelectorAll("section.lines li[data-line=timestamp]")].map((item) =>
        [...item.querySelectorAll(".toggle")].map((t) => t.textContent),
      ),
    ).toEqual([ALL, ALL, ALL]);
  });

  it("toggle a named MatchStamp's timestamp and anchor displays, one entry each", () => {
    const store = storeOf(tableManifest());
    nameDownbeat(store);
    unmountTab();
    show(store, { kind: "named", block: A, id: "matchstamp_1" }, tablesWith(null));
    expect(lines()).toEqual([
      ["timestamp", "clt_1 0 ♩ timestamp_1", ["Line"], false],
      ["anchor", "clt_1 – cpt_1 anchor_1", ["Line", "Name"], false],
      ["timestamp", "cpt_1 0″ timestamp_2", ["Line"], false],
      ["anchor", "clt_1 – dpt_1 anchor_2", ["Line"], false],
      ["timestamp", "dpt_1 0 smp timestamp_3", ["Line"], false],
    ]);
    const before = store.journal.length;
    toggleOf("li[data-timestamp='timestamp_2']", "Wedge").click();
    flushSync();
    expect(store.journal.length).toBe(before + 1);
    expect(lastCommand(store)).toEqual({
      type: "set",
      changes: [
        {
          target: { block: A, id: "timestamp_2" },
          values: { display: ["wedge", "cross_section"] },
        },
      ],
    });
    toggleOf("li[data-anchor='anchor_2']", "Name").click();
    flushSync();
    expect(store.journal.length).toBe(before + 2);
    expect(lines()[2]).toEqual(["timestamp", "cpt_1 0″ timestamp_2", ["Wedge", "Line"], false]);
    expect(lines()[3]).toEqual(["anchor", "clt_1 – dpt_1 anchor_2", ["Line", "Name"], false]);
  });

  it("say where a match timestamp is a line of another MatchStamp too", () => {
    const store = storeOf(tableManifest());
    nameDownbeat(store);
    unmountTab();
    expect(
      store.dispatch({
        type: "add",
        into: { block: A },
        matchstamp: {
          name: "Other",
          anchors: [
            [
              { timeline: "clt_1", coordinate: [0, 1] },
              { timeline: "dpt_1", coordinate: 176400 },
            ],
          ],
          match_claims: ["claim_3"],
        },
      }),
    ).toBe(null);
    show(store, { kind: "named", block: A, id: "matchstamp_1" }, tablesWith(null));
    expect(
      [...document.querySelectorAll("section.lines li")].map(
        (item) => item.querySelector(".shared")?.textContent?.replace(/\s+/g, " ").trim() ?? null,
      ),
    ).toEqual([
      "Also a line of MatchStamp 'Other': a change shows there too.",
      null,
      null,
      null,
      null,
    ]);
  });
});

describe("GroupStamps", () => {
  /** `bundle_mixed` with "Second half" under `score` and `score`'s conversion-maps band hidden. */
  function mixedStore(): Store {
    const store = storeOf("bundles/bundle_mixed");
    expect(store.dispatch(SECOND_HALF)).toBe(null);
    expect(
      store.dispatch({
        type: "style",
        select: { addresses: [{ id: "score", facet: "conversion_maps" }] },
        set: { display: "none" },
        blocks: [A],
      }),
    ).toBe(null);
    return store;
  }

  /** "Turn" named on `store` and shown. */
  function showTurn(store: Store): void {
    expect(
      store.dispatch({
        type: "add",
        into: { block: A },
        matchstamp: {
          name: "Turn",
          anchors: [
            [
              { timeline: "score", coordinate: [6, 1] },
              { timeline: "performance", coordinate: 3.0 },
            ],
          ],
          match_claims: ["claim_1"],
        },
      }),
    ).toBe(null);
    show(store, { kind: "named", block: A, id: "matchstamp_1" }, tablesWith(null));
  }

  /**
   * The lines as [kind, label, display toggles pressed, GroupStamp pressed
   * (`null` without the toggle), every toggle disabled].
   */
  function lineStates(): unknown[] {
    return [...document.querySelectorAll("section.lines li")].map((item) => {
      const display = [...item.querySelectorAll<HTMLButtonElement>(".toggle")].filter(
        (toggle) => toggle.closest(".groupstamp") === null,
      );
      const groupstamp = item.querySelector<HTMLButtonElement>(".groupstamp .toggle");
      return [
        item.getAttribute("data-line"),
        item.querySelector(".line-name")?.textContent?.replace(/\s+/g, " ").trim(),
        display.filter((t) => t.getAttribute("aria-pressed") === "true").map((t) => t.textContent),
        groupstamp === null ? null : groupstamp.getAttribute("aria-pressed") === "true",
        [...item.querySelectorAll<HTMLButtonElement>(".toggle")].every((t) => t.disabled),
      ];
    });
  }

  /** The Coordinates as [heading, data-through, caption, rows as [label, text, disabled, unit]]. */
  function throughGroups(): unknown[] {
    const bodies = document.querySelector("section.coordinates")?.querySelectorAll("tbody") ?? [];
    return [...bodies].map((body, at) => [
      body.querySelector('th[scope="colgroup"]')?.textContent,
      body.getAttribute("data-through"),
      body.querySelector("tr.through")?.textContent,
      (shownGroups()[at] as [string, unknown[]])[1],
    ]);
  }

  /** The rows set apart as the coordinates the MatchClaims state, as [group index, label]. */
  function claimedRows(): unknown[] {
    const bodies = document.querySelector("section.coordinates")?.querySelectorAll("tbody") ?? [];
    return [...bodies].flatMap((body, at) =>
      [...body.querySelectorAll("tr.claimed")].map((row) => [
        at,
        row.querySelector('th[scope="row"]')?.textContent,
      ]),
    );
  }

  const SCORE_GROUPS = [
    ["Second half", "crossed", "crossed by its line", [["coordinate", "2", true, "♩"]]],
    ["Score", "claimed", "stated by MatchClaims", [["coordinate", "6", true, "♩"]]],
    [
      "Performance",
      "group",
      "through group 'Performance'",
      [
        ["cmap_3", "275625", true, "smp"],
        ["coordinate", "6.25", true, "s"],
      ],
    ],
  ];
  const PERFORMANCE_CLAIMED = [
    "Performance",
    "claimed",
    "stated by MatchClaims",
    [
      ["cmap_3", "132300", true, "smp"],
      ["coordinate", "3.0", true, "s"],
    ],
  ];

  it("are a named MatchStamp's match timestamps on grouped timelines, by default", () => {
    const store = mixedStore();
    showTurn(store);
    expect(lineStates()).toEqual([
      ["timestamp", "Score 6 ♩ timestamp_11", ["Line"], true, false],
      ["anchor", "Score – Performance anchor_1", ["Line", "Name"], null, false],
      ["timestamp", "Performance 3″ timestamp_12", ["Line"], true, false],
    ]);
    expect(
      [...document.querySelectorAll("section.lines .groupstamp .hint")].map(
        (item) => item.textContent,
      ),
    ).toEqual([
      "A GroupStamp's line crosses every member of 'Performance'.",
      "A GroupStamp's line crosses every member of 'Performance'.",
    ]);
  });

  it("list the group members, the coordinates the MatchClaims state set apart", () => {
    const store = mixedStore();
    showTurn(store);
    expect(throughGroups()).toEqual([
      ...SCORE_GROUPS,
      ["Score", "group", "through group 'Performance'", [["coordinate", "72/25", true, "♩"]]],
      PERFORMANCE_CLAIMED,
    ]);
    expect(claimedRows()).toEqual([
      [1, "coordinate"],
      [4, "coordinate"],
    ]);
  });

  it("are turned off by the toggle, in one entry", () => {
    const store = mixedStore();
    showTurn(store);
    const before = store.journal.length;
    pressGroupstamp("timestamp_12");
    expect(store.journal.length).toBe(before + 1);
    expect(lastCommand(store)).toEqual({
      type: "set",
      changes: [{ target: { block: A, id: "timestamp_12" }, values: { groupstamp: false } }],
    });
    expect(lineStates()[2]).toEqual([
      "timestamp",
      "Performance 3″ timestamp_12",
      ["Line"],
      false,
      false,
    ]);
    expect(throughGroups()).toEqual([...SCORE_GROUPS, PERFORMANCE_CLAIMED]);
    expect(claimedRows()).toEqual([
      [1, "coordinate"],
      [3, "coordinate"],
    ]);
    unmountTab();
    expect(timestampTabGroups(store, "score")).toEqual(
      withoutDisabled(SCORE_GROUPS.map(([heading, , , rows]) => [heading, rows])),
    );
    expect(document.querySelector("section.coordinates tbody[data-through]")).toBe(null);
    expect(document.querySelector("section.coordinates tr.through")).toBe(null);
  });

  /** The table of one MatchClaim `id` joining `score` at `quarter` to `performance` at 3.0. */
  function scoreToPerformance(id: string, quarter: number): MatchClaimTables {
    const table: MatchClaimTable = {
      columns: matchClaimColumns(
        [
          { id: "performance", numberType: "float" },
          { id: "score", numberType: "fraction" },
        ],
        [{ id, timelines: [1, 0], start: [q(quarter), 3] }],
      ),
      beliefs: {
        actors: [],
        offsets: Uint32Array.from([0, 0]),
        actor: Uint32Array.from([]),
        word: Uint8Array.from([]),
      },
    };
    return tablesWith(table);
  }

  /** Show the potential MatchStamp of `score` at `quarter` of the one MatchClaim of `tables`. */
  function showPotential(store: Store, tables: MatchClaimTables, quarter: number): void {
    const shown = indexesOver(liveStore(store), tables)(A)?.shown;
    if (shown === undefined) throw new Error("the block holds the table");
    show(store, potential(shown, "score", q(quarter)), tables);
  }

  it("show on a potential MatchStamp the GroupStamps naming stores, the group read", () => {
    const store = mixedStore();
    showPotential(store, scoreToPerformance("claim_1", 6), 6);
    expect(lineStates()).toEqual([
      ["timestamp", "Score 6 ♩", ["Line"], true, true],
      ["anchor", "Score – Performance", [], null, true],
      ["timestamp", "Performance 3″", ["Line"], true, true],
    ]);
    const potentialGroups = throughGroups();
    expect(potentialGroups).toEqual([
      ...SCORE_GROUPS,
      ["Score", "group", "through group 'Performance'", [["coordinate", "72/25", true, "♩"]]],
      PERFORMANCE_CLAIMED,
    ]);
    expect(store.view.blocks[A]?.manifest.graphical?.matchstamps).toEqual([]);
    unmountTab();
    showTurn(store);
    expect(throughGroups()).toEqual(potentialGroups);
  });

  it("show a reused match timestamp's own GroupStamp on a potential MatchStamp", () => {
    const store = mixedStore();
    showTurn(store);
    pressGroupstamp("timestamp_12");
    unmountTab();
    showPotential(store, scoreToPerformance("claim_2", 5), 5);
    expect(lineStates()).toEqual([
      ["timestamp", "Score 5 ♩", ["Line"], true, true],
      ["anchor", "Score – Performance", [], null, true],
      ["timestamp", "Performance 3″", ["Line"], false, true],
    ]);
    expect(throughGroups()).toEqual([
      ["Second half", "crossed", "crossed by its line", [["coordinate", "1", true, "♩"]]],
      ["Score", "claimed", "stated by MatchClaims", [["coordinate", "5", true, "♩"]]],
      [
        "Performance",
        "group",
        "through group 'Performance'",
        [
          ["cmap_3", "229688", true, "smp"],
          ["coordinate", "5.208333333333333", true, "s"],
        ],
      ],
      PERFORMANCE_CLAIMED,
    ]);
    name("Cue");
    const stamps = store.view.blocks[A]?.manifest.graphical?.timestamps ?? [];
    expect(
      stamps
        .filter((item) => item.matchstamp)
        .map((item) => [item.id, item.timeline, item.coordinate, item.groupstamp]),
    ).toEqual([
      ["timestamp_12", "performance", new JsonFloat(3), false],
      ["timestamp_13", "score", [5, 1], true],
      ["timestamp_11", "score", [6, 1], true],
    ]);
    unmountTab();
    show(store, { kind: "named", block: A, id: "matchstamp_2" }, tablesWith(null));
    expect(lineStates()).toEqual([
      ["timestamp", "Score 5 ♩ timestamp_13", ["Line"], true, false],
      ["anchor", "Score – Performance anchor_2", ["Line", "Name"], null, false],
      ["timestamp", "Performance 3″ timestamp_12", ["Line"], false, false],
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
      [...document.querySelectorAll<HTMLButtonElement>("section.lines .toggle")].map(
        (item) => item.disabled,
      ),
    ]).toEqual([
      "matchstamp-name",
      "Name",
      ["Coordinates", "Lines", "MatchClaims", "MatchClaim filter"],
      ["Naming the MatchStamp stores it; then its lines' display can be set."],
      Array.from({ length: 19 }, () => true),
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
    expect(document.querySelector("section.claims > p[role=status]")?.textContent).toBe("");
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

  it("offers the GroupStamp on a match timestamp of a group member", () => {
    const store = storeOf(tableManifest());
    expect(
      store.dispatch({
        type: "add",
        into: { block: A },
        group: { id: "group_1", members: ["clt_1", "cpt_1"] },
      }),
    ).toBe(null);
    nameDownbeat(store);
    unmountTab();
    const pin = namedPinOf(store.view, { block: A, id: "timestamp_1" }, fontMetrics);
    mounted = mount(TimestampPanel, {
      target: document.body,
      context: informing(),
      props: { live: liveStore(store), pin, onpin: () => undefined },
    });
    flushSync();
    const field = document.querySelector("[data-testid=timestamp-groupstamp]");
    const toggle = field?.querySelector<HTMLButtonElement>(".toggle");
    const hint = field?.querySelector(".hint")?.textContent;
    expect([
      pin?.named?.matchstamp,
      toggle?.getAttribute("aria-pressed"),
      toggle?.disabled,
      hint,
    ]).toEqual([true, "true", false, "A GroupStamp's line crosses every member of 'group_1'."]);
    toggle?.click();
    flushSync();
    expect(lastCommand(store)).toEqual({
      type: "set",
      changes: [{ target: { block: A, id: "timestamp_1" }, values: { groupstamp: false } }],
    });
  });
});
