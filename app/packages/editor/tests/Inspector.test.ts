/// <reference types="node" />
/** The inspector component's wiring; the expected values are derived in `README.md` ("The tabs and panels"). */

import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { LivePlacement, Selection } from "@timetoalign/tilie-arranger";
import { drawingOf, liveStore, NOTHING_SELECTED, selectionOf } from "@timetoalign/tilie-arranger";
import type {
  Address,
  Block,
  CommandEntry,
  ManifestWarning,
  Store,
  UnknownKey,
} from "@timetoalign/tilie-core";
import {
  isLoadError,
  loadManifest,
  manifestFileOf,
  readWorkspace,
  writeWorkspace,
} from "@timetoalign/tilie-core";
import { dumps, fontMetrics, isJsonObject, loads, SCHEMA_VERSION } from "@timetoalign/timetoshare";
import { flushSync, mount, unmount } from "svelte";
import { afterEach, describe, expect, it } from "vitest";
import InspectorDrawer from "../src/InspectorDrawer.svelte";
import type { Format } from "../src/inspector/formats.svelte.ts";
import { loadCodec } from "../src/inspector/formats.svelte.ts";
import Inspector from "../src/inspector/Inspector.svelte";
import type { TextOptions } from "../src/inspector/manifestText.ts";
import { manifestOf, manifestText } from "../src/inspector/manifestText.ts";
import { problemPointer } from "../src/inspector/problems.ts";
import { holder } from "./holder.svelte.ts";
import {
  fileText,
  informing,
  noMatchClaims,
  providing,
  storeOf as storeOfFixtures,
} from "./support.ts";

const A = "0000000000";
const B = "0000000001";
const HINT = "Select a block to inspect its manifest.";
/**
 * The options the Manifest tab shows for a block without a manifest file of
 * its own, written as a new manifest: the minimal form, with the styling.
 */
const NEW: TextOptions = { includeStyling: true, minimal: true };

/** The options of a block whose manifest file states the complete form without the styling. */
const COMPLETE: TextOptions = { includeStyling: false, minimal: false };

/**
 * Write block A's manifest in the complete form without the styling, so a
 * test can edit members at their defaults: the block's manifest file in the
 * settings, which the Manifest tab shows.
 */
function completeA(store: Store): void {
  const file = { minimal: false, styling: false, serialization: "yaml" } as const;
  expect(store.configure({ manifests: { [A]: file } })).toBeNull();
}

/** The text the Manifest panel shows of block A in `format` by default: minimal, with the styling. */
function shownText(store: Store, format: Format): string {
  const text = manifestText(manifestOf(blockOf(store, A)), format, NEW);
  if (!text.ok) throw new Error("not written");
  return text.value.text;
}

const directory = path.join(
  path.dirname(createRequire(import.meta.url).resolve("@timetoalign/timetoshare/package.json")),
  "fixtures",
  SCHEMA_VERSION,
);

function blockOf(store: Store, id: string): Block {
  const block = store.view.blocks[id];
  if (block === undefined) throw new Error(`no block ${id}`);
  return block;
}

/** A store holding `bare` in block A and `styled__score` in block B. */
function storeOf(): Store {
  return storeOfFixtures("bare", "styled__score");
}

const warningsDirectory = path.join(directory, "..", "warnings", SCHEMA_VERSION);

/** What a shared warning case expects: its unknown keys and its warnings. */
interface Expected {
  readonly keys: readonly UnknownKey[];
  readonly warnings: readonly ManifestWarning[];
}

/** A shared warning case's manifest, read by core, and the case's expectation. */
function read(name: string) {
  const text = readFileSync(path.join(warningsDirectory, name), "utf8");
  const value = loads(text);
  if (!isJsonObject(value) || value.manifest === undefined)
    throw new Error(`${name} has no manifest`);
  // The case states what core finds: its lists are read as they are written.
  const expected: Expected = {
    keys: Reflect.get(value as object, "unknown_keys"),
    warnings: Reflect.get(value as object, "warnings"),
  };
  return { manifest: loadManifest(dumps(value.manifest)), expected };
}

/** A store holding the manifest of one shared warning case in block A, and the case's expectation. */
function warningCase(name: string): { store: Store; expected: Expected } {
  const { manifest, expected } = read(name);
  if (isLoadError(manifest)) throw new Error(`${name}: ${manifest.problems[0]?.message}`);
  return { store: storeOfFixtures(manifest), expected };
}

let app: ReturnType<typeof mount> | undefined;

