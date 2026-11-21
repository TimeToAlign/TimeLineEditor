// @vitest-environment jsdom
/**
 * Show matches on the canvas: the mode and its key, the message without a
 * table, the overlay of potential MatchStamps, the hovered one with its flag,
 * what a click pins, the pinned one by belief, the named MatchStamps painted
 * by belief or as out of date, how a named MatchStamp takes the pointer in
 * either mode and what a click on a match timestamp's line selects. Derived
 * in `README.md`
 * ("Show matches on the canvas").
 */

import type { Address, Store, View } from "@timetoalign/tilie-core";
import { idAddress, inBlock } from "@timetoalign/tilie-core";
import { TextMeasure } from "@timetoalign/tilie-layout";
import { attributeText } from "@timetoalign/tilie-writers";
import { mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { descriptorsOf, drawingOf } from "../src/drawing.ts";
import type { MatchOverlayInput, MatchStampPin } from "../src/matches.ts";
import { matchFlag, NO_MATCHES, pathOf, stampOverlay } from "../src/matches.ts";
import type { Selection } from "../src/selection.ts";
import { ownerOf } from "../src/selectionRules.ts";
import Harness from "./CanvasHarness.svelte";
import { settle, stubCanvasGlobals } from "./dom.ts";
import { BELIEVED, NAMED, NAMED_IN_D, T } from "./matchTables.ts";
import { A, B, blockIn, metrics, storeOf, viewOf } from "./support.ts";

// The canvas's calls of what a hover costs are counted; each still does what it does.
vi.mock("../src/matches.ts", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/matches.ts")>();
  return {
    ...original,
    matchFlag: vi.fn(original.matchFlag),
    pathOf: vi.fn(original.pathOf),
    stampOverlay: vi.fn(original.stampOverlay),
  };
});

interface Mounted {
  current(): { selection: Selection };
  showMatches(next: readonly MatchOverlayInput[]): void;
  pinMatchStamp(next: MatchStampPin | null): void;
  showAt(next: { x: number; y: number; zoom: number }): void;
}

/** Block A's node, at (40, 80): the lines' ordinates and the abscissas of `README.md`. */
const NODE = { x: 40, y: 80 };
const SCORE_Y = 43.20703125;
const AT_300 = 361.0927734375;
const WITH_T: readonly MatchOverlayInput[] = [{ block: A, index: T, named: NAMED }];
const WITH_BELIEFS: readonly MatchOverlayInput[] = [
  { block: A, index: T, named: NAMED, beliefs: BELIEVED },
];
/** Block B: the same manifest 250 below block A. */
const B_BELOW = 250;
const WITH_T_TWICE: readonly MatchOverlayInput[] = [
  ...WITH_T,
  { block: B, index: T, named: NAMED },
];

const MATCHES = "bundles/bundle_matchstamps";
const matchView = (twice: boolean): View =>
  twice
    ? viewOf(
        { id: A, fixture: MATCHES, x: 40, y: 80 },
        { id: B, fixture: MATCHES, x: 40, y: 80 + B_BELOW },
      )
    : viewOf({ id: A, fixture: MATCHES, x: 40, y: 80 });

let mounted: ReturnType<typeof mount> | undefined;
let harness: Mounted;
let store: Store;
let pins: (MatchStampPin | null)[];
let resize: ReturnType<typeof stubCanvasGlobals>["resize"];

beforeEach(() => {
  ({ resize } = stubCanvasGlobals());
  pins = [];
});

