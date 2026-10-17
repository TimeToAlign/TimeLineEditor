/// <reference types="node" />
/** The inspector component's wiring; the expected values are derived in `README.md` ("The inspector"). */

import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { LivePlacement } from "@timetoalign/tilie-arranger";
import { liveStore } from "@timetoalign/tilie-arranger";
import type { Block, CommandEntry, Store, UnknownKey } from "@timetoalign/tilie-core";
import {
  createStore,
  createView,
  isLoadError,
  loadManifest,
  saveManifest,
} from "@timetoalign/tilie-core";
import { dumps, parseJson, SCHEMA_VERSION } from "@timetoalign/timeskeleton";
import { flushSync, mount, unmount } from "svelte";
import { afterEach, describe, expect, it } from "vitest";
import type { TextOptions } from "../src/inspector/edit.ts";
import { manifestOf, manifestText, problemPointer } from "../src/inspector/edit.ts";
import { loadCodec, writeText } from "../src/inspector/formats.ts";
import Inspector from "../src/inspector/Inspector.svelte";
import { holder } from "./holder.svelte.ts";

const A = "0000000000";
const B = "0000000001";
const HINT = "Select a block to inspect its manifest.";
/** The options the Manifest tab starts with: the complete form, without the styling. */
const COMPLETE: TextOptions = { includeStyling: false, minimal: false };

const directory = path.join(
  path.dirname(createRequire(import.meta.url).resolve("@timetoalign/timeskeleton/package.json")),
  "fixtures",
  SCHEMA_VERSION,
);

/** A store holding `bare` in block A and `styled__score` in block B. */
function storeOf(): Store {
  const store = createStore({ view: createView(), journal: [], sessions: {} });
  for (const [id, name] of [
    [A, "bare"],
    [B, "styled__score"],
  ] as const) {
    const manifest = loadManifest(readFileSync(path.join(directory, `${name}.json`), "utf8"));
    if (isLoadError(manifest)) throw new Error(`${name} refused`);
    const error = store.dispatch({
      type: "add",
      into: "workspace",
      block: { id, manifest, x: 0, y: 0 },
    });
    if (error !== null) throw new Error(error.message);
  }
  return store;
}

const warningsDirectory = path.join(directory, "..", "warnings", SCHEMA_VERSION);

/** A shared warning case's manifest, read by core, and the case's expectation. */
function read(name: string) {
  const value = parseJson(readFileSync(path.join(warningsDirectory, name), "utf8")) as unknown as {
    manifest: unknown;
    unknown_keys: UnknownKey[];
  };
  return { manifest: loadManifest(dumps(value.manifest as never)), expected: value.unknown_keys };
}

/** A store holding the manifest of one shared warning case in block A, and the case's expectation. */
function warningCase(name: string): { store: Store; expected: readonly UnknownKey[] } {
  const { manifest, expected } = read(name);
  if (isLoadError(manifest)) throw new Error(`${name}: ${manifest.problems[0]?.message}`);
  const store = createStore({ view: createView(), journal: [], sessions: {} });
  const error = store.dispatch({
    type: "add",
    into: "workspace",
    block: { id: A, manifest, x: 0, y: 0 },
  });
  if (error !== null) throw new Error(error.message);
  return { store, expected };
}

let app: ReturnType<typeof mount> | undefined;