/** Mount the inspector; the selection it gets back can be changed afterwards. */
function show(
  store: Store,
  selection: Address[],
  placement = holder<LivePlacement | null>(null),
): { value: Selection } {
  const selected = holder<Selection>(selectionOf(selection));
  app = mount(providing(Inspector), {
    target: document.body,
    context: informing(),
    props: {
      live: liveStore(store),
      get selection() {
        return selected.value;
      },
      get placement() {
        return placement.value;
      },
    },
  });
  flushSync();
  return selected;
}

/** The tab named `name`. */
function tabNamed(name: string): HTMLElement {
  const found = [...document.querySelectorAll<HTMLElement>('[role="tab"]')].find(
    (item) => item.textContent?.trim() === name,
  );
  if (found === undefined) throw new Error(`no tab ${name}`);
  return found;
}

/** The panel the tab `name` controls. */
function panelOf(name: string): HTMLElement {
  return document.getElementById(tabNamed(name).getAttribute("aria-controls") ?? "") as HTMLElement;
}

/** Click the tab named `name`. */
function openTab(name: string): void {
  tabNamed(name).click();
  flushSync();
}

/** The name of the tab selected. */
function selectedTab(): string | undefined {
  return document.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.trim();
}

/**
 * Whether the Properties panel shows the hint, the Manifest panel's text and
 * its textarea, each read while shown; the tab selected before is selected
 * again.
 */
function hinted(): unknown[] {
  const before = selectedTab() ?? "Properties";
  openTab("Properties");
  const properties = panelOf("Properties").textContent?.includes(HINT);
  openTab("Manifest");
  const manifest = [panelOf("Manifest").textContent?.trim(), document.querySelector("textarea")];
  openTab(before);
  return [properties, ...manifest];
}

/** The element naming why the format and options are locked, while it is shown. */
function switchHint(): HTMLElement | null {
  const id = document.querySelector('[role="radiogroup"]')?.getAttribute("aria-describedby");
  return id === null || id === undefined ? null : document.getElementById(id);
}

/** The listed problems' items. */
function problemItems(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('ul[aria-label="Problems"] li')];
}

/** The refusal shown beside the field `name`, or `null`. */
function fieldProblem(name: string): HTMLElement | null {
  const id = document.querySelector(`input[name="${name}"]`)?.getAttribute("aria-describedby");
  return id === null || id === undefined ? null : document.getElementById(id);
}

function press(element: HTMLElement, key: string, modifiers: KeyboardEventInit = {}): void {
  element.dispatchEvent(
    new KeyboardEvent("keydown", { key, ...modifiers, bubbles: true, cancelable: true }),
  );
  flushSync();
}

function textarea(): HTMLTextAreaElement {
  return document.querySelector("textarea") as HTMLTextAreaElement;
}

function type(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  element.value = value;
  element.dispatchEvent(new Event("input", { bubbles: true }));
  flushSync();
}

function button(name: string): HTMLButtonElement {
  const found = [...document.querySelectorAll("button")].find(
    (item) => item.textContent?.trim() === name,
  );
  if (found === undefined) throw new Error(`no button ${name}`);
  return found;
}

/** Open the Manifest tab and choose JSON, the format the tests that edit the text type in (YAML is shown first). */
function openJson(): void {
  openTab("Manifest");
  (document.querySelector('input[value="json"]') as HTMLInputElement).click();
  flushSync();
}

/** Choose YAML and wait until its codec is loaded and the text shown. */
async function chooseYaml(): Promise<void> {
  (document.querySelector('input[value="yaml"]') as HTMLInputElement).click();
  flushSync();
  await loadCodec("yaml");
  flushSync();
}

afterEach(() => {
  if (app !== undefined) unmount(app);
  app = undefined;
  document.body.innerHTML = "";
});