afterEach(() => {
  if (mounted !== undefined) unmount(mounted);
  mounted = undefined;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function show(
  matches: readonly MatchOverlayInput[],
  twice = false,
  matchesStatus?: string,
): Promise<void> {
  store = storeOf(matchView(twice));
  const instance = mount(Harness, {
    target: document.body,
    props: {
      store,
      metrics,
      matches,
      onmatchstamppin: (pin: MatchStampPin | null) => pins.push(pin),
      matchesStatus,
    },
  });
  mounted = instance;
  // `tsc` reads the harness through Svelte's generic module declaration, which leaves its exports untyped.
  harness = instance as unknown as Mounted;
  await settle();
  resize(arranger(), 1000, 600);
  harness.showAt({ x: 0, y: 0, zoom: 1 });
  await settle();
}

function arranger(): HTMLElement {
  const found = document.querySelector<HTMLElement>('[aria-label="Arranger"]');
  if (found === null) throw new Error("no arranger");
  return found;
}

function one(selector: string, root: ParentNode = document): Element {
  const found = root.querySelector(selector);
  if (found === null) throw new Error(`nothing matches ${selector}`);
  return found;
}

/** The client point of block A's drawing point `(x, y)` (jsdom puts the canvas at 0, 0). */
const client = (x: number, y: number) => ({ clientX: NODE.x + x, clientY: NODE.y + y });
/** The client point of block B's drawing point `(x, y)`. */
const clientB = (x: number, y: number) => client(x, y + B_BELOW);

function pointerOn(target: EventTarget, type: string, at: { clientX: number; clientY: number }) {
  target.dispatchEvent(
    new PointerEvent(type, {
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
      button: 0,
      buttons: 0,
      bubbles: true,
      cancelable: true,
      ...at,
    }),
  );
}

async function hoverAt(at: { clientX: number; clientY: number }): Promise<void> {
  pointerOn(arranger(), "pointermove", at);
  await new Promise((resolve) => requestAnimationFrame(resolve));
  await settle();
}

async function clickAt(at: { clientX: number; clientY: number }): Promise<void> {
  pointerOn(arranger(), "pointerdown", at);
  pointerOn(arranger(), "pointerup", at);
  await settle();
}

async function press(testid: string): Promise<void> {
  one(`[data-testid="${testid}"]`).dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await settle();
}

async function key(name: string): Promise<void> {
  arranger().dispatchEvent(
    new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }),
  );
  await settle();
}

const pressed = (testid: string) => one(`[data-testid="${testid}"]`).getAttribute("aria-pressed");

/** The overlay's path of `kind`, `null` where none is drawn. */
const path = (kind: string, block = A) =>
  document.querySelector(`[data-matches="${block}"] path[data-match="${kind}"]`);

/** The lines, then the connectors, of `README.md`'s MatchStamp 0, as the writers write them. */
const STAMP_0 = [
  "M361.0928 157.9648V157.9648",
  "M361.0928 43.207V43.207",
  "M261.0928 100.5859V100.5859",
  "M361.0928 100.5859V100.5859",
  "M361.0928 157.9648L261.0928 100.5859",
  "M361.0928 157.9648L361.0928 100.5859",
  "M361.0928 43.207L361.0928 100.5859",
].join("");

const STAMP_1 = [
  "M261.0928 43.207V43.207",
  "M161.0928 100.5859V100.5859",
  "M261.0928 43.207L161.0928 100.5859",
].join("");

describe("the mode", () => {
  it("is toggled by its button and by m, and takes turns with Show coordinates", async () => {
    await show(WITH_T);
    expect([pressed("matches"), pressed("coordinates")]).toEqual(["false", "false"]);
    await press("matches");
    expect([pressed("matches"), pressed("coordinates")]).toEqual(["true", "false"]);
    await press("coordinates");
    expect([pressed("matches"), pressed("coordinates")]).toEqual(["false", "true"]);
    expect(pins).toEqual([null]);
    await key("m");
    expect([pressed("matches"), pressed("coordinates")]).toEqual(["true", "false"]);
    await key("M");
    expect([pressed("matches"), pressed("coordinates")]).toEqual(["false", "false"]);
    expect(pins).toEqual([null, null]);
  });

  it("says that no MatchClaim table is loaded while it has none", async () => {
    await show([]);
    expect(document.querySelector('[data-testid="matches-state"]')).toBeNull();
    await key("m");
    expect(one('[data-testid="matches-state"]').textContent).toBe(NO_MATCHES);
    expect(NO_MATCHES).toBe("No MatchClaim table loaded.");
    expect(document.querySelector("[data-matches]")).toBeNull();
    harness.showMatches(WITH_T);
    await settle();
    expect(document.querySelector('[data-testid="matches-state"]')).toBeNull();
  });

  it("says what its host gives instead while it has no table", async () => {
    const status = "Matches need a server: MatchClaim tables are read through tilie-server.";
    await show([], false, status);
    expect(document.querySelector('[data-testid="matches-state"]')).toBeNull();
    await key("m");
    expect(one('[data-testid="matches-state"]').textContent).toBe(status);
    expect(document.querySelector("[data-matches]")).toBeNull();
  });
});

