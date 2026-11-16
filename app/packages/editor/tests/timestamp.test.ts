/** The Timestamp tab; the expected values are derived in `README.md` ("The Timestamp tab"). */

/// <reference types="node" />
import { readFileSync } from "node:fs";
import path from "node:path";
import type { KnotsOf } from "@timetoalign/tilie-arranger";
import { drawingOf, liveStore, namedPin, selectionOf } from "@timetoalign/tilie-arranger";
import { ServerError } from "@timetoalign/tilie-client";
import type {
  Address,
  ConversionMap,
  CrossSectionSpec,
  Manifest,
  MeasureKnot,
  MeasureKnots,
  Pin,
  Store,
} from "@timetoalign/tilie-core";
import {
  copyValue,
  copyValueWithUnit,
  createStore,
  isLoadError,
  parseAxisValue,
  pinAt,
  positionFor,
  readWorkspace,
  timestampAt,
  timestampJson,
  unitSymbol,
} from "@timetoalign/tilie-core";
import { Rational } from "@timetoalign/tilie-core/numbers";
import type { TimeUnit } from "@timetoalign/timetoshare";
import { dumps, fontMetrics } from "@timetoalign/timetoshare";
import { flushSync, mount, unmount } from "svelte";
import { SvelteMap } from "svelte/reactivity";
import { afterEach, describe, expect, it, vi } from "vitest";
import InspectorDrawer from "../src/InspectorDrawer.svelte";
import { isLoaded, loadCodec, writeText } from "../src/inspector/formats.svelte.ts";
import { InspectorCode } from "../src/inspector/problems.ts";
import type { Held, Shown } from "../src/inspector/tabs.ts";
import { chosen, heldOf, outlived, pinned } from "../src/inspector/tabs.ts";
import { measureMapsOf } from "../src/measureMaps.ts";
import { informing, storeOf } from "./support.ts";

const q = (n: number, d = 1) => Rational.fromParts(BigInt(n), BigInt(d));

/** The block of `bundle_mixed` in `storeOf`, and of a second fixture beside it. */
const A = "0000000000";
const B = "0000000001";
/** The block of the example "Timestamps". */
const T = "timestamps";

const ORIGIN: Address = { block: A, id: "timestamp_9" };
const THEME: Address = { block: T, id: "timestamp_5" };
const CLIMAX: Address = { block: T, id: "timestamp_6" };
const SILENT: Address = { block: T, id: "timestamp_7" };

const HINT =
  "Turn on Show coordinates (C) and click a timeline to pin a timestamp. With Show coordinates off, click a timestamp to edit it.";
const READ_ONLY = "This value cannot be solved for a position, so it cannot be edited.";
const UNNAMED =
  "Naming the timestamp stores it; then its display can be set and it can be deleted.";

/** `bundle_mixed` in block A, and `bare` in block B when `second`. */
function mixed(second = false): Store {
  return second ? storeOf("bundles/bundle_mixed", "bare") : storeOf("bundles/bundle_mixed");
}

/** The example workspace "Timestamps", as the Examples menu opens it. */
function example(): Store {
  const text = readFileSync(
    path.join(import.meta.dirname, "../examples/timestamps.tle.json"),
    "utf8",
  );
  const workspace = readWorkspace(text);
  if (isLoadError(workspace)) throw new Error(JSON.stringify(workspace.problems));
  return createStore(workspace);
}

/** The arranger's pin of the named timestamp at `address` in `store`, read without a server. */
function named(store: Store, address: Address, knots: MeasureKnots[] | "no_server" = "no_server") {
  const block = address.block === undefined ? undefined : store.view.blocks[address.block];
  if (block === undefined || address.id === undefined) throw new Error("no such block");
  const drawing = drawingOf(block, store.view.graphical, fontMetrics);
  const pin = namedPin(
    block.manifest,
    block.id,
    drawing,
    address.id,
    store.view.settings.granularity,
    knots,
  );
  if (pin === null) throw new Error(`no timestamp ${address.id}`);
  return pin;
}

/** An unnamed pin on `score` of `bundle_mixed` at `position`: `origin`'s pin moved, without its entry. */
function unnamed(store: Store, position: Rational = q(16, 5)): Pin {
  return { ...pinAt(named(store, ORIGIN), position), named: null };
}