describe("the inspector component", () => {
  it("shows the hint on the Manifest tab only, without exactly one block", () => {
    const store = storeOf();
    show(store, []);
    expect(hinted()).toEqual([false, HINT, null]);
    if (app !== undefined) unmount(app);
    show(store, [{ block: A }, { block: B, id: "score" }]);
    expect(hinted()).toEqual([false, HINT, null]);
  });

  it("opens on YAML, with a loading state until its codec is there", async () => {
    const store = storeOf();
    show(store, [{ block: A }]);
    openTab("Manifest");
    expect(document.querySelector<HTMLInputElement>('input[value="yaml"]')?.checked).toBe(true);
    expect(document.querySelector(".loading")?.textContent).toBe("Loading YAML…");
    expect(document.querySelector("textarea")).toBe(null);
    await loadCodec("yaml");
    flushSync();
    expect(document.querySelector(".loading")).toBe(null);
    expect(textarea().value).toBe(shownText(store, "yaml"));
  });

  it("shows, switches, applies and follows the manifest", async () => {
    const store = storeOf();
    show(store, [{ block: A, id: "bare" }]);
    openJson();
    expect(textarea().value).toBe(shownText(store, "json"));
    await chooseYaml();
    expect(textarea().value).toBe(shownText(store, "yaml"));

    expect(switchHint()).toBe(null);
    type(textarea(), textarea().value.replace("  name: Bare\n", "  name: Hello # was Bare\n"));
    const hint = switchHint();
    expect(hint?.textContent).toBe("Apply or Revert to switch");
    const switches = [
      document.querySelector('[role="radiogroup"]'),
      ...document.querySelectorAll('.options input[type="checkbox"]'),
    ];
    expect(switches.map((item) => item?.getAttribute("aria-describedby"))).toEqual([
      hint?.id,
      hint?.id,
      hint?.id,
    ]);
    expect(
      [
        ...document.querySelectorAll<HTMLInputElement>(
          '.options input[type="radio"], .options input[type="checkbox"]',
        ),
      ].map((item) => item.disabled),
    ).toEqual([true, true, true, true, true]);
    textarea().dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true }),
    );
    flushSync();
    expect(store.journal).toHaveLength(3);
    expect(textarea().value).toContain("  name: Hello # was Bare\n");
    expect(switchHint()).toBe(null);

    type(textarea(), textarea().value.replace("  length: [8, 1]\n", "  length: [9, 1]\n"));
    store.dispatch({
      type: "set",
      changes: [{ target: { block: A, id: "bare" }, values: { name: "Bye" } }],
    });
    flushSync();
    expect(textarea().value).toContain("  length: [9, 1]\n");
    expect(textarea().value).toContain("  name: Hello # was Bare\n");
    expect(document.querySelector(".notice")?.textContent).toBe(
      "The manifest changed; Revert to see it",
    );
    button("Revert").click();
    flushSync();
    expect(textarea().value).toBe(shownText(store, "yaml"));
    expect(textarea().value).toContain("  name: Bye\n");
    expect(document.querySelector(".notice")).toBe(null);
    expect([button("Apply").disabled, button("Revert").disabled]).toEqual([true, true]);
  });

  it("lists a refusal and keeps the edit", () => {
    const store = storeOf();
    completeA(store);
    show(store, [{ block: A }]);
    openJson();
    const edited = textarea().value.replace('"locked": false', '"locked": "yes"');
    type(textarea(), edited);
    button("Apply").click();
    flushSync();
    const items = problemItems();
    expect(items.map((item) => item.textContent?.replace(/\s+/g, " ").trim())).toEqual([
      "schema_violation must be boolean at /timelines/0/locked",
    ]);
    expect([...(items[0]?.querySelectorAll("code") ?? [])].map((item) => item.textContent)).toEqual(
      ["schema_violation", "/timelines/0/locked"],
    );
    expect(textarea().value).toBe(edited);
    expect(store.journal).toHaveLength(2);
    expect([button("Apply").disabled, button("Revert").disabled]).toEqual([false, false]);
  });

  it("commits a property on Enter as one set", () => {
    const store = storeOf();
    show(store, [{ block: A }]);
    const x = document.querySelector('input[name="x"]') as HTMLInputElement;
    expect(x.value).toBe("0");
    type(x, "25");
    x.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    flushSync();
    expect(store.journal).toHaveLength(3);
    expect((store.journal[2] as CommandEntry | undefined)?.command).toEqual({
      type: "set",
      changes: [{ target: { block: A }, values: { x: 25 } }],
    });
    expect(x.value).toBe("25");
  });

  it("steps from the stored value, one set per step", () => {
    const store = storeOf();
    store.dispatch({ type: "set", changes: [{ target: { block: A }, values: { x: 10.123 } }] });
    show(store, [{ block: A }]);
    const x = document.querySelector('input[name="x"]') as HTMLInputElement;
    expect(x.value).toBe("10.12");
    press(x, "ArrowUp");
    expect(store.journal).toHaveLength(4);
    expect((store.journal[3] as CommandEntry | undefined)?.command).toEqual({
      type: "set",
      changes: [{ target: { block: A }, values: { x: 11.123 } }],
    });
    expect(x.value).toBe("11.12");
    press(x, "ArrowDown");
    expect(store.journal).toHaveLength(5);
    expect((store.journal[4] as CommandEntry | undefined)?.command).toEqual({
      type: "set",
      changes: [{ target: { block: A }, values: { x: 10.123 } }],
    });
    type(x, "20");
    press(x, "ArrowUp");
    expect(store.journal).toHaveLength(6);
    expect((store.journal[5] as CommandEntry | undefined)?.command).toEqual({
      type: "set",
      changes: [{ target: { block: A }, values: { x: 21 } }],
    });
    expect(x.value).toBe("21");
    const scale = document.querySelector('input[name="scale"]') as HTMLInputElement;
    press(scale, "ArrowDown");
    expect(store.journal).toHaveLength(7);
    expect((store.journal[6] as CommandEntry | undefined)?.command).toEqual({
      type: "set",
      changes: [{ target: { block: A }, values: { scale: 0.9 } }],
    });
    expect(scale.value).toBe("0.9");
  });

  it("shows live values of its block, never over a draft", () => {
    const store = storeOf();
    const gesture = holder<LivePlacement | null>(null);
    show(store, [{ block: A }], gesture);
    const field = (name: string) =>
      document.querySelector(`input[name="${name}"]`) as HTMLInputElement;
    const drawn = (id: string) => drawingOf(blockOf(store, id), store.view.graphical, fontMetrics);
    const placement = {
      id: A,
      x: 5.556,
      y: 0,
      scale: 1,
      length: 400,
      spacing: 1,
      margin: 0,
      width: null,
      height: null,
      drawing: drawn(A),
    };
    gesture.value = placement;
    flushSync();
    expect(field("x").value).toBe("5.56");
    type(field("y"), "33");
    gesture.value = { ...placement, y: 7 };
    flushSync();
    expect(field("y").value).toBe("33");
    gesture.value = { ...placement, id: B, x: 99, drawing: drawn(B) };
    flushSync();
    expect(field("x").value).toBe("0");
    gesture.value = null;
    flushSync();
    expect(field("x").value).toBe("0");
    expect(store.journal).toHaveLength(2);
  });
});