describe("the overlay", () => {
  it("draws the potential MatchStamps over the node in its drawing's units", async () => {
    await show(WITH_T);
    expect(document.querySelector("[data-matches]")).toBeNull();
    await key("m");
    const svg = one(`[data-matches="${A}"]`);
    const node = one(".svelte-flow__node[data-id] svg");
    const sizes = ["width", "height", "viewBox"];
    expect(sizes.map((name) => svg.getAttribute(name))).toEqual(
      sizes.map((name) => node.getAttribute(name)),
    );
    expect([(svg as SVGElement).style.left, (svg as SVGElement).style.top]).toEqual([
      "40px",
      "80px",
    ]);
    const potential = one('path[data-match="potential"]', svg);
    const attributes = ["d", "fill", "stroke", "stroke-width", "stroke-dasharray", "opacity"];
    expect(attributes.map((name) => potential.getAttribute(name))).toEqual([
      [
        "M261.0928 43.207V43.207",
        "M361.0928 43.207V43.207",
        "M161.0928 100.5859V100.5859",
        "M261.0928 100.5859V100.5859",
        "M361.0928 100.5859V100.5859",
        "M361.0928 157.9648V157.9648",
        "M261.0928 43.207L161.0928 100.5859",
        "M361.0928 43.207L361.0928 100.5859",
        "M361.0928 157.9648L261.0928 100.5859",
        "M361.0928 157.9648L361.0928 100.5859",
      ].join(""),
      "none",
      "#C8C8C8",
      "1",
      "3 3",
      "0.7",
    ]);
    expect([path("hovered"), path("pinned")]).toEqual([null, null]);
  });
});

