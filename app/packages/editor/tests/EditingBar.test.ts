/** The editing bar; the expected values are derived in `README.md` ("Editing"). */

import { liveStore } from "@timetoalign/tilie-arranger";
import type { Manifest, Store } from "@timetoalign/tilie-core";
import { createStore, createView, isLoadError, loadManifest } from "@timetoalign/tilie-core";
import { flushSync, mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EditingBar from "../src/inspector/EditingBar.svelte";
import { editorName } from "../src/inspector/journal.ts";
import { stubEditor } from "./dom.ts";
import { fixture, fixtureText } from "./support.ts";

const A = "0000000000";
const B = "0000000001";
const C = "0000000002";

/** `bundle_mixed` known only by id: its `name` and its group `group_2`'s `name` deleted, its `id` `mixed`. */
function idOnly(): Manifest {
  const value = JSON.parse(fixtureText("bundles/bundle_mixed"));
  delete value.name;
  value.id = "mixed";
  delete value.groups[1].name;
  const manifest = loadManifest(JSON.stringify(value));
  if (isLoadError(manifest)) throw new Error("the id-only bundle is refused");
  return manifest;
}

/** A store holding `bundle_mixed` in A, `nested` in B and the id-only bundle in C. */
function storeOf(): Store {
  const store = createStore({ view: createView(), journal: [], sessions: {} });
  for (const [id, manifest] of [
    [A, fixture("bundles/bundle_mixed")],
    [B, fixture("nested")],
    [C, idOnly()],
  ] as const) {
    const error = store.dispatch({
      type: "add",
      into: "workspace",
      block: { id, manifest, x: 0, y: 0 },
    });
    if (error !== null) throw new Error(error.message);
  }
  return store;
}

function rename(store: Store, target: string, name: string): void {
  const error = store.dispatch({ type: "set", changes: [{ target, values: { name } }] });
  if (error !== null) throw new Error(error.message);
  flushSync();
}

function open(store: Store, ...targets: string[]): void {
  for (const target of targets) {
    const error = store.open(target);
    if (error !== null) throw new Error(error.message);
  }
  flushSync();
}

let bar: ReturnType<typeof mount> | undefined;

function show(store: Store): void {
  bar = mount(EditingBar, { target: document.body, props: { live: liveStore(store) } });
  flushSync();
}

function group(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[role="group"][aria-label="Editing"]');
}

function path(): string[] {
  return [...document.querySelectorAll('ol[aria-label="Editing path"] > li')].map(
    (item) => item.textContent ?? "",
  );
}

function button(text: string, within: ParentNode = document): HTMLButtonElement {
  const found = [...within.querySelectorAll("button")].find((item) => item.textContent === text);
  if (found === undefined) throw new Error(`no button ${text}`);
  return found;
}

function dialog(): HTMLDialogElement {
  const found = document.querySelector("dialog");
  if (found === null) throw new Error("no dialog");
  return found;
}

/** Click Cancel and wait for the question to open. */
async function ask(): Promise<HTMLDialogElement> {
  button("Cancel").click();
  await vi.waitFor(() => expect(dialog().open).toBe(true));
  return dialog();
}

beforeEach(() => {
  stubEditor();
});

afterEach(() => {
  if (bar !== undefined) unmount(bar);
  bar = undefined;
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("the editing bar", () => {
  it("renders nothing while no editor is open", () => {
    show(storeOf());
    expect(document.body.children.length).toBe(0);
  });

  it("offers Done and Cancel, then the editing path", () => {
    const store = storeOf();
    show(store);
    open(store, A);

    const bars = document.querySelectorAll('[role="group"][aria-label="Editing"]');
    expect(bars.length).toBe(1);
    const shown = group() as HTMLElement;
    const buttons = [...shown.querySelectorAll(":scope > button")];
    expect(buttons.map((item) => item.textContent)).toEqual(["Done", "Cancel"]);
    expect(buttons.map((item) => item.className.split(" ").includes("done"))).toEqual([
      true,
      false,
    ]);
    expect(buttons.map((item) => item.className.split(" ").includes("cancel"))).toEqual([
      false,
      true,
    ]);
    const label = buttons[1]?.nextElementSibling;
    expect(label?.textContent).toBe("Editing:");
    expect(label?.nextElementSibling?.tagName).toBe("OL");
    expect(label?.nextElementSibling?.getAttribute("aria-label")).toBe("Editing path");
  });

  it("names each open editor, outermost first, as the view names it", () => {
    const store = storeOf();
    show(store);

    open(store, A);
    expect(path()).toEqual(["Mixed"]);
    open(store, `${A}/group_1`);
    expect(path()).toEqual(["Mixed", "Performance"]);
    open(store, `${A}/score`);
    expect(path()).toEqual(["Mixed", "Performance", "Score"]);
    rename(store, `${A}/score`, "S");
    expect(path()).toEqual(["Mixed", "Performance", "S"]);

    store.cancel();
    store.cancel();
    store.cancel();
    open(store, B, `${B}/clt_1`, `${B}/clt_3`);
    expect(path()).toEqual(["Anonymous bundle", "clt_1", "clt_3"]);

    store.cancel();
    store.cancel();
    store.cancel();
    open(store, C, `${C}/group_2`);
    expect(path()).toEqual(["mixed", "group_2"]);
  });

  it("closes the innermost editor with Done", () => {
    const store = storeOf();
    show(store);
    open(store, A, `${A}/group_1`, `${A}/score`);

    const lengths: number[] = [];
    for (let step = 0; step < 3; step += 1) {
      button("Done").click();
      flushSync();
      lengths.push(store.editing.length);
    }
    expect(lengths).toEqual([2, 1, 0]);
    expect(document.body.children.length).toBe(0);
  });

  it("closes at once on Cancel when the editor holds no change", () => {
    const store = storeOf();
    const showModal = vi.spyOn(HTMLDialogElement.prototype, "showModal");
    show(store);
    open(store, `${A}/score`);

    button("Cancel").click();
    flushSync();

    expect(store.editing).toEqual([]);
    expect(showModal).not.toHaveBeenCalled();
  });

  it("asks before Cancel discards a change, and keeps it on No, Escape and the backdrop", async () => {
    const store = storeOf();
    show(store);
    const before = store.view;
    const journal = store.journal.length;
    open(store, `${A}/score`);
    rename(store, `${A}/score`, "S");

    const question = await ask();
    expect(question.querySelector("p")?.textContent).toBe(
      "Are you sure you want to discard 1 change?",
    );
    expect([...question.querySelectorAll("button")].map((item) => item.textContent)).toEqual([
      "Yes",
      "No",
    ]);
    expect(document.activeElement).toBe(button("No", question));

    const kept = () => {
      flushSync();
      expect(dialog().open).toBe(false);
      expect(store.editing.length).toBe(1);
      expect(store.changes).toBe(1);
      expect(editorName(store.view, `${A}/score`)).toBe("S");
    };

    button("No", question).click();
    kept();

    // Escape as the browser handles it: a cancelable `cancel`, then the dialog closes.
    const escaped = await ask();
    const cancel = new Event("cancel", { cancelable: true });
    escaped.dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(false);
    escaped.close();
    kept();

    const backdrop = await ask();
    backdrop.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    kept();

    const inside = await ask();
    inside.querySelector("p")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    flushSync();
    expect(inside.open).toBe(true);

    button("Yes", inside).click();
    flushSync();
    expect(store.editing).toEqual([]);
    expect(store.view).toBe(before);
    expect(store.journal.length).toBe(journal);
    expect(document.querySelector("dialog")).toBeNull();
  });

  it("counts the changes as the store does", async () => {
    const store = storeOf();
    show(store);
    open(store, `${A}/score`);
    rename(store, `${A}/score`, "S");
    rename(store, `${A}/score`, "T");

    const question = await ask();
    expect(question.querySelector("p")?.textContent).toBe(
      "Are you sure you want to discard 2 changes?",
    );
  });
});
