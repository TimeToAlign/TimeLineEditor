/// <reference types="node" />
import { readFileSync } from "node:fs";
import path from "node:path";
import { drawingOf } from "@timetoalign/tilie-arranger";
import type { Address, Block, CommandEntry, Facet, Manifest } from "@timetoalign/tilie-core";
import {
  addressKey,
  createView,
  importedManifest,
  isLoadError,
  isSessionEntry,
  loadManifest,
  manifestIds,
  readWorkspace,
  unknownKeys,
  writeWorkspace,
} from "@timetoalign/tilie-core";
import type { Drawing, DrawnBox } from "@timetoalign/tilie-layout";
import { fontMetrics } from "@timetoalign/timetoshare";
import { flushSync, mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App.svelte";
import { FIXTURES } from "../src/fixtures.ts";
import type { HookBand } from "../src/testHook.ts";
import { bandsOf, hookBands } from "../src/testHook.ts";
import { WorkspaceRefusedError } from "../src/workspaceSession.svelte.ts";
import { stubEditor } from "./dom.ts";
import {
  answer,
  fixture,
  fixtureText,
  flushAutosaves,
  hook,
  openDialog,
  workspaceOf,
} from "./support.ts";

vi.mock("../src/autosave.ts", async (importOriginal) =>
  (await import("./support.ts")).recordAutosaves(await importOriginal()),
);

const A = "0000000000";
/** The end-to-end workspaces the fixture menu offers. */
const E2E_FIXTURES = path.join(import.meta.dirname, "..", "..", "..", "e2e", "fixtures");
const B = "0000000001";

/** A band of the timeline `score` written for the mapping, its line at 30.5 (`README.md`, "The test hook"). */
function scoreBand(
  facet: Facet,
  level: number,
  elements: number,
  y: number,
  height: number,
): DrawnBox {
  return {
    kind: "band",
    key: null,
    address: { id: "score", facet },
    holder: { item: "score" },
    x: 8.25,
    y,
    width: 300,
    height,
    range: { start: 0, end: 0 },
    displayed: false,
    band: { timeline: "score", facet, level, elements, line: 30.5 },
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
      kind: "block",
      key: null,
      address: {},
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
      key: { item: "score" },
      address: { id: "score", part: ["card"] },
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
      facet: band?.facet,
      level: band?.level,
      line,
      elements: band?.elements,
      rect: { x, y, width, height },
    };
  });
}

/** A band's identity as `[address, timeline, facet, level, elements]`. */
function identity({
  address,
  timeline,
  facet,
  level,
  elements,
}: Pick<HookBand, "address" | "timeline" | "facet" | "level" | "elements">) {
  return [address, timeline, facet, level, elements];
}

/**
 * The bands of `map` (`phrase` at 1) and `map_child_band_order` (`phrase`
 * at −1), derived from the drawing's band order, as `identity` gives them.
 */