describe("hovering and pinning", () => {
  it("highlights the hovered MatchStamp and shows its flag in screen order", async () => {
    await show(WITH_T);
    await key("m");
    await hoverAt(client(AT_300 + 3, SCORE_Y - 3));
    const hovered = path("hovered");
    expect(["d", "stroke", "opacity"].map((name) => hovered?.getAttribute(name))).toEqual([
      STAMP_0,
      "#6E6E6E",
      null,
    ]);
    const flag = one('[data-testid="match-flag"]');
    expect(
      [...flag.querySelectorAll(".tilie-coordinates-head")].map((head) => head.textContent),
    ).toEqual(["Score", "Take 1", "Take 2", "other"]);
    expect(
      [...flag.querySelectorAll('[data-testid="match-coordinate"]')].map(
        (value) => value.textContent,
      ),
    ).toEqual(["6 ♩", "176 400 smp", "264 600 smp", "297 675 smp", "0.5"]);
    expect((one('[data-testid="match-pole"]') as HTMLElement).style.left).toBe(
      `${NODE.x + AT_300 - 0.5}px`,
    );
  });

  it("pins on a click and clears elsewhere; draws the pinned one blue", async () => {
    await show(WITH_T);
    await key("m");
    await clickAt(client(AT_300 + 3, SCORE_Y - 3));
    await clickAt(client(461.0927734375, 70));
    expect(pins).toEqual([{ block: A, matchStamp: 0 }, null]);

    harness.pinMatchStamp({ block: A, matchStamp: 0 });
    await settle();
    expect(["d", "stroke"].map((name) => path("pinned")?.getAttribute(name))).toEqual([
      STAMP_0,
      "#1BA1E2",
    ]);
    await hoverAt(client(AT_300 + 3, SCORE_Y - 3));
    expect(path("hovered")).toBeNull();

    harness.pinMatchStamp({ block: A, matchStamp: 1 });
    await settle();
    expect(path("pinned")?.getAttribute("d")).toBe(STAMP_1);
  });

  it("draws the pinned one's anchors by the user's belief", async () => {
    await show(WITH_BELIEFS);
    await key("m");
    harness.pinMatchStamp({ block: A, matchStamp: 0 });
    await settle();
    const pinned = [
      ...document.querySelectorAll(`[data-matches="${A}"] path[data-match="pinned"]`),
    ];
    expect(
      pinned.map((element) =>
        ["data-belief", "stroke", "d"].map((name) => element.getAttribute(name)),
      ),
    ).toEqual([
      ["true", "#339933", "M361.0928 43.207L361.0928 100.5859"],
      [
        "undecided",
        "#1BA1E2",
        [
          "M361.0928 157.9648V157.9648",
          "M361.0928 43.207V43.207",
          "M261.0928 100.5859V100.5859",
          "M361.0928 100.5859V100.5859",
          "M361.0928 157.9648L261.0928 100.5859",
        ].join(""),
      ],
      ["false", "#E51400", "M361.0928 157.9648L361.0928 100.5859"],
    ]);
  });

  it("makes nothing again while the pointer moves on one MatchStamp", async () => {
    await show(WITH_T);
    await key("m");
    await hoverAt(client(AT_300 + 3, SCORE_Y - 3));
    const potential = path("potential");
    const calls = [vi.mocked(stampOverlay), vi.mocked(matchFlag), vi.mocked(pathOf)];
    const counts = () => calls.map((spy) => spy.mock.calls.length);
    for (const spy of calls) spy.mockClear();

    await hoverAt(client(AT_300 + 2, SCORE_Y - 2));
    expect(counts()).toEqual([0, 0, 0]);
    expect(path("hovered")?.getAttribute("d")).toBe(STAMP_0);

    await hoverAt(client(261.0927734375 + 3, SCORE_Y - 3));
    expect(counts()).toEqual([1, 1, 2]);
    expect(vi.mocked(stampOverlay).mock.calls[0]?.[2]).toBe(1);
    expect(path("hovered")?.getAttribute("d")).toBe(STAMP_1);
    expect(path("potential")).toBe(potential);
  });

  it("reads the hover tolerance in the device pixels of the screen the window is on", async () => {
    const watched: string[] = [];
    const changes = new Map<string, EventListener>();
    vi.stubGlobal(
      "matchMedia",
      (media: string): Partial<MediaQueryList> => ({
        matches: media === "(prefers-reduced-motion: reduce)",
        media,
        addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
          if (!media.startsWith("(resolution") || typeof listener !== "function") return;
          watched.push(`${type} ${media}`);
          changes.set(media, listener);
        },
        removeEventListener() {},
        addListener() {},
        removeListener() {},
      }),
    );
    await show(WITH_T);
    await key("m");
    await hoverAt(client(AT_300 + 3, SCORE_Y - 3));
    expect(path("hovered")?.getAttribute("d")).toBe(STAMP_0);
    expect(watched).toEqual(["change (resolution: 1dppx)"]);

    vi.stubGlobal("devicePixelRatio", 2);
    changes.get("(resolution: 1dppx)")?.(new Event("change"));
    await settle();
    expect(path("hovered")).toBeNull();
    expect(watched).toEqual(["change (resolution: 1dppx)", "change (resolution: 2dppx)"]);
  });
});