describe("the inspector's tabs", () => {
  /** Both tabs as [aria-selected, tabindex], then both panels' `hidden`. */
  function state(): unknown[] {
    const names = ["Properties", "Manifest"];
    return [
      ...names.map((name) => {
        const tab = tabNamed(name);
        return [tab.getAttribute("aria-selected"), tab.getAttribute("tabindex")];
      }),
      ...names.map((name) => panelOf(name).hidden),
    ];
  }

  const PROPERTIES = [["true", "0"], ["false", "-1"], false, true];
  const MANIFEST = [["false", "-1"], ["true", "0"], true, false];
  /** Another tab shown (the level tab, Metadata, Journal). */
  const NEITHER = [["false", "-1"], ["false", "-1"], true, true];

  it("shows the Properties tab at mount and swaps on a click", () => {
    show(storeOf(), [{ block: A }]);
    const list = document.querySelector('[role="tablist"]');
    expect(list?.getAttribute("aria-label")).toBe("Inspector sections");
    const tabs = [...(list?.querySelectorAll<HTMLElement>('[role="tab"]') ?? [])];
    expect(
      tabs.map((tab) => {
        const panel = document.getElementById(tab.getAttribute("aria-controls") ?? "");
        return [
          tab.tagName,
          tab.textContent?.trim(),
          panel?.getAttribute("role"),
          panel?.getAttribute("aria-labelledby") === tab.id,
          panel?.getAttribute("tabindex"),
        ];
      }),
    ).toEqual([
      ["BUTTON", "Arranger", "tabpanel", true, null],
      ["BUTTON", "Properties", "tabpanel", true, null],
      ["BUTTON", "Metadata", "tabpanel", true, null],
      ["BUTTON", "Manifest", "tabpanel", true, null],
      ["BUTTON", "Journal", "tabpanel", true, null],
      ["BUTTON", "Timestamp", "tabpanel", true, null],
      ["BUTTON", "Matchstamp", "tabpanel", true, null],
    ]);
    expect(state()).toEqual(PROPERTIES);
    expect(document.querySelector('form[aria-label="Block properties"]')?.parentElement).toBe(
      panelOf("Properties"),
    );
    openTab("Manifest");
    expect(state()).toEqual(MANIFEST);
    const manifest = panelOf("Manifest");
    expect(
      [
        document.querySelector('[role="radiogroup"]'),
        ...document.querySelectorAll('input[type="checkbox"]'),
        textarea(),
      ].map((item) => manifest.contains(item as Node)),
    ).toEqual([true, true, true, true]);
    expect(
      [...manifest.querySelectorAll('input[type="checkbox"]')].map((item) => [
        item.closest("label")?.textContent?.trim(),
        (item as HTMLInputElement).checked,
      ]),
    ).toEqual([
      ["Include styling", true],
      ["Minimal", true],
    ]);
    openTab("Properties");
    expect(state()).toEqual(PROPERTIES);
  });

  it("moves between the tabs with the arrows, Home and End", () => {
    show(storeOf(), [{ block: A }]);
    const steps: [string, unknown[], string][] = [
      ["ArrowRight", NEITHER, "Metadata"],
      ["ArrowRight", MANIFEST, "Manifest"],
      ["ArrowLeft", NEITHER, "Metadata"],
      ["ArrowLeft", PROPERTIES, "Properties"],
      ["Home", NEITHER, "Arranger"],
      ["ArrowRight", PROPERTIES, "Properties"],
      ["End", NEITHER, "Matchstamp"],
      ["ArrowLeft", NEITHER, "Timestamp"],
      ["ArrowLeft", NEITHER, "Journal"],
      ["ArrowLeft", MANIFEST, "Manifest"],
      ["ArrowLeft", NEITHER, "Metadata"],
      ["ArrowLeft", PROPERTIES, "Properties"],
    ];
    tabNamed("Properties").focus();
    for (const [key, expected, focused] of steps) {
      press(document.activeElement as HTMLElement, key);
      expect([key, state(), document.activeElement?.textContent?.trim()]).toEqual([
        key,
        expected,
        focused,
      ]);
    }
  });

  it("leaves a key held with Alt, Ctrl or Meta to the browser", () => {
    show(storeOf(), [{ block: A }]);
    const properties = tabNamed("Properties");
    properties.focus();
    for (const modifier of ["altKey", "ctrlKey", "metaKey"]) {
      const event = new KeyboardEvent("keydown", {
        key: "ArrowRight",
        [modifier]: true,
        bubbles: true,
        cancelable: true,
      });
      properties.dispatchEvent(event);
      flushSync();
      expect([modifier, state(), document.activeElement, event.defaultPrevented]).toEqual([
        modifier,
        PROPERTIES,
        properties,
        false,
      ]);
    }
  });

  it("holds the manifest's controls, problems, warnings and notices in the Manifest panel, in order", async () => {
    const { store } = warningCase("timeline_class.yaml");
    completeA(store);
    show(store, [{ block: A }]);
    openTab("Manifest");
    await loadCodec("yaml");
    flushSync();
    type(textarea(), `${textarea().value}# edited\n`);
    const root = store.view.blocks[A]?.manifest.timelines[0]?.id;
    store.dispatch({
      type: "set",
      changes: [{ target: { block: A, id: root }, values: { name: "Bye" } }],
    });
    flushSync();
    const manifest = panelOf("Manifest");
    const properties = panelOf("Properties");
    expect(
      [
        ...manifest.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement>(
          "input, textarea, button",
        ),
      ].map((item) => [item.tagName, item.labels?.[0]?.textContent?.trim() ?? item.textContent]),
    ).toEqual([
      ["INPUT", "YAML"],
      ["INPUT", "JSON"],
      ["INPUT", "TOML"],
      ["INPUT", "Include styling"],
      ["INPUT", "Minimal"],
      ["TEXTAREA", "Manifest (YAML)"],
      ["BUTTON", "Apply"],
      ["BUTTON", "Revert"],
    ]);
    const [styling, minimal] = manifest.querySelectorAll('input[type="checkbox"]');
    const ordered = [
      document.querySelector('[role="radiogroup"]'),
      styling,
      minimal,
      textarea(),
      button("Apply"),
      button("Revert"),
      document.querySelector('ul[aria-label="Problems"]'),
      document.querySelector('ul[aria-label="Warnings"]'),
    ] as Node[];
    const notices = [switchHint(), document.querySelector(".notice")] as Node[];
    expect([...ordered, ...notices].map((item) => manifest.contains(item))).toEqual(
      Array(10).fill(true),
    );
    expect([...ordered, ...notices].some((item) => properties.contains(item))).toBe(false);
    expect(
      ordered
        .slice(1)
        .map((item, index) =>
          Boolean(
            (ordered[index] as Node).compareDocumentPosition(item) &
              Node.DOCUMENT_POSITION_FOLLOWING,
          ),
        ),
    ).toEqual(Array(7).fill(true));
  });

  it("keeps the chosen tab while the selection changes, and starts on Properties", () => {
    const store = storeOf();
    const selected = show(store, [{ block: A }]);
    openTab("Manifest");
    selected.value = selectionOf([{ block: B }]);
    flushSync();
    expect(state()).toEqual(MANIFEST);
    selected.value = NOTHING_SELECTED;
    flushSync();
    expect(hinted()).toEqual([false, HINT, null]);
    expect(state()).toEqual(MANIFEST);
    selected.value = selectionOf([{ block: B }]);
    flushSync();
    expect(state()).toEqual(MANIFEST);
    if (app !== undefined) unmount(app);
    show(store, [{ block: B }]);
    expect(state()).toEqual(PROPERTIES);
  });

  it("keeps an unapplied text while Properties is shown", () => {
    show(storeOf(), [{ block: A }]);
    openJson();
    const edited = textarea().value.replace('"Bare"', '"Bared"');
    type(textarea(), edited);
    openTab("Properties");
    openTab("Manifest");
    expect(textarea().value).toBe(edited);
    expect([button("Apply").disabled, button("Revert").disabled]).toEqual([false, false]);
  });
});

