/** The Timestamp tab; the expected values are derived in `README.md` ("The Timestamp tab"). */

import type { KnotsOf, Selection } from "@timetoalign/tilie-arranger";
import { liveStore, selectionOf } from "@timetoalign/tilie-arranger";
import { ServerError } from "@timetoalign/tilie-client";
import type {
  Address,
  ConversionMap,
  Expressed,
  Manifest,
  MeasureKnot,
  MeasureKnots,
  Pin,
  Store,
  Timestamp,
  TimestampSegment,
  TimestampSpec,
} from "@timetoalign/tilie-core";
import {
  coordinateDict,
  copyValue,
  copyValueWithUnit,
  displayValue,
  parseAxisValue,
  pinAt,
  positionFor,
  timestampAt,
  unitSymbol,
} from "@timetoalign/tilie-core";
import { Rational } from "@timetoalign/tilie-core/numbers";
import type { TimeUnit } from "@timetoalign/timetoshare";
import { dumps } from "@timetoalign/timetoshare";
import { flushSync, mount, unmount } from "svelte";
import { SvelteMap } from "svelte/reactivity";
import { afterEach, describe, expect, it, vi } from "vitest";
import InspectorDrawer from "../src/InspectorDrawer.svelte";
import { isLoaded, loadCodec, writeText } from "../src/inspector/formats.svelte.ts";
import { InspectorCode } from "../src/inspector/problems.ts";
import type { Pinning, Shown, UnnamedPinning } from "../src/inspector/tabs.ts";
import { chosen, outlived, pinned, pinningOf } from "../src/inspector/tabs.ts";
import { timestampValue } from "../src/inspector/timestamp.ts";
import { measureMapsOf } from "../src/measureMaps.ts";
import { MIXED, mixedStore } from "./mixed.ts";
import { storeOf } from "./support.ts";

const q = (n: number, d = 1) => Rational.fromParts(BigInt(n), BigInt(d));

type Parameter = readonly [number, number] | number;

function linear(
  id: string,
  name: string | null,
  scalar: Parameter,
  offset: Parameter,
  target: TimeUnit,
): ConversionMap {
  return {
    type: "LinearMap",
    id,
    name,
    source_unit: "quarters",
    target_unit: target,
    scalar,
    offset,
  };
}

function segment(
  timeline: string,
  offset: number,
  length: number,
  maps: readonly ConversionMap[],
): TimestampSegment {
  return {
    timeline,
    name: timeline,
    unit: "quarters",
    numberType: "fraction",
    maps,
    offset: q(offset),
    length: q(length),
  };
}

/** The form of core's README ("Timestamps"), its granularity given by `pinIn`. */
const FORM: Omit<TimestampSpec, "granularity"> = {
  block: MIXED.A,
  line: {
    timeline: "form",
    name: "Form",
    unit: "quarters",
    numberType: "fraction",
    length: q(32),
    maps: [linear("form_ticks", "Ticks", 480, 0, "ticks")],
  },
  segments: [
    segment("A", 0, 8, [linear("A_tempo", "Tempo", [1, 2], 0, "seconds")]),
    segment("B", 8, 12, [
      linear("B_samples", "Samples", [55125, 2], 176400, "samples"),
      linear("B_tempo", "Tempo", [5, 8], 4, "seconds"),
      linear("B_ticks", "Ticks", 480, 0, "ticks"),
    ]),
    segment("C", 20, 12, [linear("C_bars", "Bars", [1, 4], 0, "whole_notes")]),
  ],
};

/** A line whose maps give no value, need the rows of a MeasureMap, or name their outputs. */
const OTHERS: Omit<TimestampSpec, "granularity"> = {
  block: MIXED.A,
  line: {
    timeline: "score",
    name: "Score",
    unit: "quarters",
    numberType: "fraction",
    length: q(16),
    maps: [
      {
        type: "PiecewiseMap",
        id: "pieces",
        name: "Tempo",
        source_unit: "quarters",
        target_unit: "seconds",
        breaks: [0, 4, 16],
        maps: [
          linear("first", null, [1, 2], 0, "seconds"),
          linear("second", null, [3, 5], [-2, 5], "seconds"),
        ],
      },
      {
        type: "MeasureNumberMap",
        id: "bars",
        name: null,
        source_unit: "quarters",
        target_unit: null,
        measure_map: "measures",
      },
      {
        type: "CombinationMap",
        id: "both",
        name: "Both",
        source_unit: "quarters",
        target_unit: null,
        maps: {
          seconds: linear("both_seconds", null, [1, 2], 0, "seconds"),
          ticks: linear("both_ticks", null, 480, 0, "ticks"),
        },
      },
    ],
  },
  segments: [],
};

/** The block of the fixture `timestamps` in `storeOf("timestamps")`. */
const T = "0000000000";

/** The line `clt_1` of the fixture `timestamps` as a pin reads it: its ID for its name, 8 quarters, no maps. */
const CLT: Omit<TimestampSpec, "granularity"> = {
  block: T,
  line: {
    timeline: "clt_1",
    name: "clt_1",
    unit: "quarters",
    numberType: "fraction",
    length: q(8),
    maps: [],
  },
  segments: [],
};

