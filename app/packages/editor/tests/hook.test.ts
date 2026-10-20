/// <reference types="node" />
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { drawingOf } from "@timetoalign/tilie-arranger";
import type { BandKind, Block, CommandEntry, Manifest } from "@timetoalign/tilie-core";
import {
  createView,
  isLoadError,
  isSessionEntry,
  loadManifest,
  manifestIds,
  readWorkspace,
  writeWorkspace,
} from "@timetoalign/tilie-core";
import type { Drawing, DrawnBox } from "@timetoalign/tilie-layout";
import { fontMetrics } from "@timetoalign/timeskeleton";
import { flushSync, mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App.svelte";
import type { HookBand } from "../src/testHook.ts";
import { bandsOf, hookBands } from "../src/testHook.ts";
import { WorkspaceRefusedError } from "../src/workspaceSession.svelte.ts";
import { stubEditor } from "./dom.ts";
import { fixtureText, flushAutosaves, hook, workspaceOf } from "./support.ts";

vi.mock("../src/autosave.ts", async (importOriginal) =>
  (await import("./support.ts")).recordAutosaves(await importOriginal()),
);

const A = "0000000000";
/** The end-to-end workspaces the fixture menu offers. */
const E2E_FIXTURES = path.join(import.meta.dirname, "..", "..", "..", "e2e", "fixtures");
const B = "0000000001";

/** A band of the timeline `score` written for the mapping, its line at 30.5 (`README.md`, "The test hook"). */
function scoreBand(
  kind: BandKind,
  level: number,
  elements: number,
  y: number,
  height: number,
): DrawnBox {
  return {
    kind: "band",
    key: null,
    address: `score/${kind}_1`,
    holder: "score/card",
    x: 8.25,
    y,
    width: 300,
    height,
    range: { start: 0, end: 0 },
    displayed: false,
    band: { timeline: "score", kind, level, elements, line: 30.5 },
  };
}

/** The bands of `MAPPED`, in its box order. */
const BANDS: readonly DrawnBox[] = [
  scoreBand("conversion_maps", 1, 1, 24, 6.5),
  scoreBand("markers", -1, 2, 30.5, 26.75),
  scoreBand("flow_control", -2, 1, 61.25, 0),
];

/**
 * A drawing of 400 × 200 holding its box, one card and the three bands of
 * the card's timeline, and nothing else (case 8): the box and the card are
 * not reported.
 */
const MAPPED: Drawing = {
  width: 400,
  height: 200,
  origin: { x: 0, y: 0 },
  boxes: [
    {
      kind: "box",
      key: null,
      address: null,
      holder: null,
      x: 0,
      y: 0,
      width: 400,
      height: 200,
      range: { start: 0, end: 0 },
      displayed: true,
    },
    {
      kind: "card",
      key: "score",
      address: "score/card",
      holder: null,
      x: 8.25,
      y: 20,
      width: 300,
      height: 80,
      range: { start: 0, end: 0 },
      displayed: false,
    },
    ...BANDS,
  ],
  axes: [],
  elements: [],
  unmapped: [],
};

/** `MAPPED`'s bands as the hook reports them, at the line `line` with the rectangles `rects`. */
function mapped(line: number, rects: readonly (readonly number[])[]) {
  return BANDS.map(({ address, band }, at) => {
    const [x, y, width, height] = rects[at] ?? [];
    return {
      address,
      timeline: band?.timeline,
      kind: band?.kind,
      level: band?.level,
      line,
      elements: band?.elements,
      rect: { x, y, width, height },
    };
  });
}

/** A band's identity as `[address, timeline, kind, level, elements]`. */
function identity({
  address,
  timeline,
  kind,
  level,
  elements,
}: Pick<HookBand, "address" | "timeline" | "kind" | "level" | "elements">) {
  return [address, timeline, kind, level, elements];
}

/**
 * The bands of `map` (`phrase` at 1) and `map_child_band_order` (`phrase`
 * at −1), derived from the drawing's band order, as `identity` gives them.
 */
function mapBands(phrase: number) {
  return [
    ["melody/children_1", "melody", "children", 2, 1],
    ["melody/conversion_maps_1", "melody", "conversion_maps", 1, 1],
    ["melody/markers_1", "melody", "markers", -1, 2],
    ["phrase/conversion_maps_1", "phrase", "conversion_maps", phrase, 1],
  ];
}

describe("hookBands", () => {
  it("places each record through the svg's client rectangle", () => {
    expect(hookBands(MAPPED, { left: 100, top: 50, width: 800, height: 400 })).toEqual(
      mapped(111, [
        [116.5, 98, 600, 13],
        [116.5, 111, 600, 53.5],
        [116.5, 172.5, 600, 0],
      ]),
    );
  });

  it("reports a drawing off screen as computed", () => {
    expect(hookBands(MAPPED, { left: -30, top: -20, width: 200, height: 100 })).toEqual(
      mapped(-4.75, [
        [-25.875, -8, 150, 3.25],
        [-25.875, -4.75, 150, 13.375],
        [-25.875, 10.625, 150, 0],
      ]),
    );
  });
});

describe("bandsOf", () => {
  it("cannot place a block whose drawing is not on the page", () => {
    const text = workspaceOf("map", "map_child_band_order");
    const read = readWorkspace(text);
    if (isLoadError(read)) throw new Error("the written workspace is refused");
    expect(() => bandsOf(read.view, A)).toThrow(
      new Error(`the drawing of block ${A} is not on the page`),
    );
  });
});

/** The text of a group or bundle fixture of the installed schema package. */
function manifestFixtureText(name: string): string {
  return fixtureText(`${name.startsWith("group_") ? "groups" : "bundles"}/${name}`);
}

/**
 * The limit of a wait for a load through the fixture menu and of each test
 * holding one: about three times the slowest such test measured, 2.2 s on
 * a loaded machine.
 */
const FIXTURE_LOAD_TIMEOUT = 7_000;

/** Choose `name` in the header's fixture menu, press Load and wait until a store holds it. */
async function loadFromMenu(name: string): Promise<void> {
  const select = document.querySelector<HTMLSelectElement>('[data-testid="fixture-select"]');
  const load = document.querySelector<HTMLButtonElement>('[data-testid="fixture-load"]');
  if (select === null || load === null) throw new Error("the fixture menu is missing");
  const before = window.__tilie?.store();
  select.value = name;
  select.dispatchEvent(new Event("change"));
  load.click();
  await vi.waitFor(
    () => {
      expect(window.__tilie?.store()).not.toBe(before);
    },
    { timeout: FIXTURE_LOAD_TIMEOUT },
  );
  flushSync();
}

describe("the test hook", () => {
  let app: ReturnType<typeof mount> | undefined;

  beforeEach(() => {
    window.history.replaceState({}, "", "/");
    stubEditor();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ name: "tilie-server", version: "0", timetoalign: "0" })),
    );
    app = mount(App, { target: document.body });
    flushSync();
  });

  afterEach(async () => {
    if (app !== undefined) unmount(app);
    app = undefined;
    await flushAutosaves();
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("starts on an empty workspace with the viewer's defaults", () => {
    expect(hook().store().view).toEqual(createView());
    expect(hook().store().journal).toEqual([]);
    expect(hook().selection()).toEqual([]);
    expect(hook().locked()).toBe(false);
    expect(hook().mode()).toBe("scale");
  });

  it("loads a workspace file into a new store and clears the selection", () => {
    const text = workspaceOf("bare", "nested");
    const expected = readWorkspace(text);
    if (isLoadError(expected)) throw new Error("the written workspace is refused");
    hook().select([A, `${B}/clt_1`]);
    expect(hook().selection()).toEqual([A, `${B}/clt_1`]);
    const before = hook().store();

    hook().load(text);
    flushSync();

    expect(hook().store()).not.toBe(before);
    expect(hook().store().view).toEqual(expected.view);
    expect(hook().store().journal).toEqual(expected.journal);
    expect(
      writeWorkspace({
        view: hook().store().view,
        journal: hook().store().journal,
        sessions: hook().store().sessions,
      }),
    ).toBe(text);
    expect(hook().text()).toBe(text);
    expect(hook().selection()).toEqual([]);
  });

  it("refuses a file the reader refuses and keeps the open workspace", () => {
    hook().load(workspaceOf("bare", "nested"));
    const open = hook().store();

    let refusal: unknown;
    try {
      hook().load("{");
    } catch (error) {
      refusal = error;
    }
    expect(refusal).toBeInstanceOf(WorkspaceRefusedError);
    expect((refusal as WorkspaceRefusedError).problems.map(({ code }) => code)).toEqual([
      "invalid_json",
    ]);
    expect(hook().store()).toBe(open);
  });

  it("offers the end-to-end workspaces in the header and loads the chosen one", {
    timeout: FIXTURE_LOAD_TIMEOUT,
  }, async () => {
    const select = document.querySelector<HTMLSelectElement>('[data-testid="fixture-select"]');
    const load = document.querySelector<HTMLButtonElement>('[data-testid="fixture-load"]');
    if (select === null || load === null) throw new Error("the fixture menu is missing");
    // The end-to-end workspaces are the generator's (`pnpm e2e:fixtures:check` pins them).
    const workspaces = readdirSync(E2E_FIXTURES)
      .filter((name) => name.endsWith(".tle.json"))
      .map((name) => name.slice(0, -".tle.json".length));
    const manifests = [
      "bundle_mixed",
      "bundle_shared_parent",
      "bundle_ungrouped",
      "group_child_member",
      "group_grandchild",
      "group_measure_map",
      "group_number_types",
      "group_parent_both",
      "group_parent_exact",
      "group_parent_right",
      "group_parents_mixed",
      "group_styled",
      "group_unknown_length",
    ];
    expect(workspaces.includes("small")).toBe(true);
    expect(Array.from(select.options, (option) => option.value)).toEqual(
      [...workspaces, ...manifests].sort(),
    );
    expect(select.labels?.[0]?.textContent?.trim().startsWith("Fixture")).toBe(true);

    const text = readFileSync(path.join(E2E_FIXTURES, "small.tle.json"), "utf8");
    const expected = readWorkspace(text);
    if (isLoadError(expected)) throw new Error("small.tle.json is refused");
    hook().select([A]);
    select.value = "small";
    select.dispatchEvent(new Event("change"));
    load.click();

    await vi.waitFor(
      () => {
        expect(hook().store().view).toEqual(expected.view);
      },
      { timeout: FIXTURE_LOAD_TIMEOUT },
    );
    expect(hook().store().journal).toEqual(expected.journal);
    expect(hook().selection()).toEqual([]);
  });

  it("opens a group or bundle fixture as one block of its manifest", {
    timeout: FIXTURE_LOAD_TIMEOUT,
  }, async () => {
    for (const name of ["group_number_types", "bundle_mixed"] as const) {
      await loadFromMenu(name);
      const manifest = loadManifest(manifestFixtureText(name));
      if (isLoadError(manifest)) throw new Error(`${name} is refused`);
      const block = hook().store().view.blocks.fixture000;
      expect([block?.x, block?.y]).toEqual([0, 0]);
      expect(block?.manifest).toEqual(manifest);
      expect(Object.keys(hook().store().view.blocks)).toEqual(["fixture000"]);
      expect(
        hook()
          .store()
          .journal.map((entry) => [(entry as CommandEntry).command.type, entry.author, entry.time]),
      ).toEqual([["add", "Fixture Generator", "2026-10-12T09:00:00.000Z"]]);
    }
  });

  it("removes a timeline of a group or bundle block on Delete", {
    timeout: FIXTURE_LOAD_TIMEOUT,
  }, async () => {
    for (const [name, timeline] of [
      ["group_child_member", "second-half"],
      ["bundle_mixed", "annotations"],
    ] as const) {
      await loadFromMenu(name);
      const view = hook().store().view;
      hook().select([`fixture000/${timeline}`]);
      flushSync();
      const canvas = document.querySelector('[role="application"]');
      if (canvas === null) throw new Error("the canvas is missing");
      canvas.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
      flushSync();
      expect(hook().store().view).not.toBe(view);
      expect(
        hook()
          .store()
          .journal.map((entry) => (entry as CommandEntry).command),
      ).toEqual([
        (hook().store().journal[0] as CommandEntry | undefined)?.command,
        { type: "remove", targets: [`fixture000/${timeline}`] },
      ]);
      expect(
        manifestIds(hook().store().view.blocks.fixture000?.manifest as Manifest).has(timeline),
      ).toBe(false);
      expect(hook().selection()).toEqual([]);
    }
  });

  it("opens and closes editors and lists the editing path", () => {
    const text = workspaceOf("bare", "nested");
    hook().load(text);
    flushSync();
    const before = hook().store().view;
    const target = `${B}/clt_1`;
    const rename = () =>
      hook()
        .store()
        .dispatch({ type: "set", changes: [{ target, values: { name: "N" } }] });

    expect(hook().editing()).toEqual([]);
    expect(hook().open(`${B}/nope`)?.code).toBe("unknown_target");
    expect(hook().editing()).toEqual([]);

    expect(hook().open(target)).toBeNull();
    const editing = hook().editing();
    expect(editing).toEqual([
      { session: editing[0]?.session, target, kind: "timeline", earlier: null },
    ]);
    expect(/^[0-9a-z]{10}$/.test(editing[0]?.session ?? "")).toBe(true);
    expect(editing).toEqual(hook().store().editing);
    expect(editing).not.toBe(hook().store().editing);

    const showModal = vi.spyOn(HTMLDialogElement.prototype, "showModal");
    expect(rename()).toBeNull();
    hook().cancel();
    flushSync();
    expect(showModal).not.toHaveBeenCalled();
    expect(hook().editing()).toEqual([]);
    expect(hook().store().view).toBe(before);

    const length = hook().store().journal.length;
    expect(hook().open(target)).toBeNull();
    expect(rename()).toBeNull();
    hook().done();
    flushSync();
    expect(hook().editing()).toEqual([]);
    expect(hook().store().journal.length).toBe(length + 1);
    const last = hook().store().journal.at(-1);
    expect(last !== undefined && isSessionEntry(last)).toBe(true);
  });

  it("lists a block's drawn bands placed through its own drawing", () => {
    hook().load(workspaceOf("map", "map_child_band_order"));
    flushSync();
    const svg = document.querySelector(`.svelte-flow__node[data-id="${A}"] .tilie-block > svg`);
    if (svg === null) throw new Error("the block's drawing is not rendered");
    const [, , width = 0, height = 0] = (svg.getAttribute("viewBox") ?? "").split(" ").map(Number);
    vi.spyOn(svg, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ x: 100, y: 50, width: 2 * width, height: 2 * height }),
    );
    const { view } = hook().store();
    const recorded = drawingOf(view.blocks[A] as Block, view.settings, fontMetrics).boxes.filter(
      (box) => box.kind === "band",
    );

    const first = hook().bands(A);
    expect(first.map(identity)).toEqual(mapBands(1));
    expect(first.map(({ line, rect }) => ({ line, rect }))).toEqual(
      recorded.map(({ band, x, y, width, height }) => ({
        line: 50 + 2 * (band?.line ?? Number.NaN),
        rect: { x: 100 + 2 * x, y: 50 + 2 * y, width: 2 * width, height: 2 * height },
      })),
    );

    const second = hook().bands(B);
    expect(second.map(identity)).toEqual(mapBands(-1));
    expect(second.map(({ line, rect }) => ({ line, rect }))).toEqual(
      mapBands(-1).map(() => ({ line: 0, rect: { x: 0, y: 0, width: 0, height: 0 } })),
    );

    expect(() => hook().bands("0000000009")).toThrow(RangeError);
  });

  it("lists a block's containers as its drawing records them, in box order", () => {
    hook().load(workspaceOf("map", "map_child_band_order"));
    flushSync();
    const { view } = hook().store();
    const recorded = drawingOf(view.blocks[A] as Block, view.settings, fontMetrics).boxes;
    expect(hook().boxes(A)).toEqual(
      recorded.map(({ kind, address, holder, displayed }) => ({
        kind,
        address,
        holder,
        displayed,
      })),
    );
    expect(
      hook()
        .boxes(A)
        .map(({ kind, address }) => `${kind} ${address}`),
    ).toEqual([
      "box null",
      "card melody/card",
      "band melody/children_1",
      "band melody/conversion_maps_1",
      "band melody/markers_1",
      "band phrase/conversion_maps_1",
    ]);
    expect(() => hook().boxes("0000000009")).toThrow(RangeError);
  });

  it("is removed when the editor is unmounted", () => {
    expect(window.__tilie).toBeDefined();
    if (app !== undefined) unmount(app);
    app = undefined;
    expect(window.__tilie).toBeUndefined();
  });
});