function linear(id: string, name: string | null, scalar: number, target: TimeUnit) {
  return {
    type: "LinearMap" as const,
    id,
    name,
    source_unit: "quarters" as const,
    target_unit: target,
    scalar,
    offset: 0,
  };
}

/** A line `score` (16 quarters) whose maps give no value, need a MeasureMap's rows or name their outputs. */
function others(store: Store): Pin {
  const maps: ConversionMap[] = [
    {
      type: "PiecewiseMap",
      id: "pieces",
      name: "Tempo",
      source_unit: "quarters",
      target_unit: "seconds",
      breaks: [0, 4, 16],
      maps: [linear("first", null, 0.5, "seconds"), linear("second", null, 0.6, "seconds")],
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
        seconds: linear("both_seconds", null, 0.5, "seconds"),
        ticks: linear("both_ticks", null, 480, "ticks"),
      },
    },
  ];
  const spec: CrossSectionSpec = {
    block: A,
    granularity: store.view.settings.granularity,
    anchor: {
      timeline: "score",
      name: "Score",
      unit: "quarters",
      numberType: "fraction",
      length: q(16),
      maps,
    },
    members: [],
  };
  return { spec, knots: "no_server", timestamp: timestampAt(spec, q(16)), named: null };
}

let app: ReturnType<typeof mount> | undefined;
/** The information the drawer posted to the message bar since it was mounted. */
let informed: string[] = [];