describe("the options of a block's manifest file", () => {
  it("are the selected block's, set in the settings and kept in the workspace file", () => {
    const store = storeOf();
    const selected = show(store, [{ block: A }]);
    openJson();
    const boxes = () => [
      ...document.querySelectorAll<HTMLInputElement>('.options input[type="checkbox"]'),
    ];
    // No manifest file stated: written as a new manifest, minimal and styled.
    expect(boxes().map((box) => box.checked)).toEqual([true, true]);
    expect(textarea().value).toBe(shownText(store, "json"));
    const journal = store.journal;
    const view = store.view;
    boxes()[1]?.click();
    flushSync();
    expect(manifestFileOf(store.view.settings, A)).toEqual({
      minimal: false,
      styling: true,
      serialization: "yaml",
    });
    expect(store.journal).toEqual(journal);
    expect(store.view).not.toBe(view);
    const complete = manifestText(manifestOf(blockOf(store, A)), "json", {
      includeStyling: true,
      minimal: false,
    });
    if (!complete.ok) throw new Error("not written");
    expect(textarea().value).toBe(complete.value.text);
    expect(boxes().map((box) => box.checked)).toEqual([true, false]);

    selected.value = selectionOf([{ block: B }]);
    flushSync();
    expect(boxes().map((box) => box.checked)).toEqual([true, true]);
    selected.value = selectionOf([{ block: A }]);
    flushSync();
    expect(boxes().map((box) => box.checked)).toEqual([true, false]);

    const reopened = readWorkspace(writeWorkspace(store.snapshot()));
    if (isLoadError(reopened)) throw new Error("the workspace file is refused");
    expect(reopened.view.settings.manifests).toEqual(store.view.settings.manifests);
  });
});