describe("the named MatchStamps", () => {
  /** The stroke of the drawn line of the alignment anchor `id`. */
  const strokeOf = (id: string) =>
    one(`.svelte-flow__node[data-id] svg line[data-id="${id}"]:not([data-part])`).getAttribute(
      "stroke",
    );

  /**
   * Give score, take_1 and take_2 a child each, spanning it, so that each
   * card draws a children band and a timestamp's line has a length.
   */
  async function withChildren(): Promise<void> {
    const children = [
      ["score", "quarters", [0, 1], [8, 1]],
      ["take_1", "samples", 0, 352800],
      ["take_2", "samples", 0, 396900],
    ] as const;
    for (const [parent, unit, offset, length] of children) {
      const refusal = store.dispatch({
        type: "add",
        into: inBlock(A, idAddress(parent)),
        child: { id: `${parent}_child`, offset, unit, length },
      });
      expect(refusal).toBeNull();
    }
    await settle();
  }

  /** The drawn element of `id`'s part `part` in block A's node. */
  const partOf = (id: string, part: string) =>
    one(`.svelte-flow__node[data-id] svg [data-id="${id}"][data-part="${part}"]`);
  /** The strokes of `anchor_1`, `anchor_2` and the lines of `timestamp_1` … `timestamp_3`. */
  const strokes = () => [
    strokeOf("anchor_1"),
    strokeOf("anchor_2"),
    ...["timestamp_1", "timestamp_2", "timestamp_3"].map((id) =>
      partOf(id, "line").getAttribute("stroke"),
    ),
  ];

  it("draw an anchor by its belief, one out of date all red, in either mode, only with a table", async () => {
    await show(WITH_T);
    await withChildren();
    const BLUE = "#1BA1E2";
    const RED = "#E51400";
    expect(strokes()).toEqual([BLUE, RED, RED, BLUE, RED]);
    await key("m");
    expect(strokes()).toEqual([BLUE, RED, RED, BLUE, RED]);
    harness.showMatches(WITH_BELIEFS);
    await settle();
    expect(strokes()).toEqual(["#E07000", RED, RED, BLUE, RED]);
    harness.showMatches([]);
    await settle();
    expect(strokes()).toEqual([BLUE, BLUE, BLUE, BLUE, BLUE]);
  });

  it("mark the name of one out of date beside its label", async () => {
    await show([{ block: A, index: T, named: NAMED_IN_D }]);
    await withChildren();
    const label = partOf("anchor_1", "name");
    expect([label.textContent, label.getAttribute("fill")]).toEqual([
      "Bar 2, downbeat (take 1)",
      "#E51400",
    ]);
    const drawing = drawingOf(blockIn(store.view, A), store.view.graphical, metrics);
    const drawn = drawing.elements.find(
      (item) => item.address.id === "anchor_1" && item.address.part?.[0] === "name",
    );
    if (drawn?.type !== "label") throw new Error("anchor_1 draws no name label");
    const size = drawn.style["font-size"];
    const measure = new TextMeasure(metrics);
    const start = drawn.x - measure.width(drawn.text, size) / 2;
    const mark = one(".svelte-flow__node[data-id] svg .tilie-out-of-date");
    expect(
      ["x", "y", "font-size", "fill", "pointer-events", "data-id"].map((name) =>
        mark.getAttribute(name),
      ),
    ).toEqual([
      attributeText(start - measure.width("! ", size)),
      attributeText(drawn.baseline),
      attributeText(size),
      "#E51400",
      "none",
      null,
    ]);
    expect(mark.textContent).toBe("! ");
    expect(strokes()).toEqual(["#E51400", "#1BA1E2", "#E51400", "#E51400", "#1BA1E2"]);
    harness.showMatches([]);
    await settle();
    expect(document.querySelector(".tilie-out-of-date")).toBeNull();
  });

  /** The elements of block A's node letting the pointer through, as `[tag, data-id, data-part]`. */
  function passing(): (string | null)[][] {
    const node = one(".svelte-flow__node[data-id] svg");
    return [...node.querySelectorAll('[pointer-events="none"]')].map((element) => [
      element.tagName,
      element.getAttribute("data-id"),
      element.getAttribute("data-part"),
    ]);
  }

  /** The drawn elements of block A drawing part of a MatchStamp or a match timestamp. */
  function matchParts(): (string | null)[][] {
    const { view } = store;
    const block = blockIn(view, A);
    const drawing = drawingOf(block, view.graphical, metrics);
    return descriptorsOf(drawing).flatMap(({ tag, source }) =>
      ownerOf(block.manifest, source.address)?.match === true
        ? [[tag, source.address.id ?? null, source.address.part?.join(" ") ?? null]]
        : [],
    );
  }

  it("let the pointer through while Show matches is on", async () => {
    await show(WITH_T);
    expect(passing()).toEqual([]);
    await key("m");
    expect(
      matchParts()
        .map(([, id, part]) => `${id} ${part}`)
        .sort(),
    ).toEqual(["anchor_1 name", "anchor_1 null", "anchor_2 null", "timestamp_3 name"]);
    expect(passing()).toEqual(matchParts());
    await key("m");
    expect(passing()).toEqual([]);
  });

  it.each([
    ["line", 'line[data-id="anchor_1"]:not([data-part])'],
    ["name label", 'text[data-id="anchor_1"][data-part="name"]'],
  ])("are selected by an anchor's %s with Show matches off", async (_, selector) => {
    await show(WITH_T);
    one(selector, one(".svelte-flow__node[data-id] svg")).dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
    await settle();
    const matchstamp: Address = inBlock(A, idAddress("matchstamp_1"));
    expect([...harness.current().selection.values()]).toEqual([matchstamp]);
    const node = one(".svelte-flow__node[data-id] svg");
    expect(
      [...node.querySelectorAll('[data-id="anchor_1"][data-selected]')].map((element) =>
        element.getAttribute("data-part"),
      ),
    ).toEqual([null, "name"]);
  });

  /** Click the drawn element of `id`'s part `part` in block A's node; the selection after it. */
  async function clickPart(id: string, part: string): Promise<Address[]> {
    partOf(id, part).dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await settle();
    return [...harness.current().selection.values()];
  }
  /** The drawn elements of block A showing the selection, as `data-id` and `data-part`. */
  const glowing = () =>
    [...one(".svelte-flow__node[data-id] svg").querySelectorAll("[data-selected]")].map(
      (element) => `${element.getAttribute("data-id")} ${element.getAttribute("data-part")}`,
    );

  it("are selected by a match timestamp's line with Show matches off", async () => {
    await show(WITH_T);
    await withChildren();
    expect(await clickPart("timestamp_1", "line")).toEqual([inBlock(A, idAddress("matchstamp_1"))]);
    expect(glowing().sort()).toEqual([
      "anchor_1 name",
      "anchor_1 null",
      "timestamp_1 line",
      "timestamp_2 line",
    ]);
    expect(await clickPart("timestamp_3", "line")).toEqual([inBlock(A, idAddress("matchstamp_2"))]);
    expect(await clickPart("timestamp_3", "name")).toEqual([inBlock(A, idAddress("timestamp_3"))]);
    expect(glowing().sort()).toEqual(["timestamp_3 line", "timestamp_3 name"]);
  });
});