afterEach(() => {
  if (app !== undefined) unmount(app);
  app = undefined;
  document.body.innerHTML = "";
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
function drawer(store: Store, open: boolean, block: string = A, knotsOf?: KnotsOf): Drawer {
  informed = [];
  const mounted = mount(InspectorDrawer, {
    target: document.body,
    context: informing(informed),
    props: {
      live: liveStore(store),
      selection: selectionOf([{ block }]),
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

function find<E extends Element>(selector: string, within: ParentNode = panel()): E {
  const found = within.querySelector<E>(selector);
  if (found === null) throw new Error(`no ${selector}`);
  return found;
}

/** The headings of the pane's areas, in order. */
function areas(): (string | null)[] {
  return [...panel().querySelectorAll("section > h3")].map((heading) => heading.textContent);
}

/** The area headed `heading`, named by it. */
function area(heading: string): HTMLElement {
  const found = [...panel().querySelectorAll<HTMLElement>("section")].find(
    (section) => section.querySelector("h3")?.textContent === heading,
  );
  if (found === undefined) throw new Error(`no area ${heading}`);
  return found;
}

function hint(): string | null | undefined {
  return area("Coordinates").querySelector('[data-testid="timestamp-hint"]')?.textContent;
}

/** The Properties area, or `null` without one. */
const properties = () => panel().querySelector<HTMLElement>('[data-testid="timestamp-properties"]');

const nameField = () => find<HTMLInputElement>('input[type="text"]', area("Properties"));

/** The display toggles as [label, pressed, disabled]. */
function toggles(): unknown[] {
  return [...area("Properties").querySelectorAll<HTMLButtonElement>('[role="group"] button')].map(
    (button) => [button.textContent, button.getAttribute("aria-pressed"), button.disabled],
  );
}

function toggle(label: string): void {
  const button = [
    ...area("Properties").querySelectorAll<HTMLButtonElement>('[role="group"] button'),
  ].find((item) => item.textContent === label);
  if (button === undefined) throw new Error(`no toggle ${label}`);
  button.click();
  flushSync();
}

const deleteButton = () =>
  [...area("Properties").querySelectorAll("button")].find(
    (button) => button.textContent === "Delete",
  );

/** The value field labelled `label`. */
const valueField = (label: string) => find<HTMLInputElement>(`input[aria-label="${label}"]`);

/** The text of what describes `element` (its `aria-describedby` ids), joined by spaces. */
function described(element: Element): string {
  return (element.getAttribute("aria-describedby") ?? "")
    .split(" ")
    .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
    .filter((text) => text !== "")
    .join(" ");
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

/** Each timeline's rows as [heading, [label, value, unit, read-only, the field's title]…]. */
function groups(): unknown[] {
  return [...area("Coordinates").querySelectorAll("tbody")].map((body) => [
    body.querySelector('th[scope="colgroup"]')?.textContent,
    [...body.querySelectorAll("tr[data-row]")].map((row) => {
      const input = row.querySelector("input");
      return [
        row.querySelector('th[scope="row"]')?.textContent,
        input?.value ?? row.querySelector(".text")?.textContent,
        row.querySelector(".unit")?.textContent ?? null,
        input?.readOnly ?? null,
        input?.getAttribute("title") ?? null,
      ];
    }),
  ]);
}

/** A number's row as `groups` lists it, editable. */
const row = (label: string, value: string, unit: string) => [label, value, unit, false, null];

/** The command of the journal's last entry. */
function lastCommand(store: Store): unknown {
  const entry = store.journal.at(-1);
  return entry !== undefined && "command" in entry ? entry.command : undefined;
}

/** `pin` held in the view of `store`. */
function held(store: Store, pin: Pin): Held {
  const found = heldOf(store.view, pin);
  if (found === null) throw new Error("the timestamp's block is in the store");
  return found;
}

describe("pinning, as a rule", () => {
  it("selects Timestamp, keeps the tab shown before the first pin and returns to it", () => {
    const store = mixed();
    const first = held(store, unnamed(store));
    const second = held(store, unnamed(store, q(8)));
    const start: Shown = { picked: { tab: "journal", openings: 2 }, pin: null };
    const once = pinned(start, first);
    const twice = pinned(once, second);
    const cleared = pinned(twice, null);
    expect([once, twice, cleared]).toEqual([
      { picked: { tab: "timestamp", openings: 2 }, pin: { ...first, before: "journal" } },
      { picked: { tab: "timestamp", openings: 2 }, pin: { ...second, before: "journal" } },
      { picked: { tab: "journal", openings: 2 }, pin: null },
    ]);
    expect(pinned(cleared, null)).toBe(cleared);
  });

  it("holds a pin with the view's manifest, and nothing for a block it does not hold", () => {
    const store = mixed();
    const pin = unnamed(store);
    const holding = held(store, pin);
    expect([holding.manifest, holding.pin, holding.pin.spec.granularity]).toEqual([
      store.view.blocks[A]?.manifest,
      pin,
      store.view.settings.granularity,
    ]);
    expect(holding.manifest).toBe(store.view.blocks[A]?.manifest);
    const elsewhere = { ...pin, timestamp: { ...pin.timestamp, block: "zzzzzzzzzz" } };
    expect(heldOf(store.view, elsewhere)).toBeNull();
  });

  it("is outlived, unnamed, by a change of its manifest, of the granularity or by its block's removal", () => {
    const after = (change: (store: Store) => unknown) => {
      const store = mixed(true);
      const holding = held(store, unnamed(store));
      change(store);
      return outlived(holding, store.view);
    };
    expect([
      after(() => {}),
      after((store) =>
        store.dispatch({ type: "set", changes: [{ target: { block: B }, values: { x: 40 } }] }),
      ),
      after((store) =>
        store.dispatch({
          type: "set",
          changes: [{ target: { block: A, id: "score" }, values: { name: "Changed" } }],
        }),
      ),
      after((store) => store.configure({ granularity: { denominator: 5 } })),
      after((store) => store.dispatch({ type: "remove", targets: [{ block: A }] })),
    ]).toEqual([false, false, true, true, true]);
  });

  it("is outlived, named, only once its address names no timestamp", () => {
    const after = (change: (store: Store) => unknown) => {
      const store = mixed();
      const holding = held(store, named(store, ORIGIN));
      expect(change(store)).toBeNull();
      return outlived(holding, store.view);
    };
    expect([
      after(() => null),
      after((store) =>
        store.dispatch({ type: "set", changes: [{ target: ORIGIN, values: { name: "Zero" } }] }),
      ),
      after((store) => store.dispatch({ type: "remove", targets: [ORIGIN] })),
    ]).toEqual([false, false, true]);
  });

  it("clears the pin when another tab is chosen, keeps it when Timestamp is", () => {
    const store = mixed();
    const state: Shown = {
      picked: { tab: "timestamp", openings: 2 },
      pin: { ...held(store, unnamed(store)), before: "journal" },
    };
    expect([chosen(state, "manifest", 3), chosen(state, "timestamp", 3)]).toEqual([
      { picked: { tab: "manifest", openings: 3 }, pin: null },
      { picked: { tab: "timestamp", openings: 3 }, pin: state.pin },
    ]);
  });
});

describe("pinning, in the drawer", () => {
  it("selects Timestamp, keeps the pin on a click in the panel and clears it elsewhere", () => {
    const store = mixed();
    const inspector = drawer(store, true);
    click("Journal");
    const first = unnamed(store);
    inspector.pinTimestamp(first);
    expect([selected(), hint(), groups().length, inspector.shownPin()]).toEqual([
      "Timestamp",
      undefined,
      1,
      first,
    ]);
    expect(areas()).toEqual(["Coordinates", "Properties", "Coordinate granularity"]);
    inspector.pinTimestamp(unnamed(store, q(8)));
    inspector.clickedAt(panel().querySelector("th"));
    expect([selected(), groups().length]).toEqual(["Timestamp", 1]);
    inspector.clickedAt(document.body);
    expect([selected(), inspector.shownPin()]).toEqual(["Journal", null]);
    click("Timestamp");
    expect([hint(), groups(), properties(), areas()]).toEqual([
      HINT,
      [],
      null,
      ["Coordinates", "Coordinate granularity"],
    ]);
  });

  it("opens a closed drawer on Timestamp, and choosing another tab clears the pin", () => {
    const store = mixed();
    const inspector = drawer(store, false);
    expect(document.querySelector('[data-testid="inspector"]')?.hasAttribute("hidden")).toBe(true);
    inspector.pinTimestamp(unnamed(store));
    expect([
      document.querySelector('[data-testid="inspector"]')?.hasAttribute("hidden"),
      selected(),
      groups().length,
    ]).toEqual([false, "Timestamp", 1]);
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
          changes: [{ target: { block: A, id: "score" }, values: { name: "Changed" } }],
        }),
    ],
    [
      "the granularity changes",
      (store: Store) => store.configure({ granularity: { denominator: 5 } }),
    ],
    [
      "its block is deleted",
      (store: Store) => store.dispatch({ type: "remove", targets: [{ block: A }] }),
    ],
  ])("drops an unnamed pin, keeping Timestamp, when %s", (_, change) => {
    const store = mixed(true);
    const inspector = drawer(store, true);
    click("Journal");
    inspector.pinTimestamp(unnamed(store));
    store.dispatch({ type: "set", changes: [{ target: { block: B }, values: { x: 40 } }] });
    flushSync();
    expect([selected(), groups().length]).toEqual(["Timestamp", 1]);
    expect(change(store)).toBeNull();
    flushSync();
    expect([selected(), hint(), groups(), inspector.shownPin()]).toEqual([
      "Timestamp",
      HINT,
      [],
      null,
    ]);
  });

  it("shows a selected named timestamp, opening the drawer, and drops it for another selection", () => {
    const store = mixed();
    const inspector = drawer(store, true);
    click("Journal");
    inspector.setOpen(false);
    inspector.selected([ORIGIN]);
    expect([
      document.querySelector('[data-testid="inspector"]')?.hasAttribute("hidden"),
      selected(),
      nameField().value,
      inspector.shownPin(),
    ]).toEqual([false, "Timestamp", "origin", named(store, ORIGIN)]);
    inspector.selected([{ block: A }]);
    expect([selected(), inspector.shownPin()]).toEqual(["Journal", null]);
    inspector.selected([ORIGIN, { block: A, id: "timestamp_10" }]);
    expect([selected(), inspector.shownPin()]).toEqual(["Journal", null]);
  });
});

describe("coordinates, Pretty", () => {
  it("group the rows by timeline, every number exact with its unit", () => {
    const store = mixed();
    const inspector = drawer(store, true);
    inspector.pinTimestamp(unnamed(store));
    expect(groups()).toEqual([
      [
        "Score",
        [row("coordinate", "16/5", "♩"), row("cmap_1", "1536", "ticks"), row("cmap_2", "1.6", "s")],
      ],
    ]);
  });

  it("list every timeline a named timestamp crosses, children included", () => {
    const store = example();
    const inspector = drawer(store, true, T);
    inspector.selected([THEME]);
    expect(groups()).toEqual([
      [
        "Score",
        [
          row("coordinate", "4", "♩"),
          row("Bars", "1", unitSymbol("whole_notes")),
          row("Tempo", "2.0", "s"),
          row("Ticks", "1920", "ticks"),
        ],
      ],
      ["Phrase", [row("coordinate", "0", "♩"), row("Phrase ticks", "0", "ticks")]],
    ]);
  });

  it("say why a map has no value, give one row per named output, and keep what no map solves read-only", () => {
    const store = mixed();
    const inspector = drawer(store, true);
    inspector.pinTimestamp(others(store));
    expect(groups()).toEqual([
      [
        "Score",
        [
          row("coordinate", "16", "♩"),
          ["Tempo", "no value here", null, null, null],
          ["bars", "needs a server to expand its measure map", null, null, null],
          ["Both · seconds", "8.0", null, true, READ_ONLY],
          ["Both · ticks", "7680", null, true, READ_ONLY],
        ],
      ],
    ]);
    const field = valueField("Both · seconds of Score");
    expect([field.closest("td")?.getAttribute("title"), described(field)]).toEqual([
      READ_ONLY,
      READ_ONLY,
    ]);
  });
});

describe("editing values", () => {
  it("moves an unnamed pin to the typed coordinate or to a map's inverse, journalling nothing", () => {
    const store = mixed();
    const inspector = drawer(store, true);
    const pin = unnamed(store);
    inspector.pinTimestamp(pin);
    const entries = store.journal.length;
    type(valueField("coordinate of Score"), "7/2");
    press(valueField("coordinate of Score"), "Enter");
    expect([inspector.shownPin(), valueField("coordinate of Score").value]).toEqual([
      pinAt(pin, q(7, 2)),
      "7/2",
    ]);
    type(valueField("cmap_1 of Score"), "1920");
    valueField("cmap_1 of Score").dispatchEvent(new Event("blur"));
    flushSync();
    expect(inspector.shownPin()).toEqual(pinAt(pin, q(4)));
    type(valueField("cmap_2 of Score"), "2.5");
    press(valueField("cmap_2 of Score"), "Enter");
    expect([inspector.shownPin(), store.journal.length]).toEqual([pinAt(pin, q(5)), entries]);
  });

  it("moves a named timestamp by one set of its coordinate, its pin read anew", () => {
    const store = example();
    const inspector = drawer(store, true, T);
    inspector.selected([THEME]);
    const entries = store.journal.length;
    type(valueField("coordinate of Score"), "4");
    press(valueField("coordinate of Score"), "Enter");
    expect(store.journal.length).toBe(entries);
    type(valueField("coordinate of Score"), "9/2");
    press(valueField("coordinate of Score"), "Enter");
    expect(lastCommand(store)).toEqual({
      type: "set",
      changes: [{ target: THEME, values: { coordinate: [9, 2] } }],
    });
    expect([inspector.shownPin(), valueField("coordinate of Score").value]).toEqual([
      named(store, THEME),
      "9/2",
    ]);
  });

  it.each([
    ["abc", (_pin: Pin) => parseAxisValue("abc", "fraction")],
    ["13", (pin: Pin) => positionFor(pin, { timeline: "score", map: null }, q(13))],
  ])(
    "keeps the refused draft %s with core's message, and Escape shows the stored value",
    (text, refusal) => {
      const store = mixed();
      const inspector = drawer(store, true);
      const pin = unnamed(store);
      inspector.pinTimestamp(pin);
      const field = valueField("coordinate of Score");
      type(field, text);
      press(field, "Enter");
      const refused = refusal(pin);
      if (refused instanceof Rational) throw new Error("not refused");
      expect([field.value, field.getAttribute("aria-invalid"), described(field)]).toEqual([
        text,
        "true",
        refused.message,
      ]);
      expect(inspector.shownPin()).toBe(pin);
      press(field, "Escape");
      expect([field.value, field.getAttribute("aria-invalid"), described(field)]).toEqual([
        "16/5",
        "false",
        "",
      ]);
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

  /** The Copy buttons of the row labelled `label`. */
  function copies(label: string): HTMLButtonElement[] {
    const found = [...panel().querySelectorAll("tr[data-row]")].find(
      (item) => item.querySelector('th[scope="row"]')?.textContent === label,
    );
    return [...(found?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
  }

  it("writes core's copy texts, with and without the unit, and posts them as information", async () => {
    const written = clipboard();
    const store = example();
    const inspector = drawer(store, true, T);
    inspector.selected([THEME]);
    expect([...panel().querySelectorAll("thead th.copy")].map((cell) => cell.textContent)).toEqual([
      "value",
      "value + unit",
    ]);
    expect(
      copies("Tempo").map((button) => [button.getAttribute("aria-label"), button.title]),
    ).toEqual([
      ["Copy the value", "Copy the value"],
      ["Copy the value with its unit", "Copy the value with its unit"],
    ]);
    for (const button of copies("Tempo")) button.click();
    await vi.waitFor(() => expect(informed).toHaveLength(2));
    expect([written, informed]).toEqual([
      [copyValue(2, "float"), copyValueWithUnit(2, "float", "seconds")],
      ["Copied 2.0.", "Copied 2.0 s."],
    ]);
    expect(written).toEqual(["2.0", "2.0 s"]);
  });

  it("has no Copy with the unit for a number without one, and none for a missing value", () => {
    const store = mixed();
    const inspector = drawer(store, true);
    inspector.pinTimestamp(others(store));
    expect(
      ["Tempo", "Both · seconds"].map((label) =>
        copies(label).map((button) => button.getAttribute("aria-label")),
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
    const store = example();
    const inspector = drawer(store, true, T);
    click("Manifest");
    expect(group("Manifest format")).toEqual([["JSON", "YAML", "TOML"], "JSON"]);
    inspector.selected([THEME]);
    expect(group("Timestamp format")).toEqual([["Pretty", "JSON", "YAML", "TOML"], "Pretty"]);
  });

  it("shows a named timestamp as JSON, then YAML once its codec is loaded, with one Copy", async () => {
    const written: string[] = [];
    vi.stubGlobal("navigator", {
      clipboard: { writeText: async (copied: string) => void written.push(copied) },
    });
    const store = example();
    const inspector = drawer(store, true, T);
    inspector.selected([THEME]);
    const value = timestampJson(named(store, THEME));
    choose("json");
    expect(text()).toBe(dumps(value));
    if (!isLoaded("yaml")) {
      choose("yaml");
      expect(panel().querySelector('[role="status"]')?.textContent).toBe("Loading YAML…");
    }
    await loadCodec("yaml");
    choose("yaml");
    const expected = writeText("yaml", value);
    if (!expected.ok) throw new Error("not written");
    expect(text()).toBe(expected.value.text);
    [...panel().querySelectorAll("button")]
      .find((button) => button.textContent === "Copy")
      ?.click();
    await vi.waitFor(() => expect(informed).toEqual(["Copied the YAML."]));
    expect(written).toEqual([expected.value.text]);
  });

  it("refuses a null in TOML as the Manifest tab does", async () => {
    const store = mixed();
    const inspector = drawer(store, true);
    inspector.pinTimestamp(others(store));
    await loadCodec("toml");
    choose("toml");
    const refused = writeText("toml", timestampJson(others(store)));
    if (refused.ok) throw new Error("TOML holds no null");
    expect([refused.problems[0]?.code, find(".text-problem").textContent]).toEqual([
      InspectorCode.notRepresentable,
      refused.problems.map((item) => item.message).join(" "),
    ]);
  });
});

describe("properties", () => {
  const ALL = ["Wedge", "Name", "ID", "Coordinate", "Cross-section"];
  /** The toggles as `toggles` lists them, `pressed` the labels pressed. */
  const pressed = (on: readonly string[], disabled = false) =>
    ALL.map((label) => [label, String(on.includes(label)), disabled]);

  it("greys everything but the name of an unnamed timestamp, naming stores it", () => {
    const store = mixed();
    const inspector = drawer(store, true);
    inspector.pinTimestamp(unnamed(store));
    const area = properties();
    expect([
      nameField().value,
      nameField().disabled,
      toggles(),
      deleteButton()?.disabled,
      described(deleteButton() as Element),
      area?.classList.contains("unnamed"),
    ]).toEqual(["", false, pressed(["Wedge", "Name", "Cross-section"], true), true, UNNAMED, true]);
    const entries = store.journal.length;
    toggle("ID");
    deleteButton()?.click();
    flushSync();
    type(nameField(), "");
    press(nameField(), "Enter");
    expect(store.journal.length).toBe(entries);

    type(nameField(), "Upbeat");
    press(nameField(), "Enter");
    expect(lastCommand(store)).toEqual({
      type: "add",
      into: { block: A, id: "score" },
      timestamp: { name: "Upbeat", coordinate: [16, 5] },
    });
    expect([
      nameField().value,
      toggles(),
      deleteButton()?.disabled,
      inspector.shownPin()?.named?.id,
      properties()?.classList.contains("unnamed"),
    ]).toEqual([
      "Upbeat",
      pressed(["Wedge", "Name", "Cross-section"]),
      false,
      "timestamp_11",
      false,
    ]);
  });

  it("renames a named timestamp, keeps a name and journals nothing for an unchanged one", () => {
    const store = example();
    const inspector = drawer(store, true, T);
    inspector.selected([THEME]);
    expect(nameField().value).toBe("Theme");
    const entries = store.journal.length;
    nameField().dispatchEvent(new Event("blur"));
    type(nameField(), "");
    press(nameField(), "Enter");
    expect([store.journal.length, nameField().value, described(nameField())]).toEqual([
      entries,
      "Theme",
      "A named timestamp keeps a name; Delete removes it.",
    ]);
    type(nameField(), "Subject");
    press(nameField(), "Enter");
    expect(lastCommand(store)).toEqual({
      type: "set",
      changes: [{ target: THEME, values: { name: "Subject" } }],
    });
    expect([nameField().value, described(nameField())]).toEqual(["Subject", ""]);
  });

  it("shows what each named timestamp displays", () => {
    const store = example();
    const inspector = drawer(store, true, T);
    const shown = (address: Address) => {
      inspector.selected([address]);
      return toggles();
    };
    expect([shown(THEME), shown(CLIMAX), shown(SILENT)]).toEqual([
      pressed(["Wedge", "Name", "Cross-section"]),
      pressed(ALL),
      pressed([]),
    ]);
    expect(
      [...area("Properties").querySelectorAll('[role="group"] button')].map(
        (button) => (button as HTMLButtonElement).type,
      ),
    ).toEqual(ALL.map(() => "button"));
  });

  it.each([
    [THEME, "ID", ["wedge", "name", "id", "cross_section"]],
    [THEME, "Wedge", ["name", "cross_section"]],
    [SILENT, "Coordinate", ["coordinate"]],
    [CLIMAX, "Cross-section", ["wedge", "name", "id", "coordinate"]],
  ] as const)("toggles on %j the word %s: one set of its display", (address, label, display) => {
    const store = example();
    const inspector = drawer(store, true, T);
    inspector.selected([address]);
    toggle(label);
    expect(lastCommand(store)).toEqual({
      type: "set",
      changes: [{ target: address, values: { display } }],
    });
    const labels = ALL.filter((_, index) =>
      display.includes(["wedge", "name", "id", "coordinate", "cross_section"][index] as never),
    );
    expect(toggles()).toEqual(pressed(labels));
  });

  it("deletes a named timestamp, then shows the hint", () => {
    const store = example();
    const inspector = drawer(store, true, T);
    inspector.selected([THEME]);
    deleteButton()?.click();
    flushSync();
    expect(lastCommand(store)).toEqual({ type: "remove", targets: [THEME] });
    expect([selected(), hint(), properties(), inspector.shownPin()]).toEqual([
      "Timestamp",
      HINT,
      null,
      null,
    ]);
  });
});

describe("coordinate granularity", () => {
  /** Each setting as [label, text, title, invalid, problem]. */
  function settings(): unknown[] {
    return [...area("Coordinate granularity").querySelectorAll(".settings label")].map((label) => {
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
    const found = [...area("Coordinate granularity").querySelectorAll(".settings label")].find(
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
    const store = mixed();
    const listed = store.listed.length;
    const entries = store.journal.length;
    const inspector = drawer(store, true);
    click("Timestamp");
    expect([hint(), areas().at(-1), settings()]).toEqual([
      HINT,
      "Coordinate granularity",
      [
        ["Denominator", "2520", DENOMINATOR, "false", ""],
        ["Decimals", "3", DECIMALS, "false", ""],
      ],
    ]);
    type(field("Denominator"), "5");
    type(field("Decimals"), "6");
    expect([store.view.settings.granularity, store.journal.length, store.listed.length]).toEqual([
      { denominator: 5, decimals: 6 },
      entries,
      listed,
    ]);
    inspector.pinTimestamp(unnamed(store));
    expect(settings()).toEqual([
      ["Denominator", "5", DENOMINATOR, "false", ""],
      ["Decimals", "6", DECIMALS, "false", ""],
    ]);
  });

  it.each([
    ["Denominator", "0", { denominator: 0 }],
    ["Decimals", "16", { decimals: 16 }],
  ] as const)(
    "marks a refused %s %s with core's problem and shows the stated value on leaving",
    (label, text, change) => {
      const store = mixed();
      drawer(store, true);
      click("Timestamp");
      const before = store.view.settings.granularity;
      type(field(label), text);
      const problem = store.configure({ granularity: change });
      const setting = () => settings().find((item) => (item as string[])[0] === label) as unknown[];
      expect(store.view.settings.granularity).toBe(before);
      expect([setting()[1], setting()[3], setting()[4]]).toEqual([text, "true", problem?.message]);
      field(label).dispatchEvent(new Event("change", { bubbles: true }));
      flushSync();
      expect([setting()[1], setting()[3], setting()[4]]).toEqual([
        String(before[label === "Denominator" ? "denominator" : "decimals"]),
        "false",
        "",
      ]);
    },
  );
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
  const ROWS: MeasureKnots[] = [
    {
      id: "measuremap_1",
      rows: [measure("1", 0), measure("2", 4), measure("3", 8), measure("4", 12)],
    },
  ];

  /** `group_measure_map` with the timestamp "Bar two" at 6 on `score`, and its address. */
  function measureStore(): { store: Store; barTwo: Address } {
    const store = storeOf("groups/group_measure_map");
    const added = store.dispatch({
      type: "add",
      into: { block: A, id: "score" },
      timestamp: { name: "Bar two", coordinate: [6, 1] },
    });
    if (added !== null) throw new Error(added.message);
    const found = store.view.blocks[A]?.manifest.graphical?.timestamps?.find(
      (item) => item.name === "Bar two",
    );
    if (found === undefined) throw new Error("Bar two is not stored");
    return { store, barTwo: { block: A, id: found.id } };
  }

  /** The text of the row `cmap_1`. */
  const measureRow = () =>
    [...panel().querySelectorAll("tr[data-row]")]
      .find((item) => item.querySelector('th[scope="row"]')?.textContent === "cmap_1")
      ?.querySelector(".text")?.textContent ?? null;

  it("are the canvas's, read again when they arrive, as an unnamed pin there reads them", () => {
    const { store, barTwo } = measureStore();
    const known = new SvelteMap<Manifest, readonly MeasureKnots[]>();
    const knotsOf: KnotsOf = (manifest) => known.get(manifest) ?? "pending";
    const inspector = drawer(store, true, A, knotsOf);
    inspector.selected([barTwo]);
    expect(measureRow()).toBe("waiting for the server");
    const manifest = store.view.blocks[A]?.manifest;
    if (manifest === undefined) throw new Error("the block is in the store");
    known.set(manifest, ROWS);
    flushSync();
    expect(measureRow()).toBe("2");
    const shown = inspector.shownPin();
    expect(shown).toEqual(named(store, barTwo, ROWS));
    if (shown === null) throw new Error("the named timestamp is shown");
    const rows = groups();
    inspector.pinTimestamp({ ...shown, named: null });
    expect([groups(), measureRow()]).toEqual([rows, "2"]);
  });

  it("need a server without the canvas's", () => {
    const { store, barTwo } = measureStore();
    const inspector = drawer(store, true);
    inspector.selected([barTwo]);
    expect(measureRow()).toBe("needs a server to expand its measure map");
  });
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