/** The pin of `spec` at `position`, read under the granularity of `store`'s view, without a server. */
function pinIn(
  store: Store,
  spec: Omit<TimestampSpec, "granularity">,
  position: Rational,
  named: string | null = null,
): Pin {
  const read: TimestampSpec = { ...spec, granularity: store.view.settings.granularity };
  return { spec: read, knots: "no_server", timestamp: timestampAt(read, position), named };
}

const at = (store: Store) => pinIn(store, FORM, q(27, 2));
const moved = (store: Store) => pinIn(store, FORM, q(8));
const others = (store: Store) => pinIn(store, OTHERS, q(16));
const clt = (store: Store) => pinIn(store, CLT, q(3, 2));

const DOWNBEAT: Address = { block: T, id: "timestamp_1" };
const CLIMAX: Address = { block: T, id: "timestamp_2" };

const HINT =
  "Turn on Show coordinates (C) and click a timeline to read a timestamp. With Show coordinates off, click a named timestamp to edit it.";
const LOCKED = "This conversion map cannot be solved for a position";

let app: ReturnType<typeof mount> | undefined;

function unmountAll(): void {
  if (app !== undefined) unmount(app);
  app = undefined;
  document.body.innerHTML = "";
}

afterEach(() => {
  unmountAll();
  vi.unstubAllGlobals();
});

interface Drawer {
  pinTimestamp(pin: Pin | null): void;
  clickedAt(target: EventTarget | null): void;
  setOpen(open: boolean): void;
  selected(addresses: readonly Address[]): void;
  shownPin(): Pin | null;
}

/**
 * The drawer over `store`, open when `open`, block `block` selected, with
 * the canvas's MeasureMaps `knotsOf` when given; each call flushes.
 */
function drawer(store: Store, open: boolean, block: string = MIXED.A, knotsOf?: KnotsOf): Drawer {
  const selection: Selection = selectionOf([{ block }]);
  const mounted = mount(InspectorDrawer, {
    target: document.body,
    props: {
      live: liveStore(store),
      selection,
      placement: null,
      storageKey: null,
      ...(knotsOf === undefined ? {} : { knotsOf }),
    },
  });
  app = mounted;
  const flushed =
    <T extends unknown[]>(run: (...args: T) => void) =>
    (...args: T) => {
      run(...args);
      flushSync();
    };
  const handle: Drawer = {
    pinTimestamp: flushed((pin: Pin | null) => mounted.pinTimestamp(pin)),
    clickedAt: flushed((target: EventTarget | null) => mounted.clickedAt(target)),
    setOpen: flushed((next: boolean) => mounted.setOpen(next)),
    selected: flushed((addresses: readonly Address[]) => mounted.selected(addresses)),
    shownPin: () => mounted.shownPin(),
  };
  flushSync();
  if (open) handle.setOpen(true);
  return handle;
}

function tabNamed(name: string): HTMLElement {
  const found = [...document.querySelectorAll<HTMLElement>('[role="tab"]')].find(
    (tab) => tab.textContent?.trim() === name,
  );
  if (found === undefined) throw new Error(`no tab ${name}`);
  return found;
}

function click(name: string): void {
  tabNamed(name).click();
  flushSync();
}

/** The text of the selected tab. */
function selected(): string | undefined {
  return document.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.trim();
}

/** The Timestamp tab's panel. */
function panel(): HTMLElement {
  const id = tabNamed("Timestamp").getAttribute("aria-controls");
  const found = id === null ? null : document.getElementById(id);
  if (found === null) throw new Error("no Timestamp panel");
  return found;
}

function hint(): string | null | undefined {
  return panel().querySelector('[data-testid="timestamp-hint"]')?.textContent;
}

function find<E extends Element>(selector: string): E {
  const found = panel().querySelector<E>(selector);
  if (found === null) throw new Error(`no ${selector}`);
  return found;
}

const nameField = () => find<HTMLInputElement>(".name input");
const lineBox = () => find<HTMLInputElement>(".line input");
/** The hint why the line box is disabled, which the box names as its description; `null` for none. */
function lineHint(): string | null {
  const id = lineBox().getAttribute("aria-describedby");
  return id === null ? null : (document.getElementById(id)?.textContent ?? null);
}

/** Hide what `select` selects in the block of the fixture `timestamps`. */
function hide(store: Store, select: object): void {
  const refused = store.dispatch({ type: "style", select, set: { display: "none" }, blocks: [T] });
  if (refused !== null) throw new Error(refused.message);
}
const deleteButton = () =>
  [...panel().querySelectorAll("button")].find((button) => button.textContent === "Delete");
/** The value field labelled `label`. */
const valueField = (label: string) => find<HTMLInputElement>(`input[aria-label="${label}"]`);

/** The header: [name, line checked, line disabled, Delete present, problem]. */
function header(): unknown[] {
  return [
    nameField().value,
    lineBox().checked,
    lineBox().disabled,
    deleteButton() !== undefined,
    find(`#${CSS.escape(nameField().getAttribute("aria-describedby") ?? "")}`).textContent?.trim(),
  ];
}

function type(input: HTMLInputElement, text: string): void {
  input.value = text;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  flushSync();
}

function press(input: HTMLInputElement, key: string): void {
  input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  flushSync();
}

