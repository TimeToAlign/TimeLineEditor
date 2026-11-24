/** The Timestamp tab; the expected values are derived in `README.md` ("The Timestamp tab"). */

/// <reference types="node" />
import { readFileSync } from "node:fs";
import path from "node:path";
import type { KnotsOf, TransientCommand } from "@timetoalign/tilie-arranger";
import {
  drawingOf,
  liveStore,
  namedPin,
  selectionOf,
  timelinePin,
} from "@timetoalign/tilie-arranger";
import { ServerError } from "@timetoalign/tilie-client";
import type {
  Address,
  ConversionMap,
  Manifest,
  MeasureKnot,
  MeasureKnots,
  Pin,
  Store,
} from "@timetoalign/tilie-core";
import {
  copyValue,
  createStore,
  isLoadError,
  parseAxisValue,
  pinAt,
  positionFor,
  prettyText,
  rawText,
  readWorkspace,
  timestampJson,
} from "@timetoalign/tilie-core";
import { Rational } from "@timetoalign/tilie-core/numbers";
import { lineAxes } from "@timetoalign/tilie-layout";
import type { TimeUnit } from "@timetoalign/timetoshare";
import { dumps, fontMetrics } from "@timetoalign/timetoshare";
import { flushSync, mount, unmount } from "svelte";
import { SvelteMap } from "svelte/reactivity";
import { afterEach, describe, expect, it, vi } from "vitest";
import InspectorDrawer from "../src/InspectorDrawer.svelte";
import { isLoaded, loadCodec, writeText } from "../src/inspector/formats.svelte.ts";
import type { Held, Shown } from "../src/inspector/tabs.ts";
import { chosen, heldOf, outlived, pinned } from "../src/inspector/tabs.ts";
import { heldPinOf, timestampText } from "../src/inspector/timestamp.ts";
import { measureMapsOf } from "../src/measureMaps.ts";
import { transientContext } from "../src/transient.ts";
import { addStylesOf, fadingsOf } from "./dom.ts";
import { noMatchClaims, posting, providing, storeOf, withFullCards } from "./support.ts";

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
    null,
    null,
  );
  if (pin === null) throw new Error(`no timestamp ${address.id}`);
  return pin;
}

/**
 * An unnamed pin on `score` of `bundle_mixed` at `position`, as a click on
 * its line on the arranger reads it: by its group, `score` being a member.
 */