describe("Apply and Revert", () => {
  const MODES: [string, TextOptions][] = [
    ["complete, styling excluded", { includeStyling: false, minimal: false }],
    ["complete, styling included", { includeStyling: true, minimal: false }],
    ["minimal, styling excluded", { includeStyling: false, minimal: true }],
    ["minimal, styling included", { includeStyling: true, minimal: true }],
  ];

  /** Apply's and Revert's `disabled`. */
  const disabled = () => [button("Apply").disabled, button("Revert").disabled];

  /** The text of block B's stored manifest in JSON and `options`. */
  function storedText(store: Store, options: TextOptions): string {
    const written = manifestText(manifestOf(blockOf(store, B)), "json", options);
    if (!written.ok) throw new Error("not written");
    return written.value.text;
  }

  for (const [mode, options] of MODES) {
    it(`are enabled exactly while the text is edited (${mode})`, () => {
      const store = storeOf();
      show(store, [{ block: B }]);
      openJson();
      const [styling, minimal] = [
        ...document.querySelectorAll<HTMLInputElement>('.options input[type="checkbox"]'),
      ] as [HTMLInputElement, HTMLInputElement];
      if (!options.includeStyling) styling.click();
      if (!options.minimal) minimal.click();
      flushSync();

      // 1. shown
      const shown = storedText(store, options);
      expect(textarea().value).toBe(shown);
      expect([shown.includes('"graphical"'), shown.includes('"is_segment_line"')]).toEqual([
        options.includeStyling,
        !options.minimal,
      ]);
      expect(disabled()).toEqual([true, true]);

      // 2. one character typed
      const edited = shown.replace('"name": "Score"', '"name": "Scores"');
      expect(edited.length).toBe(shown.length + 1);
      type(textarea(), edited);
      expect(disabled()).toEqual([false, false]);

      // 3. deleted again
      type(textarea(), shown);
      expect(disabled()).toEqual([true, true]);

      // 4. typed again, then Revert
      type(textarea(), edited);
      button("Revert").click();
      flushSync();
      expect(textarea().value).toBe(shown);
      expect(disabled()).toEqual([true, true]);
      expect(store.journal).toHaveLength(2);

      // 5. a refused Apply
      const broken = shown.replace(/\}\n$/, "\n");
      type(textarea(), broken);
      button("Apply").click();
      flushSync();
      expect(problemItems().map((item) => item.querySelector("code")?.textContent)).toEqual([
        "syntax_error",
      ]);
      expect(textarea().value).toBe(broken);
      expect(disabled()).toEqual([false, false]);
      expect(store.journal).toHaveLength(2);

      // 6. an accepted Apply
      type(textarea(), edited);
      button("Apply").click();
      flushSync();
      expect(store.journal).toHaveLength(3);
      expect(store.view.blocks[B]?.manifest.timelines[0]?.name).toBe("Scores");
      expect(textarea().value).toBe(storedText(store, options));
      expect(problemItems()).toHaveLength(0);
      expect(disabled()).toEqual([true, true]);
    });
  }
});