/** Mount the inspector; the selection it gets back can be changed afterwards. */
function show(
  store: Store,
  selection: string[],
  placement = holder<LivePlacement | null>(null),
): { value: ReadonlySet<string> } {
  const selected = holder<ReadonlySet<string>>(new Set(selection));
  app = mount(Inspector, {
    target: document.body,
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

/** Click the tab named `name` ("Properties" or "Manifest"). */
function openTab(name: string): void {
  const found = [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
    (item) => item.textContent?.trim() === name,
  );
  if (found === undefined) throw new Error(`no tab ${name}`);
  found.click();
  flushSync();
}

/** The texts of the Properties and Manifest panels, then the form and the textarea (null when absent). */
function hinted(): unknown[] {
  return [
    document.getElementById("inspector-panel-properties")?.textContent?.trim(),
    document.getElementById("inspector-panel-manifest")?.textContent?.trim(),
    document.querySelector("form"),
    document.querySelector("textarea"),
  ];
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
  it("shows the hint without exactly one block", () => {
    const store = storeOf();
    show(store, []);
    expect(hinted()).toEqual([HINT, HINT, null, null]);
    unmount(app as never);
    show(store, [A, `${B}/score`]);
    expect(hinted()).toEqual([HINT, HINT, null, null]);
  });

  it("shows a loading state until the YAML codec is there", async () => {
    const store = storeOf();
    show(store, [A]);
    openTab("Manifest");
    (document.querySelector('input[value="yaml"]') as HTMLInputElement).click();
    flushSync();
    expect(document.querySelector(".loading")?.textContent).toBe("Loading YAML…");
    expect(document.querySelector("textarea")).toBe(null);
    await loadCodec("yaml");
    flushSync();
    expect(document.querySelector(".loading")).toBe(null);
    const yaml = writeText("yaml", store.view.blocks[A]?.manifest as never);
    if (!yaml.ok) throw new Error("not written");
    expect(textarea().value).toBe(yaml.value.text);
  });

  it("shows, switches, applies and follows the manifest", async () => {
    const store = storeOf();
    show(store, [`${A}/bare`]);
    openTab("Manifest");
    expect(textarea().value).toBe(saveManifest(store.view.blocks[A]?.manifest as never));
    await chooseYaml();
    const yaml = writeText("yaml", store.view.blocks[A]?.manifest as never);
    if (!yaml.ok) throw new Error("not written");
    expect(textarea().value).toBe(yaml.value.text);

    expect(document.querySelector("#inspector-switch-hint")).toBe(null);
    type(textarea(), textarea().value.replace("  name: Bare\n", "  name: Hello # was Bare\n"));
    const hint = document.querySelector("#inspector-switch-hint");
    expect(hint?.textContent).toBe("Apply or Revert to switch");
    const switches = [
      document.querySelector('[role="radiogroup"]'),
      ...document.querySelectorAll('.options input[type="checkbox"]'),
    ];
    expect(switches.map((item) => item?.getAttribute("aria-describedby"))).toEqual([
      "inspector-switch-hint",
      "inspector-switch-hint",
      "inspector-switch-hint",
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
    expect(document.querySelector("#inspector-switch-hint")).toBe(null);

    type(textarea(), textarea().value.replace("  locked: false\n", "  locked: true\n"));
    store.dispatch({ type: "set", changes: [{ target: `${A}/bare`, values: { name: "Bye" } }] });
    flushSync();
    expect(textarea().value).toContain("  locked: true\n");
    expect(textarea().value).toContain("  name: Hello # was Bare\n");
    expect(document.querySelector(".notice")?.textContent).toBe(
      "The manifest changed; Revert to see it",
    );
    button("Revert").click();
    flushSync();
    const newer = writeText("yaml", store.view.blocks[A]?.manifest as never);
    if (!newer.ok) throw new Error("not written");
    expect(textarea().value).toBe(newer.value.text);
    expect(textarea().value).toContain("  name: Bye\n");
    expect(document.querySelector(".notice")).toBe(null);
    expect([button("Apply").disabled, button("Revert").disabled]).toEqual([true, true]);
  });

  it("lists a refusal and keeps the edit", () => {
    const store = storeOf();
    show(store, [A]);
    openTab("Manifest");
    const edited = textarea().value.replace('"locked": false', '"locked": "yes"');
    type(textarea(), edited);
    button("Apply").click();
    flushSync();
    const items = [...document.querySelectorAll("#inspector-problems li")];
    expect(items.map((item) => item.textContent?.replace(/\s+/g, " ").trim())).toEqual([
      "schema_violation must be boolean at /timelines/0/locked",
    ]);
    expect(items[0]?.querySelector(".code")?.textContent).toBe("schema_violation");
    expect(items[0]?.querySelector(".pointer")?.textContent).toBe("/timelines/0/locked");
    expect(textarea().value).toBe(edited);
    expect(store.journal).toHaveLength(2);
    expect([button("Apply").disabled, button("Revert").disabled]).toEqual([false, false]);
  });

  it("commits a property on Enter as one set", () => {
    const store = storeOf();
    show(store, [A]);
    const x = document.querySelector('input[name="x"]') as HTMLInputElement;
    expect(x.value).toBe("0");
    type(x, "25");
    x.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    flushSync();
    expect(store.journal).toHaveLength(3);
    expect((store.journal[2] as CommandEntry | undefined)?.command).toEqual({
      type: "set",
      changes: [{ target: A, values: { x: 25 } }],
    });
    expect(x.value).toBe("25");
  });

  it("steps from the stored value, one set per step", () => {
    const store = storeOf();
    store.dispatch({ type: "set", changes: [{ target: A, values: { x: 10.123 } }] });
    show(store, [A]);
    const x = document.querySelector('input[name="x"]') as HTMLInputElement;
    expect(x.value).toBe("10.12");
    press(x, "ArrowUp");
    expect(store.journal).toHaveLength(4);
    expect((store.journal[3] as CommandEntry | undefined)?.command).toEqual({
      type: "set",
      changes: [{ target: A, values: { x: 11.123 } }],
    });
    expect(x.value).toBe("11.12");
    press(x, "ArrowDown");
    expect(store.journal).toHaveLength(5);
    expect((store.journal[4] as CommandEntry | undefined)?.command).toEqual({
      type: "set",
      changes: [{ target: A, values: { x: 10.123 } }],
    });
    type(x, "20");
    press(x, "ArrowUp");
    expect(store.journal).toHaveLength(6);
    expect((store.journal[5] as CommandEntry | undefined)?.command).toEqual({
      type: "set",
      changes: [{ target: A, values: { x: 21 } }],
    });
    expect(x.value).toBe("21");
    const scale = document.querySelector('input[name="scale"]') as HTMLInputElement;
    press(scale, "ArrowDown");
    expect(store.journal).toHaveLength(7);
    expect((store.journal[6] as CommandEntry | undefined)?.command).toEqual({
      type: "set",
      changes: [{ target: A, values: { scale: 0.9 } }],
    });
    expect(scale.value).toBe("0.9");
  });

  it("shows live values of its block, never over a draft", () => {
    const store = storeOf();
    const gesture = holder<LivePlacement | null>(null);
    show(store, [A], gesture);
    const field = (name: string) =>
      document.querySelector(`input[name="${name}"]`) as HTMLInputElement;
    const placement = {
      id: A,
      x: 5.556,
      y: 0,
      scale: 1,
      length: 400,
      spacing: 1,
      width: null,
      height: null,
    };
    gesture.value = placement;
    flushSync();
    expect(field("x").value).toBe("5.56");
    type(field("y"), "33");
    gesture.value = { ...placement, y: 7 };
    flushSync();
    expect(field("y").value).toBe("33");
    gesture.value = { ...placement, id: B, x: 99 };
    flushSync();
    expect(field("x").value).toBe("0");
    gesture.value = null;
    flushSync();
    expect(field("x").value).toBe("0");
    expect(store.journal).toHaveLength(2);
  });
});

describe("the inspector's tabs", () => {
  const TABS = ["inspector-tab-properties", "inspector-tab-manifest"];
  const PANELS = ["inspector-panel-properties", "inspector-panel-manifest"];

  /** Both tabs as [aria-selected, tabindex], then both panels' `hidden`. */
  function state(): unknown[] {
    return [
      ...TABS.map((id) => {
        const tab = document.getElementById(id);
        return [tab?.getAttribute("aria-selected"), tab?.getAttribute("tabindex")];
      }),
      ...PANELS.map((id) => (document.getElementById(id) as HTMLElement).hidden),
    ];
  }

  const PROPERTIES = [["true", "0"], ["false", "-1"], false, true];
  const MANIFEST = [["false", "-1"], ["true", "0"], true, false];

  it("shows the Properties tab at mount and swaps on a click", () => {
    show(storeOf(), [A]);
    const list = document.querySelector('[role="tablist"]');
    expect(list?.getAttribute("aria-label")).toBe("Inspector sections");
    const tabs = [...(list?.querySelectorAll('[role="tab"]') ?? [])];
    expect(
      tabs.map((tab) => [
        tab.tagName,
        tab.id,
        tab.textContent?.trim(),
        tab.getAttribute("aria-controls"),
      ]),
    ).toEqual([
      ["BUTTON", TABS[0], "Properties", PANELS[0]],
      ["BUTTON", TABS[1], "Manifest", PANELS[1]],
      ["BUTTON", "inspector-tab-journal", "Journal", "inspector-panel-journal"],
    ]);
    expect(
      PANELS.map((id) => {
        const panel = document.getElementById(id);
        return [
          panel?.getAttribute("role"),
          panel?.getAttribute("aria-labelledby"),
          panel?.getAttribute("tabindex"),
        ];
      }),
    ).toEqual([
      ["tabpanel", TABS[0], null],
      ["tabpanel", TABS[1], null],
    ]);
    expect(state()).toEqual(PROPERTIES);
    const [properties, manifest] = PANELS.map((id) => document.getElementById(id));
    expect(document.querySelector('form[aria-label="Block properties"]')?.parentElement).toBe(
      properties,
    );
    expect(
      [
        document.querySelector('[role="radiogroup"]'),
        ...document.querySelectorAll('input[type="checkbox"]'),
        textarea(),
      ].map((item) => manifest?.contains(item as Node)),
    ).toEqual([true, true, true, true]);
    expect(
      [...document.querySelectorAll('.options input[type="checkbox"]')].map((item) => [
        item.closest("label")?.textContent?.trim(),
        (item as HTMLInputElement).checked,
      ]),
    ).toEqual([
      ["Include styling", false],
      ["Minimal", false],
    ]);
    openTab("Manifest");
    expect(state()).toEqual(MANIFEST);
    openTab("Properties");
    expect(state()).toEqual(PROPERTIES);
  });

  it("moves between the tabs with the arrows, Home and End", () => {
    show(storeOf(), [A]);
    const steps: [string, unknown[], string][] = [
      ["ArrowRight", MANIFEST, TABS[1] as string],
      ["ArrowLeft", PROPERTIES, TABS[0] as string],
      ["Home", PROPERTIES, TABS[0] as string],
      ["ArrowRight", MANIFEST, TABS[1] as string],
      ["ArrowLeft", PROPERTIES, TABS[0] as string],
    ];
    (document.getElementById(TABS[0] as string) as HTMLElement).focus();
    for (const [key, expected, focused] of steps) {
      press(document.activeElement as HTMLElement, key);
      expect([key, state(), document.activeElement?.id]).toEqual([key, expected, focused]);
    }
  });

  it("leaves a key held with Alt, Ctrl or Meta to the browser", () => {
    show(storeOf(), [A]);
    const properties = document.getElementById(TABS[0] as string) as HTMLElement;
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
      expect([modifier, state(), document.activeElement?.id, event.defaultPrevented]).toEqual([
        modifier,
        PROPERTIES,
        TABS[0],
        false,
      ]);
    }
  });

  it("holds the manifest's controls, problems, warnings and notices in the Manifest panel, in order", () => {
    const { store } = warningCase("timeline_class.json");
    show(store, [A]);
    openTab("Manifest");
    type(textarea(), textarea().value.replace('"meta": {}', '"meta": {"note": "edited"}'));
    const root = store.view.blocks[A]?.manifest.timelines[0]?.id;
    store.dispatch({ type: "set", changes: [{ target: `${A}/${root}`, values: { name: "Bye" } }] });
    flushSync();
    const [properties, manifest] = PANELS.map((id) => document.getElementById(id)) as [
      HTMLElement,
      HTMLElement,
    ];
    expect(
      [
        ...manifest.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement>(
          "input, textarea, button",
        ),
      ].map((item) => [item.tagName, item.labels?.[0]?.textContent?.trim() ?? item.textContent]),
    ).toEqual([
      ["INPUT", "JSON"],
      ["INPUT", "YAML"],
      ["INPUT", "TOML"],
      ["INPUT", "Include styling"],
      ["INPUT", "Minimal"],
      ["TEXTAREA", "Manifest (JSON)"],
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
      document.getElementById("inspector-problems"),
      document.getElementById("inspector-warnings"),
    ] as Node[];
    const notices = [
      document.getElementById("inspector-switch-hint"),
      document.querySelector(".notice"),
    ] as Node[];
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
    const selected = show(store, [A]);
    openTab("Manifest");
    selected.value = new Set([B]);
    flushSync();
    expect(state()).toEqual(MANIFEST);
    selected.value = new Set();
    flushSync();
    expect(hinted()).toEqual([HINT, HINT, null, null]);
    expect(state()).toEqual(MANIFEST);
    selected.value = new Set([B]);
    flushSync();
    expect(state()).toEqual(MANIFEST);
    unmount(app as never);
    show(store, [B]);
    expect(state()).toEqual(PROPERTIES);
  });

  it("keeps an unapplied text while Properties is shown", () => {
    show(storeOf(), [A]);
    openTab("Manifest");
    const edited = textarea().value.replace('"Bare"', '"Bared"');
    type(textarea(), edited);
    openTab("Properties");
    openTab("Manifest");
    expect(textarea().value).toBe(edited);
    expect([button("Apply").disabled, button("Revert").disabled]).toEqual([false, false]);
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
    const written = manifestText(manifestOf(store.view.blocks[B] as Block), "json", options);
    if (!written.ok) throw new Error("not written");
    return written.value.text;
  }

  for (const [mode, options] of MODES) {
    it(`are enabled exactly while the text is edited (${mode})`, () => {
      const store = storeOf();
      show(store, [B]);
      openTab("Manifest");
      const [styling, minimal] = [
        ...document.querySelectorAll<HTMLInputElement>('.options input[type="checkbox"]'),
      ] as [HTMLInputElement, HTMLInputElement];
      if (options.includeStyling) styling.click();
      if (options.minimal) minimal.click();
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
      expect(
        [...document.querySelectorAll("#inspector-problems .code")].map((item) => item.textContent),
      ).toEqual(["syntax_error"]);
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
      expect(document.querySelectorAll("#inspector-problems li")).toHaveLength(0);
      expect(disabled()).toEqual([true, true]);
    });
  }
});

describe("a clean text", () => {
  const buttons = () => [button("Apply").disabled, button("Revert").disabled];
  const listed = () =>
    [...document.querySelectorAll("#inspector-problems li")].map((item) => [
      item.querySelector(".code")?.textContent,
      item.querySelector(".pointer")?.textContent,
    ]);

  it("follows the store at once when a stale text is typed back to the shown text", () => {
    const store = storeOf();
    show(store, [A]);
    openTab("Manifest");
    const shown = textarea().value;
    const edited = shown.replace('"Bare"', '"Bared"');
    type(textarea(), edited);
    store.dispatch({ type: "set", changes: [{ target: `${A}/bare`, values: { name: "Bye" } }] });
    flushSync();
    expect(document.querySelector(".notice")?.textContent).toBe(
      "The manifest changed; Revert to see it",
    );
    expect(textarea().value).toBe(edited);
    type(textarea(), shown);
    expect(document.querySelector(".notice")).toBe(null);
    const stored = manifestText(manifestOf(store.view.blocks[A] as Block), "json", COMPLETE);
    if (!stored.ok) throw new Error("not written");
    expect(textarea().value).toBe(stored.value.text);
    expect(textarea().value).toContain('"name": "Bye"');
    expect(buttons()).toEqual([true, true]);
    expect(store.journal).toHaveLength(3);
  });

  it("drops a refused Apply's problems when typed back to the shown text", () => {
    const store = storeOf();
    show(store, [A]);
    openTab("Manifest");
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
    const store = createStore({ view: createView(), journal: [], sessions: {} });
    const manifest = loadManifest(
      dumps({
        timeskeleton: SCHEMA_VERSION,
        timelines: [
          {
            id: "score",
            unit: "quarters",
            length: [4, 1],
            measure_map: [
              { count: 1, qstamp: 0, number: 1, actual_length: 4, nominal_length: null },
            ],
          },
        ],
      }),
    );
    if (isLoadError(manifest)) throw new Error("refused");
    const error = store.dispatch({
      type: "add",
      into: "workspace",
      block: { id: A, manifest, x: 0, y: 0 },
    });
    if (error !== null) throw new Error(error.message);
    show(store, [A]);
    openTab("Manifest");
    (document.querySelector('input[value="toml"]') as HTMLInputElement).click();
    flushSync();
    await loadCodec("toml");
    flushSync();
    const unrepresentable = [["not_representable", "/timelines/0/measure_map/0/nominal_length"]];
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
    show(store, [A]);
    const scale = () => document.querySelector('input[name="scale"]') as HTMLInputElement;
    type(scale(), "0");
    press(scale(), "Enter");
    expect(store.journal).toHaveLength(2);
    expect(scale().value).toBe("0");
    expect(document.querySelector("#property-problem-scale")).not.toBe(null);
    openTab("Manifest");
    type(textarea(), textarea().value.replace('"Bare"', '"Bared"'));
    button("Apply").click();
    flushSync();
    expect(store.journal).toHaveLength(3);
    expect(document.getElementById("inspector-tab-manifest")?.getAttribute("aria-selected")).toBe(
      "true",
    );
    openTab("Properties");
    expect(scale().value).toBe("1");
    expect(document.querySelector("#property-problem-scale")).toBe(null);
  });
});

describe("the inspector's warnings", () => {
  const cases = readdirSync(warningsDirectory)
    .filter((name) => name.endsWith(".json"))
    .sort();

  /** Each listed warning as its key and its JSON pointer. */
  const listed = () =>
    [...document.querySelectorAll("#inspector-warnings li")].map((item) => [
      item.querySelector(".key")?.textContent,
      item.querySelector(".pointer")?.textContent ?? item.querySelector(".where")?.textContent,
    ]);

  it("loads every case in core", () => {
    expect(
      cases.flatMap((name) => {
        const { manifest } = read(name);
        return isLoadError(manifest) ? [[name, manifest.problems[0]?.code]] : [];
      }),
    ).toEqual([]);
  });

  for (const name of cases) {
    it(`lists every unknown key of ${name} with its path, and editing continues`, () => {
      const { store, expected } = warningCase(name);
      show(store, [A]);
      openTab("Manifest");
      expect(document.querySelector("#inspector-warnings")?.getAttribute("aria-label")).toBe(
        "Warnings",
      );
      expect(listed()).toEqual(
        expected.map((item) => [
          item.key,
          item.path.length === 0 ? "at the top level" : problemPointer(item),
        ]),
      );
      expect(document.querySelectorAll("#inspector-problems li")).toHaveLength(0);
      const text = manifestText(manifestOf(store.view.blocks[A] as Block), "json", COMPLETE);
      if (!text.ok) throw new Error("not written");
      expect(textarea().value).toBe(text.value.text);
      type(textarea(), textarea().value.replace('"meta": {}', '"meta": {"note": "edited"}'));
      button("Apply").click();
      flushSync();
      expect(store.journal).toHaveLength(2);
      expect(listed()).toHaveLength(expected.length);
    });
  }

  it("shows no warning list for a manifest without unknown keys", () => {
    show(storeOf(), [A]);
    expect(document.querySelector("#inspector-warnings")).toBe(null);
  });
});