/** Each section as [heading, [label, value, unit, disabled, the value cell's title]…]. */
function sections(): unknown[] {
  return [...panel().querySelectorAll("tbody")].map((body) => [
    body.querySelector('th[scope="colgroup"]')?.textContent,
    [...body.querySelectorAll("tr[data-row]")].map((row) => {
      const input = row.querySelector("input");
      return [
        row.querySelector('th[scope="row"]')?.textContent,
        input?.value ?? row.querySelector(".text")?.textContent,
        row.querySelector(".unit")?.textContent ?? null,
        input?.disabled ?? null,
        row.querySelector("td.value")?.getAttribute("title") ?? null,
      ];
    }),
  ]);
}

/** A number core expresses, as core shows it: [its text, its unit's symbol or null]. */
function shown(value: Expressed | null | undefined): [string, string | null] {
  if (value === null || value === undefined || typeof value !== "object") {
    throw new Error("not a number");
  }
  if (!("numberType" in value)) throw new Error("not a number");
  const text = displayValue(value.value, value.numberType, 3);
  return [text, value.unit === null ? null : unitSymbol(value.unit)];
}

/** The value of map `id` in the timestamp's part `part`. */
function mapValue(timestamp: Timestamp, part: number, id: string): Expressed | null {
  const map = timestamp.parts[part]?.maps.find((item) => item.id === id);
  if (map === undefined) throw new Error(`no map ${id}`);
  return map.value;
}

/** The row of map `id` of part `part`: [label, text, unit, enabled, no title]. */
function mapRow(timestamp: Timestamp, part: number, id: string, label: string): unknown[] {
  return [label, ...shown(mapValue(timestamp, part, id)), false, null];
}

/** `pin` held in the view of `store`. */
function pinning(store: Store, pin: Pin): UnnamedPinning {
  const found = pinningOf(store.view, pin);
  if (found === null) throw new Error("the timestamp's block is in the store");
  return found;
}

/** The command of the journal's last entry. */
function lastCommand(store: Store): unknown {
  const entry = store.journal.at(-1);
  return entry !== undefined && "command" in entry ? entry.command : undefined;
}

describe("pinning, as a rule", () => {
  it("selects Timestamp, keeps the tab shown before the first pin and returns to it", () => {
    const store = mixedStore();
    const first8 = pinning(store, at(store));
    const second8 = pinning(store, moved(store));
    const start: Shown = { picked: { tab: "journal", openings: 2 }, pin: null };
    const first = pinned(start, first8);
    const second = pinned(first, second8);
    const cleared = pinned(second, null);
    expect([first, second, cleared]).toEqual([
      { picked: { tab: "timestamp", openings: 2 }, pin: { ...first8, before: "journal" } },
      { picked: { tab: "timestamp", openings: 2 }, pin: { ...second8, before: "journal" } },
      { picked: { tab: "journal", openings: 2 }, pin: null },
    ]);
    expect(pinned(cleared, null)).toBe(cleared);
  });

  it("holds a pin with the view's manifest, and nothing for a block it does not hold", () => {
    const store = mixedStore();
    const pin = at(store);
    const held = pinning(store, pin);
    expect(held.manifest).toBe(store.view.blocks[MIXED.A]?.manifest);
    expect(held.pin).toBe(pin);
    expect(held.pin.spec.granularity).toBe(store.view.settings.granularity);
    const elsewhere = { ...pin, timestamp: { ...pin.timestamp, block: "zzzzzzzzzz" } };
    expect(pinningOf(store.view, elsewhere)).toBeNull();
  });

  it("is outlived by a change of its manifest, of the granularity or by its block's removal", () => {
    const after = (change: (store: Store) => unknown) => {
      const store = mixedStore();
      const held = pinning(store, at(store));
      change(store);
      return outlived(held, store.view);
    };
    expect([
      after(() => {}),
      after((store) =>
        store.dispatch({
          type: "set",
          changes: [{ target: { block: MIXED.B }, values: { x: 40 } }],
        }),
      ),
      after((store) =>
        store.dispatch({
          type: "set",
          changes: [{ target: { block: MIXED.A, id: "score" }, values: { name: "Changed" } }],
        }),
      ),
      after((store) => store.configure({ granularity: { denominator: 5 } })),
      after((store) => store.dispatch({ type: "remove", targets: [{ block: MIXED.A }] })),
    ]).toEqual([false, false, true, true, true]);
  });

  it("holds a named timestamp by its address, outlived only once the address names none", () => {
    const after = (change: (store: Store) => unknown) => {
      const store = storeOf("timestamps");
      const held: Pinning = { named: DOWNBEAT };
      expect(change(store)).toBeNull();
      return outlived(held, store.view);
    };
    expect([
      after(() => null),
      after((store) =>
        store.dispatch({ type: "set", changes: [{ target: DOWNBEAT, values: { name: "One" } }] }),
      ),
      after((store) => store.dispatch({ type: "remove", targets: [DOWNBEAT] })),
    ]).toEqual([false, false, true]);
  });

  it("clears the pin when another tab is chosen, keeps it when Timestamp is", () => {
    const store = mixedStore();
    const state: Shown = {
      picked: { tab: "timestamp", openings: 2 },
      pin: { ...pinning(store, at(store)), before: "journal" },
    };
    expect([chosen(state, "manifest", 3), chosen(state, "timestamp", 3)]).toEqual([
      { picked: { tab: "manifest", openings: 3 }, pin: null },
      { picked: { tab: "timestamp", openings: 3 }, pin: state.pin },
    ]);
  });
});

