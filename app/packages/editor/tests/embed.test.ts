/** The embeddable editor through `mount`; what proves each case is stated in `README.md` ("Embedding"). */

import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recoverWorkspace } from "../src/autosave.ts";
import type { TimeLineEditor } from "../src/embed.ts";
import { mount } from "../src/embed.ts";
import { stubEditor } from "./dom.ts";
import { blockId, flushAutosaves, interceptDownloads, workspaceOf } from "./support.ts";

vi.mock("../src/autosave.ts", async (importOriginal) =>
  (await import("./support.ts")).recordAutosaves(await importOriginal()),
);

const A = blockId(0);

/** The editors mounted by the running test, destroyed after it. */
const mounted: TimeLineEditor[] = [];

/** A host element appended to the body. */
function host(): HTMLElement {
  const element = document.createElement("div");
  document.body.append(element);
  return element;
}

function embed(element: HTMLElement, options: Parameters<typeof mount>[1] = {}): TimeLineEditor {
  const editor = mount(element, options);
  mounted.push(editor);
  flushSync();
  return editor;
}

/** Dispatch Ctrl+S on `target`; whether the editor took it. */
function save(target: EventTarget): boolean {
  const event = new KeyboardEvent("keydown", {
    key: "s",
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
  flushSync();
  return event.defaultPrevented;
}

function canvasOf(element: HTMLElement): HTMLElement {
  const canvas = element.querySelector<HTMLElement>('[role="application"]');
  if (canvas === null) throw new Error("the canvas is missing");
  return canvas;
}

/** Record the listeners added to and removed from `window` from now on. */
function watchWindowListeners(): () => [string, number][] {
  const added = vi.spyOn(window, "addEventListener");
  const removed = vi.spyOn(window, "removeEventListener");
  /** Each event type whose listeners were added and removed a different number of times. */
  return () => {
    const counts = new Map<string, number>();
    for (const [type] of added.mock.calls) counts.set(type, (counts.get(type) ?? 0) + 1);
    for (const [type] of removed.mock.calls) counts.set(type, (counts.get(type) ?? 0) - 1);
    return [...counts].filter(([, count]) => count !== 0);
  };
}

beforeEach(() => {
  stubEditor();
  localStorage.clear();
});

afterEach(async () => {
  await Promise.all(mounted.splice(0).map((editor) => editor.destroy()));
  await flushAutosaves();
  document.body.innerHTML = "";
  document.body.removeAttribute("style");
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("mount", () => {
  it("leaves the host page untouched", () => {
    window.history.replaceState({}, "", "/host?page=1#part");
    document.title = "Host";
    document.body.style.margin = "7px";
    const href = location.href;
    const entries = history.length;
    const fetchStub = vi.fn();
    vi.stubGlobal("fetch", fetchStub);
    const open = vi.spyOn(indexedDB, "open");

    const element = host();
    embed(element);

    expect(element.childElementCount).toBe(1);
    expect(element.hasAttribute("data-tilie")).toBe(true);
    expect(element.querySelectorAll("h1").length).toBe(0);
    expect([document.body.style.margin, document.title]).toEqual(["7px", "Host"]);
    expect([location.href, history.length]).toEqual([href, entries]);
    expect([fetchStub.mock.calls.length, open.mock.calls.length]).toEqual([0, 0]);
    expect(localStorage.length).toBe(0);
    expect(window.__tilie).toBeUndefined();
    expect(document.querySelectorAll('[data-testid="fixture-select"]').length).toBe(0);
    expect(
      Array.from(
        element.querySelectorAll('button[aria-haspopup="menu"]'),
        (button) => button.textContent,
      ),
    ).toEqual(["File"]);
    expect(element.querySelector('[data-testid="about-server"]')?.textContent).toBe("no server");
  });

  it("shows the workspace it is given and gives its text back byte for byte", () => {
    const text = workspaceOf("bare", "nested");
    const editor = embed(host(), { workspace: text });
    expect(editor.text()).toBe(text);
  });

  it("reports one status after a command on its canvas", () => {
    const onchange = vi.fn();
    const element = host();
    const editor = embed(element, { workspace: workspaceOf("bare"), onchange });
    expect(onchange.mock.calls).toEqual([[{ fileName: "untitled.tle.json", dirty: false }]]);
    onchange.mockClear();

    editor.select([{ block: A }]);
    flushSync();
    canvasOf(element).dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
    flushSync();
    expect(onchange.mock.calls).toEqual([[{ fileName: "untitled.tle.json", dirty: true }]]);
  });

  it("takes its shortcuts inside its own element only", () => {
    interceptDownloads();
    const input = document.createElement("input");
    document.body.append(input);
    const element = host();
    embed(element);

    expect(save(input)).toBe(false);
    expect(save(document.body)).toBe(false);
    expect(save(canvasOf(element))).toBe(true);
  });

  it("keeps two instances apart: their ids and their selections", () => {
    const onselect = [vi.fn(), vi.fn()] as const;
    const elements = [host(), host()] as const;
    const first = embed(elements[0], { workspace: workspaceOf("bare"), onselect: onselect[0] });
    const second = embed(elements[1], { workspace: workspaceOf("bare"), onselect: onselect[1] });
    const ids = elements.map((element) =>
      Array.from(element.querySelectorAll("[id]"), (node) => node.id),
    );
    const all = ids.flat();
    expect(ids.every((list) => list.length > 0)).toBe(true);
    expect(new Set(all).size).toBe(all.length);

    first.select([{ block: A }]);
    flushSync();
    expect([first.selection(), second.selection()]).toEqual([[{ block: A }], []]);
    expect([onselect[0].mock.calls, onselect[1].mock.calls]).toEqual([[[[{ block: A }]]], []]);
  });

  it("selects the addresses it can read and names the problem of each other", () => {
    const element = host();
    const editor = embed(element, { workspace: workspaceOf("bare") });
    editor.select([{ block: A }, { block: A, facet: "markers" }, { block: "B" }]);
    flushSync();
    expect(editor.selection()).toEqual([{ block: A }]);
    const message = element.querySelector('[data-testid="message"]');
    expect(message?.querySelector("p")?.textContent).toBe("Some addresses could not be selected.");
    const problems = Array.from(message?.querySelectorAll("li") ?? [], (item) =>
      item.textContent?.replace(/\s+/g, " ").trim(),
    );
    expect(problems).toEqual([
      "invalid_address a facet stands with an id at /addresses/1",
      "invalid_address an address's block is a block id at /addresses/2",
    ]);
  });

  it("refuses a text the reader refuses and keeps its workspace", () => {
    const text = workspaceOf("bare");
    const editor = embed(host(), { workspace: text });
    const refusal = editor.load("{");
    expect(refusal?.problems.map(({ code }) => code)).toEqual(["invalid_json"]);
    expect(editor.text()).toBe(text);
  });

  it("refuses a workspace whose journal does not reproduce it and keeps its own", () => {
    const text = workspaceOf("bare");
    const editor = embed(host(), { workspace: text });
    // The block stays in the view, but no journal entry adds it.
    const unjournalled = JSON.stringify({ ...JSON.parse(workspaceOf("bare")), journal: [] });
    const refusal = editor.load(unjournalled);
    expect(refusal?.problems.map(({ code, path }) => [code, path])).toEqual([
      ["journal_mismatch", ["blocks", A]],
    ]);
    expect(editor.text()).toBe(text);
  });

  it("refuses an element that holds an editor or anything else", () => {
    const element = host();
    embed(element);
    expect(() => mount(element)).toThrow(new Error("the element already holds a TimeLineEditor"));
    const filled = host();
    filled.append(document.createElement("p"));
    expect(() => mount(filled)).toThrow(
      new Error("the element for a TimeLineEditor must be empty"),
    );
  });
});

describe("destroy", () => {
  it("empties the element and removes every window listener it added", async () => {
    interceptDownloads();
    const unbalanced = watchWindowListeners();
    const element = host();
    const editor = mount(element, { shortcuts: "window" });
    flushSync();
    expect(save(document.body)).toBe(true);

    await editor.destroy();
    expect([element.childNodes.length, element.hasAttribute("data-tilie")]).toEqual([0, false]);
    expect(unbalanced()).toEqual([]);
    expect(save(document.body)).toBe(false);
    // The element takes an editor again.
    mounted.push(mount(element));
  });

  it("writes the pending autosave before it unmounts", async () => {
    const element = host();
    const editor = mount(element, {
      storage: { slot: "embedded", inspectorKey: "embedded.inspector" },
    });
    flushSync();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(editor.load(workspaceOf("bare"), "piece.tle.json")).toBe(null);
    editor.select([{ block: A }]);
    flushSync();
    canvasOf(element).dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
    flushSync();
    const text = editor.text();

    await editor.destroy();
    expect(await recoverWorkspace("embedded")).toEqual({ text, name: "piece.tle.json" });
  });
});
