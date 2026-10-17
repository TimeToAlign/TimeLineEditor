/// <reference types="node" />
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { CommandEntry, Manifest } from "@timetoalign/tilie-core";
import {
  createStore,
  createView,
  isLoadError,
  isSessionEntry,
  loadManifest,
  manifestIds,
  readWorkspace,
  writeWorkspace,
} from "@timetoalign/tilie-core";
import { SCHEMA_VERSION } from "@timetoalign/timeskeleton";
import { flushSync, mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App.svelte";
import { WorkspaceRefusedError } from "../src/testHook.ts";
import { stubEditor } from "./dom.ts";

const A = "0000000000";
/** The end-to-end workspaces the fixture menu offers. */
const E2E_FIXTURES = path.join(import.meta.dirname, "..", "..", "..", "e2e", "fixtures");
const B = "0000000001";

/** The manifest fixtures of the installed schema package's version. */
function fixtureDirectory(): string {
  return path.join(
    path.dirname(createRequire(import.meta.url).resolve("@timetoalign/timeskeleton/package.json")),
    "fixtures",
    SCHEMA_VERSION,
  );
}

/** A workspace file of two blocks holding manifest fixtures, written through the store. */
function workspaceText(): string {
  const directory = fixtureDirectory();
  const manifest = (name: string) => {
    const loaded = loadManifest(readFileSync(path.join(directory, `${name}.json`), "utf8"));
    if (isLoadError(loaded)) throw new Error(`${name} refused`);
    return loaded;
  };
  const store = createStore({ view: createView(), journal: [], sessions: {} });
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
  return writeWorkspace({ view: store.view, journal: store.journal, sessions: store.sessions });
}

/** The text of a group or bundle fixture of the installed schema package. */
function manifestFixtureText(name: string): string {
  const kind = name.startsWith("group_") ? "groups" : "bundles";
  return readFileSync(path.join(fixtureDirectory(), kind, `${name}.json`), "utf8");
}

/** Choose `name` in the header's fixture menu, press Load and wait until a store holds it. */
async function loadFromMenu(name: string): Promise<void> {
  const select = document.querySelector<HTMLSelectElement>('[data-testid="fixture-select"]');
  const load = document.querySelector<HTMLButtonElement>('[data-testid="fixture-load"]');
  if (select === null || load === null) throw new Error("the fixture menu is missing");
  const before = window.__tilie?.store();
  select.value = name;
  select.dispatchEvent(new Event("change"));
  load.click();
  await vi.waitFor(() => {
    expect(window.__tilie?.store()).not.toBe(before);
  });
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

  afterEach(() => {
    if (app !== undefined) unmount(app);
    app = undefined;
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
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

    await vi.waitFor(() => {
      expect(hook().store().view).toEqual(expected.view);
    });
    expect(hook().store().journal).toEqual(expected.journal);
    expect(hook().selection()).toEqual([]);
  });

  it("opens a group or bundle fixture as one block of its manifest", async () => {
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

  it("removes a timeline of a group or bundle block on Delete", async () => {
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
    const text = workspaceText();
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

  it("is removed when the editor is unmounted", () => {
    expect(window.__tilie).toBeDefined();
    if (app !== undefined) unmount(app);
    app = undefined;
    expect(window.__tilie).toBeUndefined();
  });
});