describe("pinning, in the drawer", () => {
  it("selects Timestamp, keeps the pin on a click in the panel and clears it elsewhere", () => {
    const store = mixedStore();
    const inspector = drawer(store, true);
    click("Journal");
    const first = at(store);
    inspector.pinTimestamp(first);
    expect([selected(), hint(), sections().length, inspector.shownPin()]).toEqual([
      "Timestamp",
      undefined,
      2,
      first,
    ]);
    inspector.pinTimestamp(moved(store));
    inspector.clickedAt(panel().querySelector("th"));
    expect([selected(), sections().length]).toEqual(["Timestamp", 2]);
    inspector.clickedAt(document.body);
    expect([selected(), inspector.shownPin()]).toEqual(["Journal", null]);
    click("Timestamp");
    expect([hint(), sections(), panel().querySelector(".header")]).toEqual([HINT, [], null]);
  });

  it("opens a closed drawer on Timestamp, and choosing another tab clears the pin", () => {
    const store = mixedStore();
    const inspector = drawer(store, false);
    expect(document.querySelector('[data-testid="inspector"]')?.hasAttribute("hidden")).toBe(true);
    inspector.pinTimestamp(at(store));
    expect([
      document.querySelector('[data-testid="inspector"]')?.hasAttribute("hidden"),
      selected(),
      sections().length,
    ]).toEqual([false, "Timestamp", 2]);
    click("Manifest");
    click("Timestamp");
    expect(hint()).toBe(HINT);
  });

  it.each([
    [
      "its manifest changes",
      (store: Store) =>
        store.dispatch({
          type: "set",
          changes: [{ target: { block: MIXED.A, id: "score" }, values: { name: "Changed" } }],
        }),
    ],
    [
      "the granularity changes",
      (store: Store) => store.configure({ granularity: { denominator: 5 } }),
    ],
    [
      "its block is deleted",
      (store: Store) => store.dispatch({ type: "remove", targets: [{ block: MIXED.A }] }),
    ],
  ])("drops the pin, keeping Timestamp, when %s", (_, change) => {
    const store = mixedStore();
    const inspector = drawer(store, true);
    click("Journal");
    inspector.pinTimestamp(at(store));
    store.dispatch({ type: "set", changes: [{ target: { block: MIXED.B }, values: { x: 40 } }] });
    flushSync();
    expect([selected(), sections().length]).toEqual(["Timestamp", 2]);
    expect(change(store)).toBeNull();
    flushSync();
    expect([selected(), hint(), sections(), inspector.shownPin()]).toEqual([
      "Timestamp",
      HINT,
      [],
      null,
    ]);
  });
});

describe("pane states and the header", () => {
  it("shows the hint alone without a pin, and an unnamed pin with an empty name and a fixed line", () => {
    const store = storeOf("timestamps");
    const inspector = drawer(store, true, T);
    click("Timestamp");
    expect([hint(), panel().querySelector(".header"), panel().querySelector("table")]).toEqual([
      HINT,
      null,
      null,
    ]);
    inspector.pinTimestamp(clt(store));
    expect([hint(), header()]).toEqual([undefined, ["", true, true, false, ""]]);
  });

  it("shows a selected named timestamp, opening the drawer, and drops it for another selection", () => {
    const store = storeOf("timestamps");
    const inspector = drawer(store, false, T);
    inspector.selected([DOWNBEAT]);
    expect([
      document.querySelector('[data-testid="inspector"]')?.hasAttribute("hidden"),
      selected(),
      header(),
      inspector.shownPin(),
    ]).toEqual([
      false,
      "Timestamp",
      ["Downbeat", true, false, true, ""],
      pinIn(store, CLT, q(3, 2), "timestamp_1"),
    ]);
    inspector.selected([CLIMAX]);
    expect(header()).toEqual(["Climax", false, false, true, ""]);
    inspector.selected([{ block: T }]);
    expect([selected(), inspector.shownPin()]).toEqual(["Properties", null]);
    inspector.selected([DOWNBEAT, CLIMAX]);
    expect([selected(), inspector.shownPin()]).toEqual(["Properties", null]);
  });
});

describe("naming", () => {
  it("adds an unnamed timestamp under the typed name, then shows the named one", () => {
    const store = storeOf("timestamps");
    const inspector = drawer(store, true, T);
    inspector.pinTimestamp(clt(store));
    type(nameField(), "Upbeat");
    press(nameField(), "Enter");
    expect(lastCommand(store)).toEqual({
      type: "add",
      into: { block: T, id: "clt_1" },
      timestamp: { name: "Upbeat", coordinate: [3, 2] },
    });
    expect([header(), inspector.shownPin()?.named]).toEqual([
      ["Upbeat", true, false, true, ""],
      "timestamp_4",
    ]);
  });

  it("renames a named timestamp, keeps a name and journals nothing for an unchanged one", () => {
    const store = storeOf("timestamps");
    const inspector = drawer(store, true, T);
    inspector.selected([DOWNBEAT]);
    const length = store.journal.length;
    type(nameField(), "Downbeat");
    press(nameField(), "Enter");
    expect(store.journal.length).toBe(length);
    type(nameField(), "");
    press(nameField(), "Enter");
    expect([store.journal.length, header()]).toEqual([
      length,
      ["Downbeat", true, false, true, "A named timestamp keeps a name; Delete removes it."],
    ]);
    type(nameField(), "Strong");
    press(nameField(), "Enter");
    expect([lastCommand(store), header()]).toEqual([
      { type: "set", changes: [{ target: DOWNBEAT, values: { name: "Strong" } }] },
      ["Strong", true, false, true, ""],
    ]);
  });

  it("deletes a named timestamp", () => {
    const store = storeOf("timestamps");
    const inspector = drawer(store, true, T);
    inspector.selected([DOWNBEAT]);
    deleteButton()?.click();
    flushSync();
    expect([lastCommand(store), hint(), inspector.shownPin()]).toEqual([
      { type: "remove", targets: [DOWNBEAT] },
      HINT,
      null,
    ]);
  });
});

