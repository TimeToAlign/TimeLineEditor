/// <reference types="node" />
/** The inspector component's wiring; the expected values are derived in `README.md` ("The inspector"). */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { Store } from "@timetoalign/tilie-core";
import {
  createStore,
  createView,
  isLoadError,
  loadManifest,
  saveManifest,
} from "@timetoalign/tilie-core";
import { SCHEMA_VERSION } from "@timetoalign/timeskeleton";
import { flushSync, mount, unmount } from "svelte";
import { afterEach, describe, expect, it } from "vitest";
import { loadCodec, writeText } from "../src/inspector/formats.ts";
import Inspector from "../src/inspector/Inspector.svelte";
import { liveHolder } from "./live.svelte.ts";

const A = "0000000000";
const B = "0000000001";
const HINT = "Select a block to inspect its manifest.";

const directory = path.join(
  path.dirname(createRequire(import.meta.url).resolve("@timetoalign/timeskeleton/package.json")),
  "fixtures",
  SCHEMA_VERSION,
);

/** A store holding `bare` in block A and `styled__score` in block B. */
function storeOf(): Store {
  const store = createStore({ view: createView(), journal: [] });
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

let app: ReturnType<typeof mount> | undefined;

function show(store: Store, selection: string[], live = liveHolder()): void {
  app = mount(Inspector, {
    target: document.body,
    props: {
      store,
      selection: new Set(selection),
      get live() {
        return live.value;
      },
    },
  });
  flushSync();
}

function press(element: HTMLElement, key: string): void {
  element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
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
    expect(document.body.textContent?.trim()).toBe(HINT);
    unmount(app as never);
    show(store, [A, `${B}/score`]);
    expect(document.body.textContent?.trim()).toBe(HINT);
  });

  it("shows a loading state until the YAML codec is there", async () => {
    const store = storeOf();
    show(store, [A]);
    (document.querySelector('input[value="yaml"]') as HTMLInputElement).click();
    flushSync();
    expect(document.querySelector(".loading")?.textContent).toBe("Loading YAML…");
    expect(document.querySelector("textarea")).toBe(null);
    await loadCodec("yaml");
    flushSync();
    expect(document.querySelector(".loading")).toBe(null);
    expect(textarea().value.startsWith("meta:\n")).toBe(true);
  });

  it("shows, switches, applies and follows the manifest", async () => {
    const store = storeOf();
    show(store, [`${A}/bare`]);
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
      document.querySelector('input[type="checkbox"]'),
    ];
    expect(switches.map((item) => item?.getAttribute("aria-describedby"))).toEqual([
      "inspector-switch-hint",
      "inspector-switch-hint",
    ]);
    expect(
      [
        ...document.querySelectorAll<HTMLInputElement>(
          'input[type="radio"], input[type="checkbox"]',
        ),
      ].map((item) => item.disabled),
    ).toEqual([true, true, true, true]);
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
    expect(textarea().value).toContain("  name: Bye\n");
    expect(textarea().value).toContain("  locked: false\n");
    expect(document.querySelector(".notice")).toBe(null);
  });

  it("lists a refusal and keeps the edit", () => {
    const store = storeOf();
    show(store, [A]);
    const edited = textarea().value.replace('"locked": false', '"locked": "yes"');
    type(textarea(), edited);
    button("Apply").click();
    flushSync();
    const items = [...document.querySelectorAll("#inspector-problems li")];
    expect(items.map((item) => item.textContent?.replace(/\s+/g, " ").trim())).toEqual([
      "schema_violation must be boolean at /timeline/locked",
    ]);
    expect(items[0]?.querySelector(".code")?.textContent).toBe("schema_violation");
    expect(items[0]?.querySelector(".pointer")?.textContent).toBe("/timeline/locked");
    expect(textarea().value).toBe(edited);
    expect(store.journal).toHaveLength(2);
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
    expect(store.journal[2]?.command).toEqual({
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
    expect(store.journal[3]?.command).toEqual({
      type: "set",
      changes: [{ target: A, values: { x: 11.123 } }],
    });
    expect(x.value).toBe("11.12");
    press(x, "ArrowDown");
    expect(store.journal).toHaveLength(5);
    expect(store.journal[4]?.command).toEqual({
      type: "set",
      changes: [{ target: A, values: { x: 10.123 } }],
    });
    type(x, "20");
    press(x, "ArrowUp");
    expect(store.journal).toHaveLength(6);
    expect(store.journal[5]?.command).toEqual({
      type: "set",
      changes: [{ target: A, values: { x: 21 } }],
    });
    expect(x.value).toBe("21");
    const scale = document.querySelector('input[name="scale"]') as HTMLInputElement;
    press(scale, "ArrowDown");
    expect(store.journal).toHaveLength(7);
    expect(store.journal[6]?.command).toEqual({
      type: "set",
      changes: [{ target: A, values: { scale: 0.9 } }],
    });
    expect(scale.value).toBe("0.9");
  });

  it("shows live values of its block, never over a draft", () => {
    const store = storeOf();
    const live = liveHolder();
    show(store, [A], live);
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
    live.value = placement;
    flushSync();
    expect(field("x").value).toBe("5.56");
    type(field("y"), "33");
    live.value = { ...placement, y: 7 };
    flushSync();
    expect(field("y").value).toBe("33");
    live.value = { ...placement, id: B, x: 99 };
    flushSync();
    expect(field("x").value).toBe("0");
    live.value = null;
    flushSync();
    expect(field("x").value).toBe("0");
    expect(store.journal).toHaveLength(2);
  });
});