function mapBands(phrase: number) {
  return [
    [{ id: "melody", facet: "children" }, "melody", "children", 2, 1],
    [{ id: "melody", facet: "conversion_maps" }, "melody", "conversion_maps", 1, 1],
    [{ id: "melody", facet: "markers" }, "melody", "markers", -1, 4],
    [{ id: "phrase", facet: "conversion_maps" }, "phrase", "conversion_maps", phrase, 1],
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

/**
 * The limit of a wait for a fixture opened through the fixture menu and of
 * each test holding one: about three times the slowest such test measured,
 * 2.2 s on a loaded machine.
 */
const FIXTURE_LOAD_TIMEOUT = 7_000;

/** The header's fixture menu, once its lazily loaded component is shown. */
async function fixtureMenu(): Promise<{ select: HTMLSelectElement; open: HTMLButtonElement }> {
  return vi.waitFor(() => {
    const select = document.querySelector<HTMLSelectElement>('[data-testid="fixture-select"]');
    const open = document.querySelector<HTMLButtonElement>('[data-testid="fixture-open"]');
    if (select === null || open === null) throw new Error("the fixture menu is missing");
    return { select, open };
  });
}

/** Choose `label` in the header's fixture menu and press Open. */
async function openFromMenu(label: string): Promise<void> {
  const { select, open } = await fixtureMenu();
  select.value = label;
  select.dispatchEvent(new Event("change"));
  open.click();
}

/**
 * Add block `A` of `bare` to the open store, unsaved; returns the added
 * block.
 */
function addBare(): Block {
  const refusal = hook()
    .store()
    .dispatch({ type: "add", into: {}, block: { id: A, manifest: fixture("bare"), x: 0, y: 0 } });
  if (refusal !== null) throw new Error(refusal.message);
  flushSync();
  return hook().store().view.blocks[A] as Block;
}

/**
 * Open `label` from the fixture menu on a new workspace holding only the
 * block `A` of `bare`, added unsaved, and wait for the import's `add`;
 * returns `A` as it was before and the new block's id.
 */
async function importFromMenu(label: string): Promise<{ first: Block; id: string }> {
  hook().load(workspaceOf());
  const first = addBare();
  await openFromMenu(label);
  await vi.waitFor(() => expect(hook().store().journal.length).toBe(2), {
    timeout: FIXTURE_LOAD_TIMEOUT,
  });
  flushSync();
  const command = (hook().store().journal[1] as CommandEntry).command as {
    type: string;
    block?: { id: string };
  };
  if (command.type !== "add" || command.block === undefined) throw new Error("no block added");
  return { first, id: command.block.id };
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
    const selected: Address[] = [{ block: A }, { block: B, id: "clt_1" }];
    hook().select(selected);
    expect(hook().selection()).toEqual(selected);
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

  it("offers every fixture in the header and opens a workspace fixture at once", {
    timeout: FIXTURE_LOAD_TIMEOUT,
  }, async () => {
    const { select } = await fixtureMenu();
    // `fixtures.test.ts` proves these labels against the files on disk.
    expect(Array.from(select.options, (option) => option.value)).toEqual(
      FIXTURES.map(({ label }) => label),
    );
    expect(select.options.length).toBe(171);
    expect(select.labels?.[0]?.textContent?.trim().startsWith("Fixture")).toBe(true);
    expect(document.querySelector('[data-testid="fixture-open"]')?.textContent).toBe("Open");

    const text = readFileSync(path.join(E2E_FIXTURES, "small.tle.json"), "utf8");
    const expected = readWorkspace(text);
    if (isLoadError(expected)) throw new Error("small.tle.json is refused");
    hook().select([{ block: A }]);
    await openFromMenu("e2e/small");

    await vi.waitFor(
      () => {
        expect(hook().store().view).toEqual(expected.view);
      },
      { timeout: FIXTURE_LOAD_TIMEOUT },
    );
    expect(hook().store().journal).toEqual(expected.journal);
    expect(hook().selection()).toEqual([]);
    expect(openDialog()).toBe(null);
  });

  it("imports a group or bundle fixture as one more block, asking nothing on unsaved changes", {
    timeout: FIXTURE_LOAD_TIMEOUT,
  }, async () => {
    for (const name of ["groups/group_number_types", "bundles/bundle_mixed"] as const) {
      const { first, id } = await importFromMenu(name);
      const manifest = loadManifest(fixtureText(name));
      if (isLoadError(manifest)) throw new Error(`${name} is refused`);
      const { blocks } = hook().store().view;
      expect(Object.keys(blocks).length).toBe(2);
      expect(blocks[A]).toEqual(first);
      expect(blocks[id]?.manifest).toEqual(importedManifest(manifest));
      expect(hook().selection()).toEqual([{ block: id }]);
      expect(openDialog()).toBe(null);
    }
  });

  it("imports a warning case keeping the unknown keys the Manifest tab lists", {
    timeout: FIXTURE_LOAD_TIMEOUT,
  }, async () => {
    const { id } = await importFromMenu("warnings/timeline_class");
    const manifest = hook().store().view.blocks[id]?.manifest as Manifest;
    expect(unknownKeys(manifest)).toEqual([{ key: "class", path: ["timelines", 0] }]);
  });

  it("removes a timeline of an imported group or bundle block on Delete", {
    timeout: FIXTURE_LOAD_TIMEOUT,
  }, async () => {
    for (const [name, timeline] of [
      ["groups/group_child_member", "second-half"],
      ["bundles/bundle_mixed", "annotations"],
    ] as const) {
      const { id } = await importFromMenu(name);
      const view = hook().store().view;
      hook().select([{ block: id, id: timeline }]);
      flushSync();
      const canvas = document.querySelector('[role="application"]');
      if (canvas === null) throw new Error("the canvas is missing");
      canvas.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
      flushSync();
      expect(hook().store().view).not.toBe(view);
      expect(
        hook()
          .store()
          .journal.slice(2)
          .map((entry) => (entry as CommandEntry).command),
      ).toEqual([{ type: "remove", targets: [{ block: id, id: timeline }] }]);
      expect(manifestIds(hook().store().view.blocks[id]?.manifest as Manifest).has(timeline)).toBe(
        false,
      );
      expect(hook().selection()).toEqual([]);
    }
  });

  it("replaces the workspace with a workspace fixture only after asking on unsaved changes", {
    timeout: FIXTURE_LOAD_TIMEOUT,
  }, async () => {
    const text = readFileSync(path.join(E2E_FIXTURES, "small.tle.json"), "utf8");
    const expected = readWorkspace(text);
    if (isLoadError(expected)) throw new Error("small.tle.json is refused");
    addBare();
    const store = hook().store();
    const view = store.view;

    await openFromMenu("e2e/small");
    await vi.waitFor(() =>
      expect(openDialog()).toEqual({
        question: "untitled.tle.json has unsaved changes. Save them?",
        answers: ["Save", "Discard", "Cancel"],
      }),
    );
    answer("Cancel");
    await vi.waitFor(() => expect(openDialog()).toBe(null));
    expect(hook().store()).toBe(store);
    expect(hook().store().view).toBe(view);

    await openFromMenu("e2e/small");
    await vi.waitFor(() => expect(openDialog()).not.toBe(null));
    answer("Discard");
    await vi.waitFor(() => expect(hook().store()).not.toBe(store), {
      timeout: FIXTURE_LOAD_TIMEOUT,
    });
    expect([
      hook().store().view,
      hook().store().journal,
      document.querySelector('[data-testid="file-name"]')?.textContent,
    ]).toEqual([expected.view, expected.journal, "untitled.tle.json"]);
  });

  it("opens and closes editors and lists the editing path", () => {
    const text = workspaceOf("bare", "nested");
    hook().load(text);
    flushSync();
    const before = hook().store().view;
    const target: Address = { block: B, id: "clt_1" };
    const rename = () =>
      hook()
        .store()
        .dispatch({ type: "set", changes: [{ target, values: { name: "N" } }] });

    expect(hook().editing()).toEqual([]);
    expect(hook().open({ block: B, id: "nope" })?.code).toBe("unknown_target");
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
    const recorded = drawingOf(view.blocks[A] as Block, view.graphical, fontMetrics).boxes.filter(
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
    const recorded = drawingOf(view.blocks[A] as Block, view.graphical, fontMetrics).boxes;
    expect(hook().boxes(A)).toEqual(
      recorded.map(({ kind, address, key, holder, displayed }) => ({
        kind,
        address,
        key,
        holder,
        displayed,
      })),
    );
    expect(
      hook()
        .boxes(A)
        .map(({ kind, address }) => `${kind} ${addressKey(address)}`),
    ).toEqual([
      "block {}",
      'card {"id":"melody","part":["card"]}',
      'band {"facet":"children","id":"melody"}',
      'band {"facet":"conversion_maps","id":"melody"}',
      'band {"facet":"markers","id":"melody"}',
      'band {"facet":"conversion_maps","id":"phrase"}',
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