describe("the line toggle", () => {
  it("hides and shows a named timestamp's cross-section line through style", () => {
    const store = storeOf("timestamps");
    const inspector = drawer(store, true, T);
    inspector.selected([DOWNBEAT]);
    const style = (display: "none" | null) => ({
      type: "style",
      select: { addresses: [{ id: "timestamp_1", part: ["line"] }] },
      set: { display },
      blocks: [T],
    });
    lineBox().click();
    flushSync();
    expect([lastCommand(store), lineBox().checked]).toEqual([style("none"), false]);
    lineBox().click();
    flushSync();
    expect([lastCommand(store), lineBox().checked]).toEqual([style(null), true]);
  });

  it("shows a line hidden by its own statement unchecked, and checking it unsets display", () => {
    const store = storeOf("timestamps");
    const inspector = drawer(store, true, T);
    inspector.selected([CLIMAX]);
    expect([lineBox().checked, lineBox().disabled, lineHint()]).toEqual([false, false, null]);
    lineBox().click();
    flushSync();
    expect([lastCommand(store), lineBox().checked, lineBox().disabled]).toEqual([
      {
        type: "style",
        select: { addresses: [{ id: "timestamp_2", part: ["line"] }] },
        set: { display: null },
        blocks: [T],
      },
      true,
      false,
    ]);
  });

  it("reads the line's own display, never the markers band", () => {
    const store = storeOf("timestamps");
    hide(store, { addresses: [{ id: "clt_1", facet: "markers" }] });
    const inspector = drawer(store, true, T);
    inspector.selected([DOWNBEAT]);
    expect([lineBox().checked, lineBox().disabled, lineHint()]).toEqual([true, false, null]);
  });

  it("is disabled, naming why, while the line of its timeline is hidden", () => {
    const store = storeOf("timestamps");
    hide(store, { addresses: [{ id: "clt_1" }] });
    const length = store.journal.length;
    const inspector = drawer(store, true, T);
    const hint = "Timeline clt_1 is hidden, and the line with it.";
    inspector.selected([DOWNBEAT]);
    expect([lineBox().checked, lineBox().disabled, lineHint()]).toEqual([true, true, hint]);
    lineBox().click();
    flushSync();
    expect(store.journal.length).toBe(length);
    inspector.selected([CLIMAX]);
    expect([lineBox().checked, lineBox().disabled, lineHint()]).toEqual([false, true, hint]);
  });

  it("is disabled, naming why, while a statement selecting more than the line hides it", () => {
    const store = storeOf("timestamps");
    hide(store, { element: "cross_section" });
    const inspector = drawer(store, true, T);
    inspector.selected([DOWNBEAT]);
    expect([lineBox().checked, lineBox().disabled, lineHint()]).toEqual([
      false,
      true,
      "A style statement selecting more than this line hides it; change it in the Manifest tab.",
    ]);
  });
});

describe("a named timestamp's MeasureMaps", () => {
  /** A 4/4 measure named `name` starting at `qstamp` quarters. */
  const measure = (name: string, qstamp: number): MeasureKnot => ({
    ID: name,
    name,
    count: Number(name),
    number: Number(name),
    qstamp: [qstamp, 1],
    nominal_length: [4, 1],
    actual_length: [4, 1],
    offset_within_measure: [0, 1],
  });
  const ROWS: readonly MeasureKnots[] = [
    {
      id: "measuremap_1",
      rows: [measure("1", 0), measure("2", 4), measure("3", 8), measure("4", 12)],
    },
  ];
  const BAR_TWO: Address = { block: T, id: "timestamp_1" };

  /** `group_measure_map` with the named timestamp "Bar two" at 6 on `score`. */
  function measureStore(): Store {
    const store = storeOf("groups/group_measure_map");
    const added = store.dispatch({
      type: "add",
      into: { block: T, id: "score" },
      timestamp: { name: "Bar two", coordinate: [6, 1] },
    });
    if (added !== null) throw new Error(added.message);
    return store;
  }

  /** The text of the row `cmap_1`. */
  const measureRow = () =>
    panel().querySelector('tr[data-row="line/cmap_1"] .text')?.textContent ?? null;

  it("are the canvas's, read again when they arrive, as an unnamed pin there reads them", () => {
    const store = measureStore();
    const known = new SvelteMap<Manifest, readonly MeasureKnots[]>();
    const knotsOf: KnotsOf = (manifest) => known.get(manifest) ?? "pending";
    const inspector = drawer(store, true, T, knotsOf);
    inspector.selected([BAR_TWO]);
    expect(measureRow()).toBe("waiting for the server");
    const manifest = store.view.blocks[T]?.manifest;
    if (manifest === undefined) throw new Error("the block is in the store");
    known.set(manifest, ROWS);
    flushSync();
    expect(measureRow()).toBe("2");
    const named = inspector.shownPin();
    if (named === null) throw new Error("the named timestamp is shown");
    const unnamed: Pin = {
      spec: named.spec,
      knots: ROWS,
      timestamp: timestampAt(named.spec, q(6), ROWS),
      named: null,
    };
    expect(named).toEqual({ ...unnamed, named: "timestamp_1" });
    const shownNamed = sections();
    inspector.pinTimestamp(unnamed);
    expect([sections(), measureRow()]).toEqual([shownNamed, "2"]);
  });

  it("need a server without the canvas's", () => {
    const store = measureStore();
    const inspector = drawer(store, true, T);
    inspector.selected([BAR_TWO]);
    expect(measureRow()).toBe("needs a server to expand its measure map");
  });
});

