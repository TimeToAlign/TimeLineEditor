/** The Timestamp tab; the expected values are derived in `README.md` ("The Timestamp tab"). */

import { liveStore, selectionOf } from "@timetoalign/tilie-arranger";
import { ServerError } from "@timetoalign/tilie-client";
import type {
  ConversionMap,
  Expressed,
  GridInUse,
  Store,
  Timestamp,
  TimestampSegment,
  TimestampSpec,
} from "@timetoalign/tilie-core";
import {
  coordinateDict,
  copyValue,
  DEFAULT_GRANULARITY,
  displayValue,
  timestampAt,
  unitSymbol,
} from "@timetoalign/tilie-core";
import { Rational } from "@timetoalign/tilie-core/numbers";
import type { TimeUnit } from "@timetoalign/timetoshare";
import { dumps } from "@timetoalign/timetoshare";
import { flushSync, mount, unmount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import InspectorDrawer from "../src/InspectorDrawer.svelte";
import type { Pinning, Shown } from "../src/inspector/tabs.ts";
import { chosen, outlived, pinned, pinningOf } from "../src/inspector/tabs.ts";
import { timestampHeading, timestampJson } from "../src/inspector/timestamp.ts";
import { measureMapsOf } from "../src/measureMaps.ts";
import { MIXED, mixedStore } from "./mixed.ts";

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

/** The form of core's README ("Timestamps"). */
const FORM: TimestampSpec = {
  block: MIXED.A,
  step: q(1, 2),
  line: {
    timeline: "form",
    name: "Form",
    unit: "quarters",
    numberType: "fraction",
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

const AT = timestampAt(FORM, q(27, 2));
const MOVED = timestampAt(FORM, q(8));

/** A line whose maps give no value, need the rows of a MeasureMap, or name their outputs. */
const OTHERS = timestampAt(
  {
    block: MIXED.A,
    step: q(1),
    line: {
      timeline: "score",
      name: "Score",
      unit: "quarters",
      numberType: "fraction",
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
  },
  q(16),
);

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
  pinTimestamp(timestamp: Timestamp | null): void;
  clickedAt(target: EventTarget | null): void;
  setOpen(open: boolean): void;
}

/** The drawer over `store`, open when `open`, given the grid of a last reading; each call flushes. */
function drawer(store: Store, open: boolean, grid: GridInUse | null = null): Drawer {
  const mounted = mount(InspectorDrawer, {
    target: document.body,
    props: {
      live: liveStore(store),
      selection: selectionOf([{ block: MIXED.A }]),
      placement: null,
      storageKey: null,
      grid,
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
    pinTimestamp: flushed((timestamp: Timestamp | null) => mounted.pinTimestamp(timestamp)),
    clickedAt: flushed((target: EventTarget | null) => mounted.clickedAt(target)),
    setOpen: flushed((next: boolean) => mounted.setOpen(next)),
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

/** Each section of the pinned timestamp as [heading, [label, text, Copy's name or null]…]. */
function sections(): unknown[] {
  return [...panel().querySelectorAll("tbody")].map((body) => [
    body.querySelector('th[scope="colgroup"]')?.textContent,
    [...body.querySelectorAll("tr")]
      .slice(1)
      .map((row) => [
        row.querySelector('th[scope="row"]')?.textContent,
        row.querySelector(".value")?.textContent,
        row.querySelector("button")?.getAttribute("aria-label") ?? null,
      ]),
  ]);
}

const EMPTY = "Click a coordinate on a timeline to pin it here.";

function empty(): string | null | undefined {
  return panel().querySelector(".empty")?.textContent;
}

/** A number core expresses, shown as core shows it, with its unit's symbol when it has one. */
function shown(value: Expressed | null): string {
  if (value === null || typeof value !== "object" || !("numberType" in value)) {
    throw new Error("not a number");
  }
  const text = displayValue(value.value, value.numberType);
  return value.unit === null ? text : `${text} ${unitSymbol(value.unit)}`;
}

/** The value of map `id` in the timestamp's part `part`. */
function mapValue(timestamp: Timestamp, part: number, id: string): Expressed | null {
  const map = timestamp.parts[part]?.maps.find((item) => item.id === id);
  if (map === undefined) throw new Error(`no map ${id}`);
  return map.value;
}

/** `timestamp` pinned in the view of `store`. */
function pinning(store: Store, timestamp: Timestamp): Pinning {
  const found = pinningOf(store.view, timestamp);
  if (found === null) throw new Error("the timestamp's block is in the store");
  return found;
}

describe("pinning, as a rule", () => {
  it("selects Timestamp, keeps the tab shown before the first pin and returns to it", () => {
    const store = mixedStore();
    const at = pinning(store, AT);
    const moved = pinning(store, MOVED);
    const start: Shown = { picked: { tab: "journal", openings: 2 }, pin: null };
    const first = pinned(start, at);
    const second = pinned(first, moved);
    const cleared = pinned(second, null);
    expect([first, second, cleared]).toEqual([
      { picked: { tab: "timestamp", openings: 2 }, pin: { ...at, before: "journal" } },
      { picked: { tab: "timestamp", openings: 2 }, pin: { ...moved, before: "journal" } },
      { picked: { tab: "journal", openings: 2 }, pin: null },
    ]);
    expect(pinned(cleared, null)).toBe(cleared);
  });

  it("pins with the view's manifest and granularity, and nothing for a block it does not hold", () => {
    const store = mixedStore();
    const at = pinning(store, AT);
    expect(at.manifest).toBe(store.view.blocks[MIXED.A]?.manifest);
    expect(at.granularity).toBe(store.view.settings.granularity);
    expect(pinningOf(store.view, { ...AT, block: "zzzzzzzzzz" })).toBeNull();
  });

  it("is outlived by a change of its manifest, of the granularity or by its block's removal", () => {
    const after = (change: (store: Store) => unknown) => {
      const store = mixedStore();
      const at = pinning(store, AT);
      change(store);
      return outlived(at, store.view);
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
      after((store) =>
        store.configure({ granularity: { fraction: { denominator: 5, refine: true } } }),
      ),
      after((store) => store.dispatch({ type: "remove", targets: [{ block: MIXED.A }] })),
    ]).toEqual([false, false, true, true, true]);
  });

  it("clears the pin when another tab is chosen, keeps it when Timestamp is", () => {
    const state: Shown = {
      picked: { tab: "timestamp", openings: 2 },
      pin: { ...pinning(mixedStore(), AT), before: "journal" },
    };
    expect([chosen(state, "manifest", 3), chosen(state, "timestamp", 3)]).toEqual([
      { picked: { tab: "manifest", openings: 3 }, pin: null },
      { picked: { tab: "timestamp", openings: 3 }, pin: state.pin },
    ]);
  });
});

describe("pinning, in the drawer", () => {
  it("selects Timestamp, keeps the pin on a click in the panel and clears it elsewhere", () => {
    const inspector = drawer(mixedStore(), true);
    click("Journal");
    inspector.pinTimestamp(AT);
    expect([selected(), empty(), sections().length]).toEqual(["Timestamp", undefined, 2]);
    inspector.pinTimestamp(MOVED);
    expect(sections().at(1)).toEqual([
      "B · segment",
      [
        ["coordinate", "0 ♩", "Copy coordinate of B"],
        ["Samples", shown_(MOVED, 1, "B_samples"), "Copy Samples of B"],
        ["Tempo", shown_(MOVED, 1, "B_tempo"), "Copy Tempo of B"],
        ["Ticks", shown_(MOVED, 1, "B_ticks"), "Copy Ticks of B"],
      ],
    ]);
    inspector.clickedAt(panel().querySelector("h3"));
    expect([selected(), sections().length]).toEqual(["Timestamp", 2]);
    inspector.clickedAt(document.body);
    expect(selected()).toBe("Journal");
    click("Timestamp");
    expect([empty(), sections()]).toEqual([EMPTY, []]);
  });

  it("opens a closed drawer on Timestamp, and choosing another tab clears the pin", () => {
    const inspector = drawer(mixedStore(), false);
    expect(document.querySelector('[data-testid="inspector"]')?.hasAttribute("hidden")).toBe(true);
    inspector.pinTimestamp(AT);
    expect([
      document.querySelector('[data-testid="inspector"]')?.hasAttribute("hidden"),
      selected(),
      sections().length,
    ]).toEqual([false, "Timestamp", 2]);
    click("Manifest");
    click("Timestamp");
    expect(empty()).toBe(EMPTY);
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
      (store: Store) =>
        store.configure({ granularity: { fraction: { denominator: 5, refine: true } } }),
    ],
    [
      "its block is deleted",
      (store: Store) => store.dispatch({ type: "remove", targets: [{ block: MIXED.A }] }),
    ],
  ])("drops the pin, keeping Timestamp, when %s", (_, change) => {
    const store = mixedStore();
    const inspector = drawer(store, true);
    click("Journal");
    inspector.pinTimestamp(AT);
    store.dispatch({ type: "set", changes: [{ target: { block: MIXED.B }, values: { x: 40 } }] });
    flushSync();
    expect([selected(), sections().length]).toEqual(["Timestamp", 2]);
    expect(change(store)).toBeNull();
    flushSync();
    expect([selected(), empty(), sections()]).toEqual(["Timestamp", EMPTY, []]);
  });
});

/** `shown` of the value of map `id` in part `part`. */
function shown_(timestamp: Timestamp, part: number, id: string): string {
  return shown(mapValue(timestamp, part, id));
}

describe("the rows", () => {
  it("show each part's coordinate, then its maps in the order given, in core's texts", () => {
    const inspector = drawer(mixedStore(), true);
    inspector.pinTimestamp(AT);
    expect(sections()).toEqual([
      [
        "Form",
        [
          ["coordinate", `${displayValue(q(27, 2), "fraction")} ♩`, "Copy coordinate of Form"],
          ["Ticks", shown_(AT, 0, "form_ticks"), "Copy Ticks of Form"],
        ],
      ],
      [
        "B · segment",
        [
          ["coordinate", `${displayValue(q(11, 2), "fraction")} ♩`, "Copy coordinate of B"],
          ["Samples", shown_(AT, 1, "B_samples"), "Copy Samples of B"],
          ["Tempo", shown_(AT, 1, "B_tempo"), "Copy Tempo of B"],
          ["Ticks", shown_(AT, 1, "B_ticks"), "Copy Ticks of B"],
        ],
      ],
    ]);
    expect(panel().querySelector('[data-testid="timestamp-where"]')?.textContent).toBe(
      "Form at 13 1/2 ♩ · grid 1/2 ♩ (fraction base 1, refining)",
    );
  });

  it("say why a map has no value, in core's words, and give one row per named output", () => {
    const inspector = drawer(mixedStore(), true);
    inspector.pinTimestamp(OTHERS);
    const outputs = mapValue(OTHERS, 0, "both");
    if (outputs === null || typeof outputs !== "object" || !("outputs" in outputs)) {
      throw new Error("the CombinationMap names its outputs");
    }
    expect(sections()).toEqual([
      [
        "Score",
        [
          ["coordinate", `${displayValue(q(16), "fraction")} ♩`, "Copy coordinate of Score"],
          ["Tempo", "no value here", null],
          ["bars", "needs a server to expand its measure map", null],
          [
            "Both · seconds",
            shown(outputs.outputs.seconds ?? null),
            "Copy Both · seconds of Score",
          ],
          ["Both · ticks", shown(outputs.outputs.ticks ?? null), "Copy Both · ticks of Score"],
        ],
      ],
    ]);
    expect(shown(outputs.outputs.seconds ?? null)).toBe(displayValue(q(8), "fraction"));
  });
});

describe("copying", () => {
  it("writes a value's copy text and the JSON to the clipboard", async () => {
    const written: string[] = [];
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: async (text: string) => {
          written.push(text);
        },
      },
    });
    const inspector = drawer(mixedStore(), true);
    inspector.pinTimestamp(AT);
    panel().querySelector<HTMLElement>('[aria-label="Copy Tempo of B"]')?.click();
    await vi.waitFor(() => expect(panel().querySelector(".status")?.textContent).not.toBe(""));
    flushSync();
    const status = panel().querySelector(".status")?.textContent;
    [...panel().querySelectorAll("button")]
      .find((button) => button.textContent === "Copy JSON")
      ?.click();
    await vi.waitFor(() => expect(written).toHaveLength(2));
    const json = dumps([
      {
        timeline: "form",
        segment: false,
        coordinate: coordinateDict(q(27, 2), "quarters", "fraction"),
        maps: { form_ticks: coordinateDict(6480n, "ticks", "int") },
      },
      {
        timeline: "B",
        segment: true,
        coordinate: coordinateDict(q(11, 2), "quarters", "fraction"),
        maps: {
          B_samples: coordinateDict(327994n, "samples", "int"),
          B_tempo: coordinateDict(7.4375, "seconds", "float"),
          B_ticks: coordinateDict(2640n, "ticks", "int"),
        },
      },
    ]);
    expect([written, status, panel().querySelector("pre")?.textContent]).toEqual([
      [copyValue(7.4375, "float"), json],
      "Copied Tempo of B.",
      json,
    ]);
    expect(timestampJson(AT)).toBe(json);
  });

  it("writes a number without a unit as its number type and value, and no value as null", () => {
    expect(timestampJson(OTHERS)).toBe(
      dumps([
        {
          timeline: "score",
          segment: false,
          coordinate: coordinateDict(q(16), "quarters", "fraction"),
          maps: {
            pieces: null,
            bars: null,
            both: {
              seconds: { number_type: "fraction", value: [8, 1] },
              ticks: { number_type: "fraction", value: [7680, 1] },
            },
          },
        },
      ]),
    );
    expect(timestampHeading(OTHERS, mixedStore().view.settings.granularity)).toBe(
      "Score at 16 ♩ · grid 1 ♩ (fraction base 1, refining)",
    );
  });
});

describe("granularity", () => {
  /** Each setting as [legend, step text, refining, invalid, problem]. */
  function settings(): unknown[] {
    return [...panel().querySelectorAll("fieldset")].map((fieldset) => [
      fieldset.querySelector("legend")?.textContent,
      fieldset.querySelector<HTMLInputElement>('input[type="text"]')?.value,
      fieldset.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked,
      fieldset.querySelector('input[type="text"]')?.getAttribute("aria-invalid"),
      fieldset.querySelector(".problem")?.textContent,
    ]);
  }

  function field(legend: string, type: "text" | "checkbox"): HTMLInputElement {
    const fieldset = [...panel().querySelectorAll("fieldset")].find(
      (item) => item.querySelector("legend")?.textContent === legend,
    );
    const input = fieldset?.querySelector<HTMLInputElement>(`input[type="${type}"]`);
    if (input === null || input === undefined) throw new Error(`no ${type} for ${legend}`);
    return input;
  }

  function type(legend: string, text: string): void {
    const input = field(legend, "text");
    input.value = text;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    flushSync();
  }

  it("shows and sets the workspace's settings without a journal entry or an undo step", () => {
    const store = mixedStore();
    const listed = store.listed.length;
    drawer(store, true);
    click("Timestamp");
    expect([empty(), settings()]).toEqual([
      EMPTY,
      [
        ["Fractions", "1", true, "false", ""],
        ["Floats", "1", true, "false", ""],
        ["Integers", "1", true, "false", ""],
      ],
    ]);
    type("Fractions", "5");
    type("Floats", "0.2");
    field("Integers", "checkbox").click();
    flushSync();
    expect([store.view.settings.granularity, store.journal.length, store.listed.length]).toEqual([
      {
        fraction: { denominator: 5, refine: true },
        float: { step: "0.2", refine: true },
        int: { step: 1, refine: false },
      },
      3,
      listed,
    ]);
    expect(settings()).toEqual([
      ["Fractions", "5", true, "false", ""],
      ["Floats", "0.2", true, "false", ""],
      ["Integers", "1", false, "false", ""],
    ]);
  });

  it("marks a refused step with core's problem and shows the stated step on leaving", () => {
    const store = mixedStore();
    drawer(store, true);
    click("Timestamp");
    type("Fractions", "5");
    type("Fractions", "0");
    const problem = store.configure({
      granularity: { fraction: { denominator: 0, refine: true } },
    });
    expect([store.view.settings.granularity.fraction, settings().at(0)]).toEqual([
      { denominator: 5, refine: true },
      ["Fractions", "0", true, "true", problem?.message],
    ]);
    field("Fractions", "text").dispatchEvent(new Event("change", { bubbles: true }));
    flushSync();
    expect(settings().at(0)).toEqual(["Fractions", "5", true, "false", ""]);
  });
});

describe("the step in use", () => {
  it("says there has been no reading yet, then names the last reading's grid", () => {
    drawer(mixedStore(), true);
    click("Timestamp");
    expect(panel().querySelector('[data-testid="grid-in-use"]')?.textContent?.trim()).toBe(
      "No reading yet: turn on Show coordinates and point at a timeline.",
    );
    unmountAll();
    drawer(mixedStore(), true, {
      step: q(1, 32),
      numberType: "fraction",
      unit: "quarters",
      granularity: DEFAULT_GRANULARITY,
    });
    click("Timestamp");
    expect(panel().querySelector('[data-testid="grid-in-use"]')?.textContent?.trim()).toBe(
      "In use: grid 1/32 ♩ (fraction base 1, refining)",
    );
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