describe("a clean text", () => {
  const buttons = () => [button("Apply").disabled, button("Revert").disabled];
  const listed = () =>
    problemItems().map((item) => [
      item.querySelectorAll("code")[0]?.textContent,
      item.querySelectorAll("code")[1]?.textContent,
    ]);

  it("follows the store at once when a stale text is typed back to the shown text", () => {
    const store = storeOf();
    show(store, [{ block: A }]);
    openJson();
    const shown = textarea().value;
    const edited = shown.replace('"Bare"', '"Bared"');
    type(textarea(), edited);
    store.dispatch({
      type: "set",
      changes: [{ target: { block: A, id: "bare" }, values: { name: "Bye" } }],
    });
    flushSync();
    expect(document.querySelector(".notice")?.textContent).toBe(
      "The manifest changed; Revert to see it",
    );
    expect(textarea().value).toBe(edited);
    type(textarea(), shown);
    expect(document.querySelector(".notice")).toBe(null);
    const stored = manifestText(manifestOf(blockOf(store, A)), "json", NEW);
    if (!stored.ok) throw new Error("not written");
    expect(textarea().value).toBe(stored.value.text);
    expect(textarea().value).toContain('"name": "Bye"');
    expect(buttons()).toEqual([true, true]);
    expect(store.journal).toHaveLength(3);
  });

  it("drops a refused Apply's problems when typed back to the shown text", () => {
    const store = storeOf();
    show(store, [{ block: A }]);
    openJson();
    const shown = textarea().value;
    type(textarea(), shown.slice(0, shown.lastIndexOf("}")));
    button("Apply").click();
    flushSync();
    expect(listed().map(([code]) => code)).toEqual(["syntax_error"]);
    expect(buttons()).toEqual([false, false]);
    type(textarea(), shown);
    expect(listed()).toEqual([]);
    expect(textarea().getAttribute("aria-invalid")).toBe("false");
    expect(textarea().value).toBe(shown);
    expect(buttons()).toEqual([true, true]);
    expect(store.journal).toHaveLength(2);
  });

  it("keeps a problem of writing the manifest while the text is typed back", async () => {
    const manifest = loadManifest(
      fileText({
        timetoshare: SCHEMA_VERSION,
        timelines: [{ id: "score", unit: "quarters", length: [4, 1] }],
        measure_maps: [
          {
            id: "bars",
            rows: [{ count: 1, qstamp: 0, number: 1, actual_length: 4, nominal_length: null }],
          },
        ],
      }),
    );
    if (isLoadError(manifest)) throw new Error("refused");
    const store = storeOfFixtures(manifest);
    show(store, [{ block: A }]);
    openTab("Manifest");
    (document.querySelector('input[value="toml"]') as HTMLInputElement).click();
    flushSync();
    await loadCodec("toml");
    flushSync();
    const unrepresentable = [["not_representable", "/measure_maps/0/rows/0/nominal_length"]];
    expect(textarea().value).toBe("");
    expect(listed()).toEqual(unrepresentable);
    expect(buttons()).toEqual([true, true]);
    type(textarea(), "x");
    expect(buttons()).toEqual([false, false]);
    type(textarea(), "");
    expect(buttons()).toEqual([true, true]);
    expect(listed()).toEqual(unrepresentable);
    press(textarea(), "Enter", { ctrlKey: true });
    expect(listed()).toEqual(unrepresentable);
    expect(store.journal).toHaveLength(1);
  });
});