describe("the rows", () => {
  it("show each part's coordinate, then its maps in the order given, in core's texts", () => {
    const store = mixedStore();
    const inspector = drawer(store, true);
    const AT = at(store).timestamp;
    inspector.pinTimestamp(at(store));
    expect(sections()).toEqual([
      [
        "Form",
        [
          ["coordinate", displayValue(q(27, 2), "fraction", 3), "♩", false, null],
          mapRow(AT, 0, "form_ticks", "Ticks"),
        ],
      ],
      [
        "B · segment",
        [
          ["coordinate", displayValue(q(11, 2), "fraction", 3), "♩", false, null],
          mapRow(AT, 1, "B_samples", "Samples"),
          mapRow(AT, 1, "B_tempo", "Tempo"),
          mapRow(AT, 1, "B_ticks", "Ticks"),
        ],
      ],
    ]);
    expect(panel().querySelector('[data-testid="timestamp-where"]')?.textContent?.trim()).toBe(
      "Form at 13 1/2 ♩",
    );
    expect(shown(mapValue(AT, 1, "B_tempo"))).toEqual(["7.438", "s"]);
  });

  it("say why a map has no value, give one row per named output, and lock what no map solves", () => {
    const store = mixedStore();
    const inspector = drawer(store, true);
    inspector.pinTimestamp(others(store));
    const outputs = mapValue(others(store).timestamp, 0, "both");
    if (outputs === null || typeof outputs !== "object" || !("outputs" in outputs)) {
      throw new Error("the CombinationMap names its outputs");
    }
    const locked = (label: string, value: Expressed | undefined) => [
      label,
      ...shown(value),
      true,
      LOCKED,
    ];
    expect(sections()).toEqual([
      [
        "Score",
        [
          ["coordinate", displayValue(q(16), "fraction", 3), "♩", false, null],
          ["Tempo", "no value here", null, null, null],
          ["bars", "needs a server to expand its measure map", null, null, null],
          locked("Both · seconds", outputs.outputs.seconds),
          locked("Both · ticks", outputs.outputs.ticks),
        ],
      ],
    ]);
    expect(shown(outputs.outputs.seconds)).toEqual([displayValue(q(8), "fraction", 3), null]);
    const described = valueField("Both · seconds of Score").getAttribute("aria-describedby");
    expect(described?.split(" ").map((id) => document.getElementById(id)?.textContent)).toEqual([
      "",
      LOCKED,
    ]);
  });
});

describe("editing values", () => {
  it("moves an unnamed pin to the typed coordinate, journalling nothing", () => {
    const store = storeOf("timestamps");
    const inspector = drawer(store, true, T);
    const pin = clt(store);
    inspector.pinTimestamp(pin);
    const length = store.journal.length;
    type(valueField("coordinate of clt_1"), "7/4");
    press(valueField("coordinate of clt_1"), "Enter");
    expect([inspector.shownPin(), valueField("coordinate of clt_1").value]).toEqual([
      { ...pin, timestamp: timestampAt(pin.spec, q(7, 4)) },
      "1 3/4",
    ]);
    expect(store.journal.length).toBe(length);
  });

  it("moves a named timestamp by one set of its coordinate, its pin read anew", () => {
    const store = storeOf("timestamps");
    const inspector = drawer(store, true, T);
    inspector.selected([DOWNBEAT]);
    type(valueField("coordinate of clt_1"), "7/4");
    valueField("coordinate of clt_1").dispatchEvent(new FocusEvent("blur"));
    flushSync();
    expect([lastCommand(store), inspector.shownPin()]).toEqual([
      { type: "set", changes: [{ target: DOWNBEAT, values: { coordinate: [7, 4] } }] },
      pinIn(store, CLT, q(7, 4), "timestamp_1"),
    ]);
  });

  it("moves to the position a map's inverse gives", () => {
    const store = mixedStore();
    const inspector = drawer(store, true);
    const pin = at(store);
    inspector.pinTimestamp(pin);
    type(valueField("Ticks of Form"), "7200");
    press(valueField("Ticks of Form"), "Enter");
    expect(inspector.shownPin()).toEqual(pinAt(pin, q(15)));
  });

  it.each([
    ["abc", (_pin: Pin) => parseAxisValue("abc", "fraction")],
    ["9", (pin: Pin) => positionFor(pin, { part: "line", map: null }, q(9))],
  ])(
    "keeps the refused draft %s with core's message, and Escape shows the stored value",
    (text, refusal) => {
      const store = storeOf("timestamps");
      const inspector = drawer(store, true, T);
      const pin = clt(store);
      inspector.pinTimestamp(pin);
      const field = valueField("coordinate of clt_1");
      type(field, text);
      press(field, "Enter");
      const problem = refusal(pin);
      if (problem instanceof Rational) throw new Error("core refuses the text");
      const message = () =>
        find(
          "#" +
            CSS.escape(valueField("coordinate of clt_1").getAttribute("aria-describedby") ?? ""),
        ).textContent;
      expect([
        valueField("coordinate of clt_1").value,
        valueField("coordinate of clt_1").getAttribute("aria-invalid"),
        message(),
        inspector.shownPin(),
      ]).toEqual([text, "true", problem.message, pin]);
      press(valueField("coordinate of clt_1"), "Escape");
      expect([
        valueField("coordinate of clt_1").value,
        valueField("coordinate of clt_1").getAttribute("aria-invalid"),
        message(),
      ]).toEqual(["1 1/2", "false", ""]);
    },
  );
});