function unnamed(store: Store, position: Rational = q(16, 5)): Pin {
  const block = store.view.blocks[A];
  if (block === undefined) throw new Error("no block A");
  const drawing = drawingOf(block, store.view.graphical, fontMetrics);
  const granularity = store.view.settings.granularity;
  const pin = timelinePin(
    block.manifest,
    A,
    drawing,
    "score",
    position,
    granularity,
    "no_server",
    true,
    null,
    null,
  );
  if (pin === null) throw new Error("no pin of score");
  return pin;
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

/**
 * The end (12) of `annotations` of `bundle_mixed` (12 quarters, in no
 * group) in `store`, given by commands a MeasureMap `measures` and maps
 * that give no value there, need that MeasureMap's rows or name their
 * outputs, pinned as a click on its line reads it.
 */
function others(store: Store): Pin {
  const maps: ConversionMap[] = [
    {
      type: "PiecewiseMap",
      id: "pieces",
      name: "Tempo",
      source_unit: "quarters",
      target_unit: "seconds",
      breaks: [0, 4, 12],
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
  const into: Address = { block: A, id: "annotations" };
  for (const command of [
    {
      type: "add",
      into: { block: A },
      measure_map: { id: "measures", rows: [{ count: 1, qstamp: [0, 1] }] },
    },
    ...maps.map((map) => ({ type: "add", into, map })),
  ] as const) {
    const error = store.dispatch(command);
    if (error !== null) throw new Error(error.message);
  }
  const block = store.view.blocks[A];
  if (block === undefined) throw new Error("no block A");
  const drawing = drawingOf(block, store.view.graphical, fontMetrics);
  const pin = timelinePin(
    block.manifest,
    A,
    drawing,
    "annotations",
    q(12),
    store.view.settings.granularity,
    "no_server",
    false,
    null,
    null,
  );
  if (pin === null) throw new Error("no pin of annotations");
  return pin;
}

let app: ReturnType<typeof mount> | undefined;
/** The information the drawer posted to the message bar since it was mounted. */
let informed: string[] = [];
/** What the drawer handed the canvas to show without storing it, since it was mounted. */
let handed: (TransientCommand | null)[] = [];

afterEach(() => {
  if (app !== undefined) unmount(app);
  app = undefined;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

interface Drawer {
  pinTimestamp(pin: Pin | null, line?: string | null): void;
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
  handed = [];
  const mounted = mount(providing(InspectorDrawer), {
    target: document.body,
    context: new Map<symbol, unknown>([
      ...posting(informed),
      ...transientContext((shown) => handed.push(shown)),
    ]),
    props: {
      live: liveStore(store),
      selection: selectionOf([{ block }]),
      placement: null,
      storageKey: null,
      ...noMatchClaims(),
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
    pinTimestamp: flushed((pin: Pin | null, line: string | null = null) =>
      mounted.pinTimestamp(pin, line),
    ),
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

/** The name header, or `null` without one. */
const nameHeader = () => panel().querySelector<HTMLElement>('[data-testid="timestamp-name"]');

const nameField = () => find<HTMLInputElement>('input[type="text"]', nameHeader() ?? panel());

/** The display toggles as [label, pressed, disabled]. */
function toggles(): unknown[] {
  return [...area("Properties").querySelectorAll<HTMLButtonElement>(DISPLAY_TOGGLES)].map(
    (button) => [button.textContent, button.getAttribute("aria-pressed"), button.disabled],
  );
}

const DISPLAY_TOGGLES = '[data-testid="timestamp-display"] [role="group"] button';

function toggle(label: string): void {
  const button = [...area("Properties").querySelectorAll<HTMLButtonElement>(DISPLAY_TOGGLES)].find(
    (item) => item.textContent === label,
  );
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
    // Score and Performance, the member of its group read with it.
    expect([selected(), hint(), groups().length, inspector.shownPin()]).toEqual([
      "Timestamp",
      undefined,
      2,
      first,
    ]);
    expect(areas()).toEqual(["Coordinates", "Properties", "Coordinate granularity"]);
    inspector.pinTimestamp(unnamed(store, q(8)));
    inspector.clickedAt(panel().querySelector("th"));
    expect([selected(), groups().length]).toEqual(["Timestamp", 2]);
    inspector.clickedAt(document.body);
    expect([selected(), inspector.shownPin()]).toEqual(["Journal", null]);
    click("Timestamp");
    expect([hint(), groups(), nameHeader(), properties(), areas()]).toEqual([
      HINT,
      [],
      null,
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
    expect([selected(), groups().length]).toEqual(["Timestamp", 2]);
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

describe("a timeline's start or end mark, selected", () => {
  const MIDDLE_START: Address = { block: A, id: "middle", part: ["start"] };
  const MIDDLE_END: Address = { block: A, id: "middle", part: ["end"] };

  /**
   * The arranger's pin of `timeline` in block A of `store` at `position`, read without a server,
   * by the group where `group`.
   */
  function onTimeline(store: Store, timeline: string, position: Rational, group: boolean) {
    const block = store.view.blocks[A];
    if (block === undefined) throw new Error("no block A");
    const drawing = drawingOf(block, store.view.graphical, fontMetrics);
    const granularity = store.view.settings.granularity;
    return timelinePin(
      block.manifest,
      A,
      drawing,
      timeline,
      position,
      granularity,
      "no_server",
      group,
      null,
      null,
    );
  }

  it("pins the member's start and end, its ancestor below it, then its group", () => {
    const store = storeOf("groups/group_parent_both");
    const inspector = drawer(store, false);
    inspector.selected([MIDDLE_START]);
    expect([
      document.querySelector('[data-testid="inspector"]')?.hasAttribute("hidden"),
      selected(),
      groups(),
      inspector.shownPin(),
      inspector.shownPin()?.named,
    ]).toEqual([
      false,
      "Timestamp",
      [
        ["Middle", [row("coordinate", "0", "♩")]],
        ["Piece", [row("coordinate", "4", "♩")]],
        ["Recording", [row("coordinate", "0.0", "s")]],
      ],
      onTimeline(store, "middle", q(0), true),
      null,
    ]);
    inspector.selected([MIDDLE_END]);
    expect([groups(), inspector.shownPin()]).toEqual([
      [
        ["Middle", [row("coordinate", "8", "♩")]],
        ["Piece", [row("coordinate", "12", "♩")]],
        ["Recording", [row("coordinate", "10.0", "s")]],
      ],
      onTimeline(store, "middle", q(8), true),
    ]);
    inspector.selected([{ block: A }]);
    expect([selected(), inspector.shownPin()]).toEqual([
      "Timestamp",
      onTimeline(store, "middle", q(8), true),
    ]);
  });

  it("pins the member's start in its own timeline editor without its group, as a reading there", () => {
    const store = storeOf("groups/group_parent_both");
    const inspector = drawer(store, false);
    expect(store.open({ block: A, id: "middle" })).toBeNull();
    flushSync();
    inspector.selected([MIDDLE_START]);
    expect([groups(), inspector.shownPin()]).toEqual([
      [
        ["Middle", [row("coordinate", "0", "♩")]],
        ["Piece", [row("coordinate", "4", "♩")]],
      ],
      onTimeline(store, "middle", q(0), false),
    ]);
  });

  it("pins nothing for an end of unknown length", () => {
    const inspector = drawer(storeOf("unknown_length"), true);
    click("Journal");
    inspector.selected([{ block: A, id: "score", part: ["end"] }]);
    expect([selected(), inspector.shownPin()]).toEqual(["Journal", null]);
  });

  it("pins nothing for a mark's label or two addresses", () => {
    const inspector = drawer(storeOf("groups/group_parent_both"), true);
    click("Journal");
    inspector.selected([{ block: A, id: "middle", part: ["start", "label"] }]);
    expect([selected(), inspector.shownPin()]).toEqual(["Journal", null]);
    inspector.selected([MIDDLE_START, MIDDLE_END]);
    expect([selected(), inspector.shownPin()]).toEqual(["Journal", null]);
  });
});

describe("a named timestamp on the root of an ancestor card", () => {
  it("is read on the card's line while the card is raised, on the ancestor line otherwise", () => {
    const store = storeOf("groups/group_parent_both");
    expect(
      store.dispatch({
        type: "add",
        into: { block: A, id: "piece" },
        timestamp: { name: "At 8", coordinate: [8, 1] },
      }),
    ).toBeNull();
    const id = store.view.blocks[A]?.manifest.graphical?.timestamps?.find(
      (item) => item.name === "At 8",
    )?.id;
    if (id === undefined) throw new Error("no timestamp named");
    const piece = ["Piece", [row("coordinate", "8", "♩")]];
    const middle = ["Middle", [row("coordinate", "4", "♩")]];
    const inspector = drawer(store, true);
    /** Where the pin reads `middle`: its own line, else the card's row of it. */
    const middleAt = () => inspector.shownPin()?.spec.members.map((m) => [m.timeline, m.ordinate]);
    inspector.selected([{ block: A, id }]);
    expect([selected(), groups(), middleAt()]).toEqual([
      "Timestamp",
      [middle, piece],
      [["middle", 47.20703125]],
    ]);
    expect(store.open({ block: A, id: "piece" })).toBeNull();
    flushSync();
    expect([groups(), middleAt()]).toEqual([[middle, piece], [["middle", 51.20703125]]]);
    store.done();
    flushSync();
    expect([groups(), middleAt()]).toEqual([[middle, piece], [["middle", 47.20703125]]]);
  });
});

describe("a pin read on a line", () => {
  /** The key of the line drawn for `timeline` in the card of `member` in block A of `store`. */
  function lineIn(store: Store, timeline: string, member: string): string {
    const block = store.view.blocks[A];
    if (block === undefined) throw new Error("no block A");
    const drawing = drawingOf(block, store.view.graphical, fontMetrics);
    const found = [...lineAxes(drawing)].find(
      ([, axis]) =>
        axis.timeline === timeline && axis.ancestor === undefined && axis.card.member === member,
    );
    if (found === undefined) throw new Error(`no line of ${timeline} in ${member}'s card`);
    return found[0];
  }

  /** Whether the GroupStamp toggle is pressed, as its `aria-pressed`; `null` where none is offered. */
  function groupstampToggle(): string | null {
    const button = panel().querySelector<HTMLButtonElement>(
      '[data-testid="timestamp-groupstamp"] button',
    );
    return button === null ? null : button.getAttribute("aria-pressed");
  }

  /** The arranger's pin of `timeline` at `position` in block A of `store`, as a reading on `line` makes it. */
  function readOn(
    store: Store,
    timeline: string,
    position: Rational,
    line: string,
    group: boolean,
    raised: string | null,
  ): Pin {
    const block = store.view.blocks[A];
    if (block === undefined) throw new Error("no block A");
    const drawing = drawingOf(block, store.view.graphical, fontMetrics);
    const granularity = store.view.settings.granularity;
    const pin = timelinePin(
      block.manifest,
      A,
      drawing,
      timeline,
      position,
      granularity,
      "no_server",
      group,
      raised,
      line,
    );
    if (pin === null) throw new Error(`no pin of ${timeline}`);
    return pin;
  }

  it("names a timestamp read on that line, and shows a selected one at its first place", () => {
    // `score` 9 has two places: its ancestor line in `exposition`'s card (first), where no map
    // is drawn, and the line of its card behind `group_2`'s frame, which draws `cmap_1`; the
    // cards drawn whole (the Full view), the subject being the line read, not the elision.
    const store = withFullCards(storeOf("bundles/bundle_shared_parent"));
    const inspector = drawer(store, true);
    const block = store.view.blocks[A];
    if (block === undefined) throw new Error("no block A");
    const line = [...lineAxes(drawingOf(block, store.view.graphical, fontMetrics))].find(
      ([, axis]) => axis.timeline === "score" && axis.ancestor?.group === "group_2",
    )?.[0];
    if (line === undefined) throw new Error("no line of score in group_2's ancestor card");
    inspector.pinTimestamp(readOn(store, "score", q(9), line, false, null), line);
    const exposition = [
      "Exposition",
      [row("cmap_2", "4320", "ticks"), row("coordinate", "9", "♩")],
    ];
    const second = ["Second theme", [row("cmap_3", "1.5", "s"), row("coordinate", "3", "♩")]];
    const onCard = [
      exposition,
      second,
      ["Score", [row("cmap_1", "4320", "ticks"), row("coordinate", "9", "♩")]],
    ];
    expect(groups()).toEqual(onCard);
    type(nameField(), "Nine");
    press(nameField(), "Enter");
    const id = inspector.shownPin()?.named?.id;
    expect([id === undefined, groups()]).toEqual([false, onCard]);
    inspector.selected([{ block: A, id: id ?? "" }]);
    expect(groups()).toEqual(onCard);
    inspector.selected([{ block: A }]);
    inspector.selected([{ block: A, id: id ?? "" }]);
    expect(groups()).toEqual([exposition, second, ["Score", [row("coordinate", "9", "♩")]]]);
  });

  it("is read again as a fresh reading when an editor raises or lowers its card, and kept as read in between", () => {
    const store = storeOf("groups/group_parent_both");
    const inspector = drawer(store, true);
    const line = lineIn(store, "middle", "middle");
    const pin = readOn(store, "middle", q(4), line, true, null);
    inspector.pinTimestamp(pin, line);
    const piece = ["Piece", [row("coordinate", "8", "♩")]];
    const middle = ["Middle", [row("coordinate", "4", "♩")]];
    const recording = ["Recording", [row("coordinate", "5.0", "s")]];
    expect([groups(), inspector.shownPin()]).toEqual([[middle, piece, recording], pin]);
    expect(store.open({ block: A, id: "piece" })).toBeNull();
    flushSync();
    const raised = inspector.shownPin();
    expect([groups(), raised?.named, raised === pin, groupstampToggle()]).toEqual([
      [middle, piece],
      null,
      false,
      "false",
    ]);
    const again = () =>
      heldPinOf(store.view, pin, fontMetrics, store.editing.at(-1) ?? null, {
        line,
        raised: null,
      });
    expect(again()).toBe(again());
    store.done();
    flushSync();
    expect([groups(), inspector.shownPin()]).toEqual([[middle, piece, recording], pin]);
    expect(inspector.shownPin()).toBe(pin);
  });

  it("read with its group is read again without it inside the member's own timeline editor, as a fresh reading there is", () => {
    const store = storeOf("groups/group_parent_both");
    const inspector = drawer(store, true);
    const line = lineIn(store, "middle", "middle");
    const pin = readOn(store, "middle", q(4), line, true, null);
    inspector.pinTimestamp(pin, line);
    const piece = ["Piece", [row("coordinate", "8", "♩")]];
    const middle = ["Middle", [row("coordinate", "4", "♩")]];
    const recording = ["Recording", [row("coordinate", "5.0", "s")]];
    expect([groups(), inspector.shownPin(), groupstampToggle()]).toEqual([
      [middle, piece, recording],
      pin,
      "true",
    ]);
    expect(store.open({ block: A, id: "middle" })).toBeNull();
    flushSync();
    expect([groups(), inspector.shownPin(), groupstampToggle()]).toEqual([
      [middle, piece],
      readOn(store, "middle", q(4), line, false, null),
      "false",
    ]);
    store.done();
    flushSync();
    expect([groups(), inspector.shownPin() === pin, groupstampToggle()]).toEqual([
      [middle, piece, recording],
      true,
      "true",
    ]);
  });

  it("read under a raised card is read again with the group once the card is lowered", () => {
    const store = storeOf("groups/group_parent_both");
    expect(store.open({ block: A, id: "piece" })).toBeNull();
    flushSync();
    const inspector = drawer(store, true);
    const block = store.view.blocks[A];
    if (block === undefined) throw new Error("no block A");
    const cardRow = [...lineAxes(drawingOf(block, store.view.graphical, fontMetrics))].find(
      ([, axis]) => axis.timeline === "middle" && axis.ancestor !== undefined,
    )?.[0];
    if (cardRow === undefined) throw new Error("no row of middle in piece's card");
    const pin = readOn(store, "middle", q(4), cardRow, false, "piece");
    inspector.pinTimestamp(pin, cardRow);
    const piece = ["Piece", [row("coordinate", "8", "♩")]];
    const middle = ["Middle", [row("coordinate", "4", "♩")]];
    const recording = ["Recording", [row("coordinate", "5.0", "s")]];
    expect([groups(), inspector.shownPin(), groupstampToggle()]).toEqual([
      [middle, piece],
      pin,
      "false",
    ]);
    store.done();
    flushSync();
    expect([groups(), inspector.shownPin() === pin, groupstampToggle()]).toEqual([
      [middle, piece, recording],
      false,
      "true",
    ]);
  });
});

describe("coordinates, Editor", () => {
  it("group the rows by timeline, every number exact with its unit", () => {
    const store = mixed();
    const inspector = drawer(store, true);
    inspector.pinTimestamp(unnamed(store));
    expect(groups()).toEqual([
      [
        "Score",
        // Both maps are drawn above `score`'s line, the first nearest it.
        [row("cmap_2", "1.6", "s"), row("cmap_1", "1536", "ticks"), row("coordinate", "16/5", "♩")],
      ],
      // Read with its group: 16/5 × 12.5/12 = 10/3 seconds, a float, and × 44100 samples.
      [
        "Performance",
        [row("cmap_3", "147000", "smp"), row("coordinate", "3.3333333333333335", "s")],
      ],
    ]);
  });

  it("list every timeline a named timestamp crosses, children included", () => {
    const store = example();
    const inspector = drawer(store, true, T);
    inspector.selected([THEME]);
    // Top to bottom: `phrase`'s line lies above `score`'s, each one's maps above its line.
    expect(groups()).toEqual([
      ["Phrase", [row("Phrase ticks", "0", "ticks"), row("coordinate", "0", "♩")]],
      [
        "Score",
        [
          row("Ticks", "1920", "ticks"),
          row("Tempo", "2.0", "s"),
          row("Bars", "1", "𝅝"),
          row("coordinate", "4", "♩"),
        ],
      ],
    ]);
  });

  it("set the primary coordinate apart, the timestamp's own timeline's", () => {
    /** The groups and rows set apart, as their heading and their row's label. */
    const primary = () => [
      [...area("Coordinates").querySelectorAll("tbody[data-primary]")].map(
        (body) => body.querySelector('th[scope="colgroup"]')?.textContent,
      ),
      [...area("Coordinates").querySelectorAll("tr.primary")].map(
        (row) => row.querySelector('th[scope="row"]')?.textContent,
      ),
    ];
    const store = example();
    drawer(store, true, T).selected([THEME]);
    expect(primary()).toEqual([["Score"], ["coordinate"]]);
    if (app !== undefined) unmount(app);
    app = undefined;
    document.body.innerHTML = "";
    const grouped = mixed();
    drawer(grouped, true).pinTimestamp(unnamed(grouped));
    expect(primary()).toEqual([["Score"], ["coordinate"]]);
  });

  it("say why a map has no value, give one row per named output, and keep what no map solves read-only", () => {
    const store = mixed();
    const inspector = drawer(store, true);
    inspector.pinTimestamp(others(store));
    // Top to bottom as the maps' slots lie above the line: keyed `bars` (no name), Tempo, Both.
    expect(groups()).toEqual([
      [
        "Annotations",
        [
          ["bars", "needs a server to expand its measure map", null, null, null],
          ["Tempo", "no value here", null, null, null],
          ["Both · seconds", "6.0", null, true, READ_ONLY],
          ["Both · ticks", "5760", null, true, READ_ONLY],
          row("coordinate", "12", "♩"),
        ],
      ],
    ]);
    const field = valueField("Both · seconds of Annotations");
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

  it("writes the value, its raw and its pretty text, and posts each as information", async () => {
    const written = clipboard();
    const store = example();
    const inspector = drawer(store, true, T);
    inspector.selected([THEME]);
    expect([...panel().querySelectorAll("thead th.copy")].map((cell) => cell.textContent)).toEqual([
      "value",
      "value + unit",
      "pretty",
    ]);
    expect(
      copies("Tempo").map((button) => [button.getAttribute("aria-label"), button.title]),
    ).toEqual([
      ["Copy the value of Tempo of Score", "Copy the value"],
      [
        "Copy the value with its unit written out of Tempo of Score",
        "Copy the value with its unit written out",
      ],
      ["Copy the value with symbols of Tempo of Score", "Copy the value with symbols"],
    ]);
    for (const button of copies("Tempo")) button.click();
    await vi.waitFor(() => expect(informed).toHaveLength(3));
    expect([written, informed]).toEqual([
      [copyValue(2, "float"), rawText(2, "float", "seconds"), prettyText(2, "float", "seconds")],
      ["Copied 2.0.", "Copied 2.0 seconds.", "Copied 2″."],
    ]);
    expect(written).toEqual(["2.0", "2.0 seconds", "2″"]);
  });

  it("shows only the Copies that write a text of their own, keeping the cells, and none for a missing value", async () => {
    const written = clipboard();
    const store = mixed();
    const inspector = drawer(store, true);
    inspector.pinTimestamp(others(store));
    expect(
      ["Tempo", "Both · seconds", "Both · ticks"].map((label) =>
        copies(label).map((button) => button.getAttribute("aria-label")),
      ),
    ).toEqual([
      [],
      ["Copy the value of Both · seconds of Annotations"],
      ["Copy the value of Both · ticks of Annotations"],
    ]);
    const cells = [...panel().querySelectorAll("tr[data-row]")].map(
      (item) => item.querySelectorAll("td.copy").length,
    );
    expect(cells).toEqual([3, 3, 3, 3, 3]);
    for (const label of ["Both · seconds", "Both · ticks"]) {
      for (const button of copies(label)) button.click();
    }
    await vi.waitFor(() => expect(informed).toHaveLength(2));
    expect(written).toEqual(["6.0", "5760"]);
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
    expect(group("Manifest format")).toEqual([["YAML", "JSON", "TOML"], "YAML"]);
    inspector.selected([THEME]);
    expect(group("Timestamp format")).toEqual([["Editor", "YAML", "JSON", "TOML"], "Editor"]);
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
    expect(text()).toBe(dumps(value, { serialization: "json" }));
    if (!isLoaded("yaml")) {
      choose("yaml");
      expect(area("Coordinates").querySelector('p.status[role="status"]')?.textContent).toBe(
        "Loading YAML…",
      );
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

  it("leaves a map without a value out of the TOML, where JSON writes its null", async () => {
    const store = storeOf("conversion_maps__maps_whole_notes");
    const inspector = drawer(store, true);
    inspector.selected([{ block: A, id: "timestamp_1" }]);
    choose("json");
    expect(text()).toBe(
      [
        "{",
        '  "coordinate": [0, 1],',
        '  "display": ["wedge", "coordinate"],',
        '  "groupstamp": false,',
        '  "id": "timestamp_1",',
        '  "mapping": {',
        '    "cmap_1": null',
        "  },",
        '  "matchstamp": false,',
        '  "name": "origin",',
        '  "timeline": "maps:whole_notes"',
        "}",
        "",
      ].join("\n"),
    );
    await loadCodec("toml");
    choose("toml");
    expect([text(), panel().querySelector(".text-problem")]).toEqual([
      [
        "coordinate = [ 0, 1 ]",
        'display = [ "wedge", "coordinate" ]',
        "groupstamp = false",
        'id = "timestamp_1"',
        "matchstamp = false",
        'name = "origin"',
        'timeline = "maps:whole_notes"',
        "",
        "[mapping]",
        "",
      ].join("\n"),
      null,
    ]);
  });

  it("writes a timestamp whose every map has a value as TOML as before", async () => {
    const store = example();
    const inspector = drawer(store, true, T);
    inspector.selected([THEME]);
    await loadCodec("toml");
    choose("toml");
    expect(text()).toBe(
      [
        "coordinate = [ 4, 1 ]",
        'display = [ "wedge", "name", "cross_section" ]',
        "groupstamp = false",
        'id = "timestamp_5"',
        "matchstamp = false",
        'name = "Theme"',
        'timeline = "score"',
        "",
        "[mapping]",
        "",
        "[mapping.bars]",
        'unit = "whole_notes"',
        'number_type = "fraction"',
        "value = [ 1, 1 ]",
        "",
        "[mapping.tempo]",
        'unit = "seconds"',
        'number_type = "float"',
        "value = 2.0",
        "",
        "[mapping.ticks]",
        'unit = "ticks"',
        'number_type = "int"',
        "value = 1920",
        "",
        "[mapping.phrase]",
        'unit = "quarters"',
        'number_type = "fraction"',
        "value = [ 0, 1 ]",
        "",
        "[mapping.phrase_ticks]",
        'unit = "ticks"',
        'number_type = "int"',
        "value = 0",
        "",
      ].join("\n"),
    );
  });
});

describe("the inspector's top", () => {
  it("keeps the editing bar and the tab list out of the panels' scroll container, the name header first", () => {
    const store = mixed();
    expect(store.open({ block: A })).toBeNull();
    const inspector = drawer(store, true);
    click("Timestamp");
    inspector.pinTimestamp(unnamed(store));
    const scroller = panel().parentElement;
    const outside = (selector: string) => {
      const found = document.querySelector(selector);
      return found !== null && scroller?.contains(found) === false;
    };
    expect([
      scroller?.classList.contains("panels"),
      outside('[role="tablist"]'),
      outside('[role="group"][aria-label="Editing"]'),
      panel().querySelector("section")?.getAttribute("data-testid"),
      nameHeader()?.querySelector("label")?.textContent,
    ]).toEqual([true, true, true, "timestamp-name", "Name"]);
  });
});

describe("properties", () => {
  const ALL = ["Wedge", "Name", "ID", "Coordinate", "Line"];
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
      nameField().placeholder,
      described(nameField()),
      toggles(),
      deleteButton()?.disabled,
      described(deleteButton() as Element),
      area?.classList.contains("unnamed"),
    ]).toEqual([
      "",
      false,
      "Type a name to keep it",
      UNNAMED,
      pressed(["Wedge", "Name", "Line"], true),
      true,
      UNNAMED,
      true,
    ]);
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
      timestamp: { name: "Upbeat", coordinate: [16, 5], groupstamp: true },
    });
    expect([
      nameField().value,
      nameField().hasAttribute("placeholder"),
      toggles(),
      deleteButton()?.disabled,
      inspector.shownPin()?.named?.id,
      properties()?.classList.contains("unnamed"),
    ]).toEqual(["Upbeat", false, pressed(["Wedge", "Name", "Line"]), false, "timestamp_11", false]);
  });

  it("renames a named timestamp, keeps a name and journals nothing for an unchanged one", () => {
    const store = example();
    const inspector = drawer(store, true, T);
    inspector.selected([THEME]);
    expect([nameField().value, nameField().hasAttribute("placeholder")]).toEqual(["Theme", false]);
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
      pressed(["Wedge", "Name", "Line"]),
      pressed(ALL),
      pressed([]),
    ]);
    expect(
      [...area("Properties").querySelectorAll(DISPLAY_TOGGLES)].map(
        (button) => (button as HTMLButtonElement).type,
      ),
    ).toEqual(ALL.map(() => "button"));
  });

  it.each([
    [THEME, "ID", ["wedge", "name", "id", "cross_section"]],
    [THEME, "Wedge", ["name", "cross_section"]],
    [SILENT, "Coordinate", ["coordinate"]],
    [CLIMAX, "Line", ["wedge", "name", "id", "coordinate"]],
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

describe("GroupStamp", () => {
  const CROSSES = "A GroupStamp's line crosses every member of 'Performance'.";
  const field = () => panel().querySelector<HTMLElement>('[data-testid="timestamp-groupstamp"]');
  /** Press the GroupStamp toggle. */
  function pressGroupstamp(): void {
    const button = field()?.querySelector<HTMLButtonElement>("button");
    if (button === undefined || button === null) throw new Error("no GroupStamp toggle");
    button.click();
    flushSync();
  }
  /** What describes the GroupStamp toggle's group. */
  const describedGroup = () => described(field()?.querySelector('[role="group"]') as Element);
  /** The GroupStamp toggle as [label, pressed, disabled]; `null` where none is offered. */
  function groupstamp(): unknown[] | null {
    const button = field()?.querySelector<HTMLButtonElement>("button");
    return button === undefined || button === null
      ? null
      : [button.textContent, button.getAttribute("aria-pressed"), button.disabled];
  }

  it("is pressed on an unnamed member's timestamp, waits for its name, then sets it", () => {
    const store = mixed();
    drawer(store, true).pinTimestamp(unnamed(store));
    const button = field()?.querySelector("button") as HTMLButtonElement;
    expect([groupstamp(), describedGroup()]).toEqual([
      ["GroupStamp", "true", true],
      `${CROSSES} ${UNNAMED}`,
    ]);
    const entries = store.journal.length;
    button.click();
    flushSync();
    expect(store.journal.length).toBe(entries);

    type(nameField(), "Upbeat");
    press(nameField(), "Enter");
    const named: Address = { block: A, id: "timestamp_11" };
    expect([groupstamp(), describedGroup()]).toEqual([["GroupStamp", "true", false], CROSSES]);
    pressGroupstamp();
    expect(lastCommand(store)).toEqual({
      type: "set",
      changes: [{ target: named, values: { groupstamp: false } }],
    });
    expect(groupstamp()).toEqual(["GroupStamp", "false", false]);
    pressGroupstamp();
    expect(lastCommand(store)).toEqual({
      type: "set",
      changes: [{ target: named, values: { groupstamp: true } }],
    });
  });

  it("is off in a timeline editor, where naming stores an ordinary timestamp", () => {
    const store = mixed();
    expect(store.open({ block: A, id: "score" })).toBe(null);
    drawer(store, true).pinTimestamp(unnamed(store));
    expect(groupstamp()).toEqual(["GroupStamp", "false", true]);
    type(nameField(), "Upbeat");
    press(nameField(), "Enter");
    // The editor's session holds the entry.
    const entry = store.entries.at(-1);
    expect(entry !== undefined && "command" in entry ? entry.command : undefined).toEqual({
      type: "add",
      into: { block: A, id: "score" },
      timestamp: { name: "Upbeat", coordinate: [16, 5] },
    });
  });

  it("names the group of a member's descendant", () => {
    const store = mixed();
    const added = [
      {
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
      },
      {
        type: "add",
        into: { block: A, id: "second-half" },
        timestamp: { name: "Bar 4", coordinate: [2, 1] },
      },
    ] as const;
    for (const command of added) expect(store.dispatch(command)).toBe(null);
    const barFour = store.view.blocks[A]?.manifest.graphical?.timestamps?.find(
      (item) => item.name === "Bar 4",
    );
    if (barFour === undefined) throw new Error("Bar 4 is stored");
    drawer(store, true).selected([{ block: A, id: barFour.id }]);
    expect([groupstamp(), describedGroup()]).toEqual([["GroupStamp", "false", false], CROSSES]);
  });

  it("is not offered on a timeline in no group", () => {
    const store = example();
    drawer(store, true, T).selected([THEME]);
    expect([nameField().value, groupstamp()]).toEqual(["Theme", null]);
  });
});

describe("the wedge's rotation", () => {
  const WEDGE_OFF = "Turn the Wedge on to rotate it.";
  const STOPS = ["\u2212180", "\u2212135", "\u221245", "0", "45", "135", "180"];
  const field = () => find<HTMLElement>('[data-testid="timestamp-rotation"]');
  const slider = () => find<HTMLInputElement>('input[type="range"]', field());
  const stopButtons = () => [...field().querySelectorAll<HTMLButtonElement>(".stops button")];
  const defaultButton = () =>
    [...field().querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === "Default",
    );
  /** The control as [value, value text, shown text, stops pressed, Default (`null`: none, else disabled), disabled]. */
  function rotation(): unknown[] {
    const reset = defaultButton();
    return [
      slider().value,
      slider().getAttribute("aria-valuetext"),
      field().querySelector("output")?.textContent,
      stopButtons()
        .filter((button) => button.getAttribute("aria-pressed") === "true")
        .map((button) => button.textContent),
      reset === undefined ? null : reset.disabled,
      slider().disabled,
    ];
  }
  function stop(label: string): void {
    const button = stopButtons().find((item) => item.textContent === label);
    if (button === undefined) throw new Error(`no stop ${label}`);
    button.click();
    flushSync();
  }
  function reset(): void {
    defaultButton()?.click();
    flushSync();
  }
  /** The `style` turning the wedge of `address` by `value` degrees. */
  const turned = (address: Address, value: number | null) => ({
    type: "style",
    select: { element: "wedge", addresses: [{ id: address.id }] },
    set: { rotation: value },
    blocks: [address.block],
  });
  const rules = (store: Store, block: string) =>
    store.view.blocks[block]?.manifest.graphical?.rules;

  it("is a slider with seven stops, its name, its value as text and the stops as buttons", () => {
    const store = example();
    drawer(store, true, T).selected([THEME]);
    const label = (slider().getAttribute("aria-labelledby") ?? "")
      .split(" ")
      .map((id) => document.getElementById(id)?.textContent)
      .join(" ");
    expect([
      slider().min,
      slider().max,
      slider().step,
      label,
      [...field().querySelectorAll("datalist option")].map((option) =>
        option.getAttribute("value"),
      ),
      stopButtons().map((button) => [button.textContent, button.getAttribute("aria-label")]),
      rotation(),
    ]).toEqual([
      "-180",
      "180",
      "1",
      "Wedge rotation",
      ["-180", "-135", "-45", "0", "45", "135", "180"],
      STOPS.map((text) => [text, `${text} degrees`]),
      ["0", "0 degrees", "0°", ["0"], null, false],
    ]);
  });

  it("sends one style of the wedge's own rule for a stop, PageUp, PageDown and a drag, and Default removes it", () => {
    const store = example();
    drawer(store, true, T).selected([THEME]);
    const before = rules(store, T);
    stop("\u2212135");
    expect([lastCommand(store), rotation()]).toEqual([
      turned(THEME, -135),
      ["-135", "\u2212135 degrees", "\u2212135°", ["\u2212135"], false, false],
    ]);
    press(slider(), "PageUp");
    expect([lastCommand(store), rotation()[0]]).toEqual([turned(THEME, -45), "-45"]);
    press(slider(), "PageDown");
    expect([lastCommand(store), rotation()[0]]).toEqual([turned(THEME, -135), "-135"]);

    const entries = store.journal.length;
    slider().value = "42";
    slider().dispatchEvent(new Event("input", { bubbles: true }));
    flushSync();
    expect([store.journal.length, rotation()]).toEqual([
      entries,
      ["42", "42 degrees", "42°", [], false, false],
    ]);
    slider().dispatchEvent(new Event("change", { bubbles: true }));
    flushSync();
    expect([store.journal.length, lastCommand(store), rotation()[0]]).toEqual([
      entries + 1,
      turned(THEME, 42),
      "42",
    ]);

    stop("180");
    const atEnd = store.journal.length;
    press(slider(), "PageUp");
    expect(store.journal.length).toBe(atEnd);

    reset();
    expect([lastCommand(store), rules(store, T), rotation()]).toEqual([
      turned(THEME, null),
      before,
      ["0", "0 degrees", "0°", ["0"], null, false],
    ]);
  });

  describe("a drag shown live", () => {
    /** A press on the slider, as a pointer starts a drag. */
    function pressSlider(): void {
      slider().dispatchEvent(new Event("pointerdown", { bubbles: true }));
      flushSync();
    }
    /** The slider dragged to `value`. */
    function dragTo(value: number): void {
      slider().value = String(value);
      slider().dispatchEvent(new Event("input", { bubbles: true }));
      flushSync();
    }
    /** The slider's `change`. */
    function changed(): void {
      slider().dispatchEvent(new Event("change", { bubbles: true }));
      flushSync();
    }
    /** The pointer released (`pointerup`) or cancelled (`pointercancel`), heard on the window. */
    function ended(type: "pointerup" | "pointercancel"): void {
      window.dispatchEvent(new Event(type));
      flushSync();
    }
    /** The transient command showing Theme's wedge turned by `value`. */
    const shownAt = (value: number) => ({ block: T, command: turned(THEME, value) });

    it("hands every step to the canvas and journals one entry per drag", () => {
      const store = example();
      drawer(store, true, T).selected([THEME]);
      const entries = store.journal.length;

      pressSlider();
      dragTo(30);
      dragTo(31);
      dragTo(31);
      expect([handed, store.journal.length, rotation()[2]]).toEqual([
        [shownAt(30), shownAt(31)],
        entries,
        "31°",
      ]);
      dragTo(0);
      dragTo(42);
      expect([handed.slice(2), store.journal.length]).toEqual([[null, shownAt(42)], entries]);
      changed();
      expect([handed.slice(4), store.journal.length, lastCommand(store)]).toEqual([
        [null],
        entries + 1,
        turned(THEME, 42),
      ]);
      ended("pointerup");
      expect([handed.length, store.journal.length]).toEqual([5, entries + 1]);

      pressSlider();
      dragTo(50);
      ended("pointerup");
      expect([handed.slice(5), store.journal.length, lastCommand(store), rotation()[0]]).toEqual([
        [shownAt(50), null],
        entries + 2,
        turned(THEME, 50),
        "50",
      ]);
      // Firefox ends a native drag on the release: the value at the pointer, `input`, `change`.
      dragTo(55);
      changed();
      expect([handed.length, store.journal.length, slider().value, rotation()[2]]).toEqual([
        7,
        entries + 2,
        "50",
        "50°",
      ]);
    });

    it("takes input again once the release's own events have passed", () => {
      vi.useFakeTimers();
      try {
        const store = example();
        drawer(store, true, T).selected([THEME]);
        const entries = store.journal.length;
        pressSlider();
        dragTo(60);
        ended("pointerup");
        expect([handed, store.journal.length, lastCommand(store)]).toEqual([
          [shownAt(60), null],
          entries + 1,
          turned(THEME, 60),
        ]);
        // The next task: no key and no press has ended the drag before.
        vi.runOnlyPendingTimers();
        dragTo(70);
        expect([handed.slice(2), rotation()[2]]).toEqual([[shownAt(70)], "70°"]);
        changed();
        expect([handed.slice(3), store.journal.length, lastCommand(store)]).toEqual([
          [null],
          entries + 2,
          turned(THEME, 70),
        ]);
      } finally {
        vi.useRealTimers();
      }
    });

    it("shows the stored value again on Escape and moves nothing more in that drag", () => {
      const store = example();
      drawer(store, true, T).selected([THEME]);
      stop("45");
      const entries = store.journal.length;

      pressSlider();
      dragTo(60);
      const escaped = new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      });
      slider().dispatchEvent(escaped);
      flushSync();
      expect([handed, escaped.defaultPrevented, slider().value, rotation()[2]]).toEqual([
        [shownAt(60), null],
        true,
        "45",
        "45°",
      ]);
      dragTo(70);
      expect([handed.length, slider().value, rotation()[2]]).toEqual([2, "45", "45°"]);
      ended("pointerup");
      changed();
      expect([handed.length, store.journal.length, rotation()[0]]).toEqual([2, entries, "45"]);
      // Firefox ends a native drag on the release: the value at the pointer, `input`, `change`.
      dragTo(75);
      changed();
      expect([handed.length, store.journal.length, slider().value, rotation()[2]]).toEqual([
        2,
        entries,
        "45",
        "45°",
      ]);
      press(slider(), "PageUp");
      expect([store.journal.length, lastCommand(store), rotation()[0]]).toEqual([
        entries + 1,
        turned(THEME, 135),
        "135",
      ]);
      pressSlider();
      dragTo(100);
      ended("pointerup");
      expect([handed.slice(2), store.journal.length, lastCommand(store)]).toEqual([
        [shownAt(100), null],
        entries + 2,
        turned(THEME, 100),
      ]);

      const idle = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
      slider().dispatchEvent(idle);
      expect([idle.defaultPrevented, handed.length]).toEqual([false, 4]);
    });

    it("shows the stored value again when the pointer is cancelled", () => {
      const store = example();
      drawer(store, true, T).selected([THEME]);
      stop("45");
      const entries = store.journal.length;

      pressSlider();
      dragTo(80);
      ended("pointercancel");
      expect([handed, slider().value, rotation()[2]]).toEqual([[shownAt(80), null], "45", "45°"]);
      dragTo(85);
      changed();
      expect([handed.length, store.journal.length, slider().value]).toEqual([2, entries, "45"]);
    });

    it("withdraws what it showed when removed mid-drag", () => {
      const store = example();
      drawer(store, true, T).selected([THEME]);
      pressSlider();
      dragTo(90);
      if (app !== undefined) unmount(app);
      app = undefined;
      expect(handed).toEqual([shownAt(90), null]);
    });
  });

  it("shows the rotation a rule by another selector draws, without Default", () => {
    const store = example();
    drawer(store, true, T).selected([THEME]);
    expect(
      store.dispatch({
        type: "style",
        select: { element: "wedge", within: "score" },
        set: { rotation: 90 },
        blocks: [T],
      }),
    ).toBe(null);
    flushSync();
    expect(rotation()).toEqual(["90", "90 degrees", "90°", [], null, false]);
  });

  it("waits while the wedge is not displayed, keeping its value", () => {
    const store = example();
    const inspector = drawer(store, true, T);
    inspector.selected([SILENT]);
    expect([rotation(), described(slider())]).toEqual([
      ["0", "0 degrees", "0°", ["0"], null, true],
      WEDGE_OFF,
    ]);
    expect(stopButtons().map((button) => button.disabled)).toEqual(STOPS.map(() => true));

    inspector.selected([THEME]);
    stop("45");
    toggle("Wedge");
    expect([rotation(), described(slider())]).toEqual([
      ["45", "45 degrees", "45°", ["45"], true, true],
      WEDGE_OFF,
    ]);
  });

  it("shows its value muted beside a disabled slider, never faded, the controls greyed", () => {
    const style = addStylesOf("inspector/stamps/WedgeRotation.svelte");
    try {
      /** The value shown and the slider as [color, fadings applying] each. */
      const looks = () => {
        const shown = find<HTMLElement>("output", field());
        return [
          [getComputedStyle(shown).color, fadingsOf(shown)],
          [getComputedStyle(slider()).color, fadingsOf(slider())],
        ];
      };
      const store = example();
      const inspector = drawer(store, true, T);
      inspector.selected([SILENT]);
      expect([slider().disabled, looks()]).toEqual([
        true,
        [
          ["rgb(89, 89, 89)", []],
          ["rgb(0, 0, 0)", ["0.5"]],
        ],
      ]);
      inspector.selected([THEME]);
      // The value's own colour, inherited: jsdom's black, no page stylesheet being loaded.
      expect([slider().disabled, looks()]).toEqual([
        false,
        [
          ["rgb(0, 0, 0)", []],
          ["rgb(0, 0, 0)", []],
        ],
      ]);
    } finally {
      style.remove();
    }
  });

  it("shows a groupstamp's initial value 0, unnamed and named, then a stated value until Default", () => {
    const store = mixed();
    drawer(store, true).pinTimestamp(unnamed(store));
    expect([rotation(), described(slider())]).toEqual([
      ["0", "0 degrees", "0°", ["0"], null, true],
      UNNAMED,
    ]);

    type(nameField(), "Upbeat");
    press(nameField(), "Enter");
    const upbeat: Address = { block: A, id: "timestamp_11" };
    expect([rotation(), described(slider())]).toEqual([
      ["0", "0 degrees", "0°", ["0"], null, false],
      "",
    ]);
    stop("45");
    expect([lastCommand(store), rotation()]).toEqual([
      turned(upbeat, 45),
      ["45", "45 degrees", "45°", ["45"], false, false],
    ]);
    reset();
    expect([lastCommand(store), rotation()]).toEqual([
      turned(upbeat, null),
      ["0", "0 degrees", "0°", ["0"], null, false],
    ]);
  });

  it("turns a wedge in the timeline editor of its timeline", () => {
    const store = example();
    expect(store.open({ block: T, id: "score" })).toBe(null);
    drawer(store, true, T).selected([THEME]);
    stop("45");
    const entry = store.entries.at(-1);
    expect([
      entry !== undefined && "command" in entry ? entry.command : undefined,
      rotation()[0],
    ]).toEqual([turned(THEME, 45), "45"]);
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
    const block = store.view.blocks[A];
    if (block === undefined) throw new Error("no block A");
    const unnamed = timelinePin(
      block.manifest,
      A,
      drawingOf(block, store.view.graphical, fontMetrics),
      "score",
      q(6),
      store.view.settings.granularity,
      ROWS,
      true,
      null,
      null,
    );
    inspector.pinTimestamp(unnamed);
    // 6 quarters are 6 × 7680/16 = 2880 ticks of `midi`, read with its group, in measure "2".
    expect([groups(), measureRow()]).toEqual([
      [...rows, ["MIDI", [["cmap_3", "2", null, null, null], row("coordinate", "2880", "ticks")]]],
      "2",
    ]);
  });

  it("are given to the Matchstamp tab, whose conversion-map rows read them", () => {
    const { store } = measureStore();
    expect(
      store.dispatch({
        type: "add",
        into: { block: A },
        matchstamp: {
          name: "Bar two",
          anchors: [
            [
              { timeline: "score", coordinate: [6, 1] },
              { timeline: "midi", coordinate: 2880 },
            ],
          ],
          match_claims: ["claim_1"],
        },
      }),
    ).toBe(null);
    const BAR_TWO: Address = { block: A, id: "matchstamp_1" };
    /** The texts of the Matchstamp tab's rows `cmap_1` and `cmap_3`. */
    const mapRows = () => {
      const id = tabNamed("Matchstamp").getAttribute("aria-controls");
      const shown = id === null ? null : document.getElementById(id);
      return ["cmap_1", "cmap_3"].map(
        (label) =>
          [...(shown?.querySelectorAll("tr[data-row]") ?? [])]
            .find((item) => item.querySelector('th[scope="row"]')?.textContent === label)
            ?.querySelector(".text")?.textContent ?? null,
      );
    };
    const known = new SvelteMap<Manifest, readonly MeasureKnots[]>();
    const inspector = drawer(store, true, A, (manifest) => known.get(manifest) ?? "pending");
    inspector.selected([BAR_TWO]);
    expect([selected(), mapRows()]).toEqual([
      "Matchstamp",
      ["waiting for the server", "waiting for the server"],
    ]);
    const manifest = store.view.blocks[A]?.manifest;
    if (manifest === undefined) throw new Error("the block is in the store");
    known.set(manifest, ROWS);
    flushSync();
    expect(mapRows()).toEqual(["2", "2"]);
    if (app !== undefined) unmount(app);
    app = undefined;

    drawer(store, true).selected([BAR_TWO]);
    const NO_SERVER = "needs a server to expand its measure map";
    expect(mapRows()).toEqual([NO_SERVER, NO_SERVER]);
  });

  it("leave a measure's null members out of the TOML, where JSON and YAML write them", async () => {
    const { store, barTwo } = measureStore();
    const unnumbered = { ...measure("2", 4), number: null, nominal_length: null };
    const rows: MeasureKnots[] = [
      {
        id: "measuremap_1",
        rows: [measure("1", 0), unnumbered, measure("3", 8), measure("4", 12)],
      },
    ];
    const pin = named(store, barTwo, rows);
    await loadCodec("yaml");
    await loadCodec("toml");
    const [json, yaml, toml] = (["json", "yaml", "toml"] as const).map((format) => {
      const written = timestampText(format, pin);
      if (!written.ok) throw new Error(`no ${format} text`);
      return written.value.text;
    });
    expect(json).toBe(
      [
        "{",
        '  "coordinate": [6, 1],',
        '  "display": ["wedge", "name", "cross_section"],',
        '  "groupstamp": false,',
        '  "id": "timestamp_5",',
        '  "mapping": {',
        '    "cmap_1": {',
        '      "ID": "2",',
        '      "actual_length": [4, 1],',
        '      "count": 2,',
        '      "name": "2",',
        '      "nominal_length": null,',
        '      "number": null,',
        '      "offset_within_measure": [0, 1],',
        '      "qstamp": [4, 1]',
        "    }",
        "  },",
        '  "matchstamp": false,',
        '  "name": "Bar two",',
        '  "timeline": "score"',
        "}",
        "",
      ].join("\n"),
    );
    expect(yaml).toBe(
      [
        "coordinate: [6, 1]",
        "display: [wedge, name, cross_section]",
        "groupstamp: false",
        "id: timestamp_5",
        "mapping:",
        "  cmap_1:",
        '    ID: "2"',
        "    actual_length: [4, 1]",
        "    count: 2",
        '    name: "2"',
        "    nominal_length: null",
        "    number: null",
        "    offset_within_measure: [0, 1]",
        "    qstamp: [4, 1]",
        "matchstamp: false",
        'name: "Bar two"',
        "timeline: score",
        "",
      ].join("\n"),
    );
    expect(toml).toBe(
      [
        'id = "timestamp_5"',
        'timeline = "score"',
        "coordinate = [ 6, 1 ]",
        'name = "Bar two"',
        'display = [ "wedge", "name", "cross_section" ]',
        "matchstamp = false",
        "groupstamp = false",
        "",
        "[mapping]",
        "",
        "[mapping.cmap_1]",
        'ID = "2"',
        'name = "2"',
        "count = 2",
        "qstamp = [ 4, 1 ]",
        "actual_length = [ 4, 1 ]",
        "offset_within_measure = [ 0, 1 ]",
        "",
      ].join("\n"),
    );
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

  it("passes the rows on, tells a server that cannot expand them and one that does not answer, and keeps every other failure", async () => {
    const answer = (result: () => Promise<typeof rows>) =>
      measureMapsOf({ measureMaps: () => result() })("{}");
    expect(await answer(() => Promise.resolve(rows))).toBe(rows);
    expect(
      await answer(() => Promise.reject(new ServerError("status", 501, "501 Not Implemented"))),
    ).toBe("unsupported");
    for (const unanswered of [
      new ServerError("unreachable", null, "connection refused"),
      new ServerError("status", 502, "502 Bad Gateway"),
      new ServerError("status", 504, "504 Gateway Timeout"),
    ]) {
      expect(await answer(() => Promise.reject(unanswered))).toBe("unreachable");
    }
    for (const failed of [
      new ServerError("status", 500, "500 Internal Server Error"),
      new ServerError("status", 422, "422 Unprocessable Content"),
      new Error("not a server error"),
    ]) {
      await expect(answer(() => Promise.reject(failed))).rejects.toBe(failed);
    }
  });
});
