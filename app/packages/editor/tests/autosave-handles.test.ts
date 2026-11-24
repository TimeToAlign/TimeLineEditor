/** Where a snapshot's file lies, kept in IndexedDB; the cases are derived in `README.md` ("Autosave"). */

import { DEFAULT_USER } from "@timetoalign/tilie-core";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAutosave, recoverWorkspace } from "../src/autosave.ts";
import { startAutosave } from "../src/autosaving.ts";
import { WorkspaceSession } from "../src/workspaceSession.svelte.ts";
import { fixture } from "./support.ts";

beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A file handle as IndexedDB can store one: data only. */
const STORABLE = { kind: "file", name: "w.tle.json" } as unknown as FileSystemFileHandle;
/** A handle IndexedDB cannot store: it holds a function. */
const UNSTORABLE = {
  kind: "file",
  name: "w.tle.json",
  getFile: () => undefined,
} as unknown as FileSystemFileHandle;

describe("a snapshot's handle", () => {
  it("is recovered with the snapshot", async () => {
    const autosave = createAutosave({ key: "w", delayMs: 100 });
    autosave.schedule({ text: "one", name: "w.tle.json", handle: STORABLE });
    await autosave.flush();
    expect(await recoverWorkspace("w")).toEqual({
      text: "one",
      name: "w.tle.json",
      handle: STORABLE,
    });
  });

  it("is left out where IndexedDB cannot store it", async () => {
    const autosave = createAutosave({ key: "w", delayMs: 100 });
    autosave.schedule({ text: "one", name: "w.tle.json", handle: UNSTORABLE });
    await autosave.flush();
    expect(await recoverWorkspace("w")).toEqual({ text: "one", name: "w.tle.json" });
  });

  it("is written by the editor's autosave beside the workspace's text", async () => {
    const session = new WorkspaceSession({
      post: () => undefined,
      author: () => DEFAULT_USER.name,
    });
    session.handle = STORABLE;
    const autosaving = startAutosave(session, {
      slot: "current",
      delayMs: 100,
      post: () => undefined,
      ask: async () => null,
    });
    await vi.waitFor(async () => expect(await recoverWorkspace("current")).toBe(null));
    expect(
      session.store.dispatch({
        type: "add",
        into: {},
        block: { id: "000000000a", manifest: fixture("bare"), x: 0, y: 0 },
      }),
    ).toBeNull();
    await vi.waitFor(async () => {
      await autosaving.flush();
      expect((await recoverWorkspace("current"))?.handle).toEqual(STORABLE);
    });
    autosaving.stop();
    session.dispose();
  });
});

describe("a snapshot's path on the server", () => {
  it("is recovered with the snapshot", async () => {
    const autosave = createAutosave({ key: "w", delayMs: 100 });
    autosave.schedule({ text: "one", name: "w.tle.json", path: "work/w.tle.json" });
    await autosave.flush();
    expect(await recoverWorkspace("w")).toEqual({
      text: "one",
      name: "w.tle.json",
      path: "work/w.tle.json",
    });
  });

  it("is written by the editor's autosave beside the workspace's text", async () => {
    const session = new WorkspaceSession({
      post: () => undefined,
      author: () => DEFAULT_USER.name,
    });
    session.path = "work/w.tle.json";
    const autosaving = startAutosave(session, {
      slot: "current",
      delayMs: 100,
      post: () => undefined,
      ask: async () => null,
    });
    await vi.waitFor(async () => expect(await recoverWorkspace("current")).toBe(null));
    expect(
      session.store.dispatch({
        type: "add",
        into: {},
        block: { id: "000000000a", manifest: fixture("bare"), x: 0, y: 0 },
      }),
    ).toBeNull();
    await vi.waitFor(async () => {
      await autosaving.flush();
      expect((await recoverWorkspace("current"))?.path).toBe("work/w.tle.json");
    });
    autosaving.stop();
    session.dispose();
  });
});