describe("copying", () => {
  function clipboard(): string[] {
    const written: string[] = [];
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: async (text: string) => {
          written.push(text);
        },
      },
    });
    return written;
  }

  /** The two Copy buttons of the row `key`: [value, value + unit], each [aria-label, title] or null. */
  function copies(key: string): HTMLButtonElement[] {
    return [...panel().querySelectorAll<HTMLButtonElement>(`tr[data-row="${key}"] button`)];
  }

  it("writes core's copy texts, with and without the unit", async () => {
    const written = clipboard();
    const store = mixedStore();
    const inspector = drawer(store, true);
    inspector.pinTimestamp(at(store));
    expect([...panel().querySelectorAll("thead th.copy")].map((cell) => cell.textContent)).toEqual([
      "value",
      "value + unit",
    ]);
    expect(
      ["line", "segment/B_tempo"].map((key) =>
        copies(key).map((button) => [button.getAttribute("aria-label"), button.title]),
      ),
    ).toEqual([
      [
        ["Copy the value", "Copy the value"],
        ["Copy the value with its unit", "Copy the value with its unit"],
      ],
      [
        ["Copy the value", "Copy the value"],
        ["Copy the value with its unit", "Copy the value with its unit"],
      ],
    ]);
    for (const key of ["line", "segment/B_tempo"]) {
      for (const button of copies(key)) button.click();
    }
    await vi.waitFor(() => expect(written).toHaveLength(4));
    expect(written).toEqual([
      copyValue(q(27, 2), "fraction"),
      copyValueWithUnit(q(27, 2), "fraction", "quarters"),
      copyValue(7.4375, "float"),
      copyValueWithUnit(7.4375, "float", "seconds"),
    ]);
    expect(written).toEqual(["27/2", "27/2 ♩", "7.4375", "7.4375 s"]);
  });

  it("has no Copy with the unit for a number without one, and none for a missing value", () => {
    const store = mixedStore();
    const inspector = drawer(store, true);
    inspector.pinTimestamp(others(store));
    expect(
      ["line/pieces", "line/both/seconds"].map((key) =>
        copies(key).map((button) => button.getAttribute("aria-label")),
      ),
    ).toEqual([[], ["Copy the value"]]);
  });
});

describe("the format switch", () => {
  /** The radio group `label`: the words of its segments and the one checked. */
  function group(label: string): unknown[] {
    const found = document.querySelector(`[role="radiogroup"][aria-label="${label}"]`);
    if (found === null) throw new Error(`no ${label}`);
    const segments = [...found.querySelectorAll("label.segment")];
    return [
      segments.map((segment) => segment.textContent?.trim()),
      segments.find((segment) => segment.querySelector("input")?.checked)?.textContent?.trim(),
    ];
  }

  function choose(value: string): void {
    find<HTMLInputElement>(`[aria-label="Timestamp format"] input[value="${value}"]`).click();
    flushSync();
  }

  const text = () => panel().querySelector("pre")?.textContent;

  it("is one control in the Manifest and the Timestamp tabs", () => {
    const store = storeOf("timestamps");
    const inspector = drawer(store, true, T);
    click("Manifest");
    expect(group("Manifest format")).toEqual([["JSON", "YAML", "TOML"], "JSON"]);
    inspector.selected([DOWNBEAT]);
    expect(group("Timestamp format")).toEqual([["Pretty", "JSON", "YAML", "TOML"], "Pretty"]);
  });

  it("shows a named timestamp as JSON, then YAML once its codec is loaded, with one Copy", async () => {
    const written: string[] = [];
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: async (copied: string) => {
          written.push(copied);
        },
      },
    });
    const store = storeOf("timestamps");
    const inspector = drawer(store, true, T);
    inspector.selected([DOWNBEAT]);
    const pin = inspector.shownPin();
    if (pin === null) throw new Error("Downbeat is shown");
    const value = {
      id: "timestamp_1",
      name: "Downbeat",
      parts: [
        {
          timeline: "clt_1",
          segment: false,
          coordinate: { ...coordinateDict(q(3, 2), "quarters", "fraction") },
          maps: {},
        },
      ],
    };
    choose("json");
    expect(text()).toBe(dumps(value));
    expect(isLoaded("yaml")).toBe(false);
    choose("yaml");
    expect([panel().querySelector('p.hint[role="status"]')?.textContent, text()]).toEqual([
      "Loading YAML…",
      undefined,
    ]);
    await vi.waitFor(() => expect(text()).not.toBeUndefined());
    const expected = writeText("yaml", value);
    if (!expected.ok) throw new Error("YAML writes the timestamp");
    expect(text()).toBe(expected.value.text);
    [...panel().querySelectorAll("button")]
      .find((button) => button.textContent === "Copy")
      ?.click();
    await vi.waitFor(() => expect(written).toEqual([expected.value.text]));
  });

  it("refuses a null in TOML as the Manifest tab does", async () => {
    const store = mixedStore();
    const inspector = drawer(store, true);
    inspector.pinTimestamp(others(store));
    await loadCodec("toml");
    choose("toml");
    const refused = writeText("toml", timestampValue(others(store), null));
    if (refused.ok) throw new Error("TOML holds no null");
    expect([refused.problems[0]?.code, find(".text-problem").textContent]).toEqual([
      InspectorCode.notRepresentable,
      refused.problems.map((item) => item.message).join(" "),
    ]);
  });
});