describe("one table per block", () => {
  /** The stroke of the drawn line of the alignment anchor `id` in block `block`'s node. */
  const strokeIn = (block: string, id: string) =>
    one(
      `.svelte-flow__node[data-id="${block}"] svg line[data-id="${id}"]:not([data-part])`,
    ).getAttribute("stroke");
  const overlays = () =>
    [...document.querySelectorAll("[data-matches]")].map((svg) => svg.getAttribute("data-matches"));

  it("draws a block's table over that block alone, its anchors red there alone", async () => {
    await show(WITH_T, true);
    await key("m");
    expect(overlays()).toEqual([A]);
    expect([strokeIn(A, "anchor_2"), strokeIn(B, "anchor_2")]).toEqual(["#E51400", "#1BA1E2"]);
    await clickAt(clientB(AT_300 + 3, SCORE_Y - 3));
    expect(pins).toEqual([null]);
  });

  it("pins a MatchStamp with its block and draws it pinned in that block alone", async () => {
    await show(WITH_T_TWICE, true);
    await key("m");
    expect(overlays()).toEqual([A, B]);
    await clickAt(clientB(AT_300 + 3, SCORE_Y - 3));
    expect(pins).toEqual([{ block: B, matchStamp: 0 }]);
    harness.pinMatchStamp({ block: B, matchStamp: 0 });
    await settle();
    expect([path("pinned", A), path("pinned", B)?.getAttribute("d")]).toEqual([null, STAMP_0]);
  });
});