describe("an applied manifest", () => {
  it("discards the property drafts of its block and keeps the Manifest tab", () => {
    const store = storeOf();
    show(store, [{ block: A }]);
    const scale = () => document.querySelector('input[name="scale"]') as HTMLInputElement;
    type(scale(), "0");
    press(scale(), "Enter");
    expect(store.journal).toHaveLength(2);
    expect(scale().value).toBe("0");
    expect(fieldProblem("scale")).not.toBe(null);
    openJson();
    type(textarea(), textarea().value.replace('"Bare"', '"Bared"'));
    button("Apply").click();
    flushSync();
    expect(store.journal).toHaveLength(3);
    expect(selectedTab()).toBe("Manifest");
    openTab("Properties");
    expect(scale().value).toBe("1");
    expect(fieldProblem("scale")).toBe(null);
  });
});

describe("the inspector's warnings", () => {
  const cases = readdirSync(warningsDirectory)
    .filter((name) => name.endsWith(".yaml"))
    .sort();

  /** Each warning row: an unknown key's key, or a warning's message; then where it lies. */
  const listed = () =>
    [...document.querySelectorAll('ul[aria-label="Warnings"] li')].map((item) => {
      const note = item.querySelector(".note");
      const codes = item.querySelectorAll("code");
      const where = item.querySelector(".where")?.textContent;
      return note === null
        ? [codes[0]?.textContent, codes[1]?.textContent ?? where]
        : [note.textContent, codes[0]?.textContent ?? where];
    });

  it("loads every case in core", () => {
    expect(
      cases.flatMap((name) => {
        const { manifest } = read(name);
        return isLoadError(manifest) ? [[name, manifest.problems[0]?.code]] : [];
      }),
    ).toEqual([]);
  });

  for (const name of cases) {
    it(`lists every unknown key and warning of ${name} with its path, and editing continues`, () => {
      const { store, expected } = warningCase(name);
      completeA(store);
      show(store, [{ block: A }]);
      openJson();
      const rows = [
        ...expected.keys.map((item) => [
          item.key,
          item.path.length === 0 ? "at the top level" : problemPointer(item),
        ]),
        // Warnings are read with the full @context added at the file boundary, so none lacks one.
        ...expected.warnings
          .filter((item) => item.code !== "context_absent")
          .map((item) => [
            `${item.message.charAt(0).toUpperCase()}${item.message.slice(1)}`,
            item.path.length === 0 ? "at the top level" : problemPointer(item),
          ]),
      ];
      expect(document.querySelectorAll('ul[aria-label="Warnings"]')).toHaveLength(
        rows.length === 0 ? 0 : 1,
      );
      expect(listed()).toEqual(rows);
      expect(problemItems()).toHaveLength(0);
      const text = manifestText(manifestOf(blockOf(store, A)), "json", COMPLETE);
      if (!text.ok) throw new Error("not written");
      expect(textarea().value).toBe(text.value.text);
      type(textarea(), textarea().value.replace('"meta": {}', '"meta": {"note": "edited"}'));
      button("Apply").click();
      flushSync();
      expect(store.journal).toHaveLength(2);
      expect(listed()).toHaveLength(rows.length);
    });
  }

  it("shows no warning list for a manifest without unknown keys", () => {
    show(storeOf(), [{ block: A }]);
    openTab("Manifest");
    expect(document.querySelector('ul[aria-label="Warnings"]')).toBe(null);
  });
});

describe("the inspector in its drawer", () => {
  /** Mount the drawer, closed, on `store` with `selection` selected. */
  function drawer(store: Store, selection: Address[]): void {
    app = mount(providing(InspectorDrawer), {
      target: document.body,
      context: informing(),
      props: {
        live: liveStore(store),
        selection: selectionOf(selection),
        placement: null,
        storageKey: null,
        ...noMatchClaims(),
      },
    });
    flushSync();
  }

  /** Press the drawer's button labelled `name`. */
  function toggle(name: "Open inspector" | "Close inspector"): void {
    document.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)?.click();
    flushSync();
  }

  it("renders no inspector while closed, and keeps a typed text and the tab through closing", () => {
    const store = storeOf();
    const journal = store.journal.length;
    drawer(store, [{ block: A, id: "bare" }]);
    expect(document.querySelectorAll('[role="tablist"], [role="tabpanel"]').length).toBe(0);

    toggle("Open inspector");
    openJson();
    const shown = textarea().value;
    const edited = shown.replace('"name": "Bare"', '"name": "Hello"');
    expect(edited).not.toBe(shown);
    type(textarea(), edited);

    toggle("Close inspector");
    expect(document.querySelectorAll('[role="tablist"], [role="tabpanel"]').length).toBe(0);
    toggle("Open inspector");
    expect([selectedTab(), textarea().value, button("Apply").disabled]).toEqual([
      "Manifest",
      edited,
      false,
    ]);
    expect(store.journal.length).toBe(journal);
  });
});