describe("the settings line", () => {
  /** Each setting as [label, text, title, invalid, problem]. */
  function settings(): unknown[] {
    return [...panel().querySelectorAll(".settings label")].map((label) => {
      const input = label.querySelector("input");
      const problem = document.getElementById(input?.getAttribute("aria-describedby") ?? "");
      return [
        label.firstChild?.textContent?.trim(),
        input?.value,
        label.getAttribute("title"),
        input?.getAttribute("aria-invalid"),
        problem?.textContent,
      ];
    });
  }

  function field(label: string): HTMLInputElement {
    const found = [...panel().querySelectorAll(".settings label")].find(
      (item) => item.firstChild?.textContent?.trim() === label,
    );
    const input = found?.querySelector<HTMLInputElement>("input");
    if (input === null || input === undefined) throw new Error(`no field ${label}`);
    return input;
  }

  const DENOMINATOR = "A fraction position is never finer than 1 / denominator.";
  const DECIMALS =
    "A float position has at most this many decimal places, and floats are shown with them.";

  it("shows and sets the two settings without a journal entry or an undo step", () => {
    const store = mixedStore();
    const listed = store.listed.length;
    const inspector = drawer(store, true);
    click("Timestamp");
    expect([hint(), settings()]).toEqual([
      HINT,
      [
        ["Denominator", "2520", DENOMINATOR, "false", ""],
        ["Decimals", "3", DECIMALS, "false", ""],
      ],
    ]);
    type(field("Denominator"), "5");
    type(field("Decimals"), "6");
    expect([store.view.settings.granularity, store.journal.length, store.listed.length]).toEqual([
      { denominator: 5, decimals: 6 },
      3,
      listed,
    ]);
    inspector.pinTimestamp(at(store));
    expect(settings()).toEqual([
      ["Denominator", "5", DENOMINATOR, "false", ""],
      ["Decimals", "6", DECIMALS, "false", ""],
    ]);
    expect(valueField("Tempo of B").value).toBe("7.4375");
  });

  it.each([
    ["Denominator", "0", { denominator: 0 }],
    ["Decimals", "16", { decimals: 16 }],
  ] as const)(
    "marks a refused %s %s with core's problem and shows the stated value on leaving",
    (label, text, change) => {
      const store = mixedStore();
      drawer(store, true);
      click("Timestamp");
      const before = store.view.settings.granularity;
      type(field(label), text);
      const problem = store.configure({ granularity: change });
      const row = () => settings().find((item) => (item as string[])[0] === label) as unknown[];
      expect(store.view.settings.granularity).toBe(before);
      expect([row()[1], row()[3], row()[4]]).toEqual([text, "true", problem?.message]);
      field(label).dispatchEvent(new Event("change", { bubbles: true }));
      flushSync();
      expect([row()[1], row()[3], row()[4]]).toEqual([
        String(before[label === "Denominator" ? "denominator" : "decimals"]),
        "false",
        "",
      ]);
    },
  );
});

describe("the server's MeasureMaps", () => {
  const rows = [{ id: "bars", rows: [] }] as const;

  it("passes the rows on, tells a server that cannot expand them, and keeps every other failure", async () => {
    const answer = (result: () => Promise<typeof rows>) =>
      measureMapsOf({ measureMaps: () => result() })("{}");
    expect(await answer(() => Promise.resolve(rows))).toBe(rows);
    expect(
      await answer(() => Promise.reject(new ServerError("status", 501, "501 Not Implemented"))),
    ).toBe("unsupported");
    const failed = new ServerError("status", 500, "500 Internal Server Error");
    await expect(answer(() => Promise.reject(failed))).rejects.toBe(failed);
    const unreachable = new ServerError("unreachable", null, "connection refused");
    await expect(answer(() => Promise.reject(unreachable))).rejects.toBe(unreachable);
  });
});
