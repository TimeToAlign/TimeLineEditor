/// <reference types="node" />
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import {
  createStore,
  createView,
  isLoadError,
  loadManifest,
  readWorkspace,
  writeWorkspace,
} from "@timetoalign/tilie-core";
import { SCHEMA_VERSION } from "@timetoalign/timeskeleton";
import { flushSync, mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App.svelte";
import { WorkspaceRefusedError } from "../src/testHook.ts";
import { stubLayout } from "./dom.ts";

const A = "0000000000";
const B = "0000000001";

/** A workspace file of two blocks holding manifest fixtures, written through the store. */
function workspaceText(): string {
  const directory = path.join(
    path.dirname(createRequire(import.meta.url).resolve("@timetoalign/timeskeleton/package.json")),
    "fixtures",
    SCHEMA_VERSION,
  );
  const manifest = (name: string) => {
    const loaded = loadManifest(readFileSync(path.join(directory, `${name}.json`), "utf8"));
    if (isLoadError(loaded)) throw new Error(`${name} refused`);
    return loaded;
  };
  const store = createStore({ view: createView(), journal: [] });
  for (const [id, name, x] of [
    [A, "bare", 0],
    [B, "nested", 800],
  ] as const) {
    const error = store.dispatch({
      type: "add",
      into: "workspace",
      block: { id, manifest: manifest(name), x, y: 0 },
    });
    if (error !== null) throw new Error(error.message);
  }
  return writeWorkspace({ view: store.view, journal: store.journal });
}

describe("the test hook", () => {
  let app: ReturnType<typeof mount> | undefined;

  beforeEach(() => {
    window.history.replaceState({}, "", "/");
    stubLayout();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ name: "tilie-server", version: "0", timetoalign: "0" })),
    );
    app = mount(App, { target: document.body });
    flushSync();
  });

  afterEach(() => {
    if (app !== undefined) unmount(app);
    app = undefined;
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
  });

  function hook() {
    const installed = window.__tilie;
    if (installed === undefined) throw new Error("window.__tilie is not installed");
    return installed;
  }

  it("starts on an empty workspace with the viewer's defaults", () => {
    expect(hook().store().view).toEqual(createView());
    expect(hook().store().journal).toEqual([]);
    expect(hook().selection()).toEqual([]);
    expect(hook().locked()).toBe(false);
    expect(hook().mode()).toBe("scale");
  });

  it("loads a workspace file into a new store and clears the selection", () => {
    const text = workspaceText();
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
    expect(writeWorkspace({ view: hook().store().view, journal: hook().store().journal })).toBe(
      text,
    );
    expect(hook().selection()).toEqual([]);
  });

  it("refuses a file the reader refuses and keeps the open workspace", () => {
    hook().load(workspaceText());
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

  it("offers the end-to-end workspaces in the header and loads the chosen one", async () => {
    const select = document.querySelector<HTMLSelectElement>('[data-testid="fixture-select"]');
    const load = document.querySelector<HTMLButtonElement>('[data-testid="fixture-load"]');
    if (select === null || load === null) throw new Error("the fixture menu is missing");
    expect(Array.from(select.options, (option) => option.value)).toEqual([
      "grid-300",
      "grid-900",
      "small",
    ]);
    expect(select.labels?.[0]?.textContent?.trim().startsWith("Fixture")).toBe(true);

    const text = readFileSync(
      path.join(import.meta.dirname, "..", "..", "..", "e2e", "fixtures", "small.tle.json"),
      "utf8",
    );
    const expected = readWorkspace(text);
    if (isLoadError(expected)) throw new Error("small.tle.json is refused");
    hook().select([A]);
    select.value = "small";
    select.dispatchEvent(new Event("change"));
    load.click();

    await vi.waitFor(() => {
      expect(hook().store().view).toEqual(expected.view);
    });
    expect(hook().store().journal).toEqual(expected.journal);
    expect(hook().selection()).toEqual([]);
  });

  it("is removed when the editor is unmounted", () => {
    expect(window.__tilie).toBeDefined();
    if (app !== undefined) unmount(app);
    app = undefined;
    expect(window.__tilie).toBeUndefined();
  });
});
