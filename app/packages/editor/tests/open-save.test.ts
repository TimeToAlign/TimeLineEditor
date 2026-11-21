/** Open… with a manifest, and Save into the opened file; derived in `README.md` ("Files"). */

import { createStore, emptyWorkspace, writeWorkspace } from "@timetoalign/tilie-core";
import { flushSync, mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App.svelte";
import type { Snapshot } from "../src/autosave.ts";
import { stubEditor } from "./dom.ts";
import {
  answer,
  fixture,
  fixtureText,
  flushAutosaves,
  hook,
  interceptDownloads,
  openDialog,
  pickFile,
  slotsRead,
  workspaceOf,
} from "./support.ts";

/** What the slot `current` gives instead of IndexedDB's snapshot, while set. */
const recovered = vi.hoisted(() => ({ snapshot: null as Snapshot | null }));

vi.mock("../src/autosave.ts", async (importOriginal) => {
  const recorded = (await import("./support.ts")).recordAutosaves(await importOriginal());
  return {
    ...recorded,
    recoverWorkspace: (key: string) =>
      recovered.snapshot === null
        ? recorded.recoverWorkspace(key)
        : Promise.resolve(recovered.snapshot),
  };
});

let app: ReturnType<typeof mount> | undefined;

function start(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ name: "tilie-server", version: "0.1.0" })),
  );
  app = mount(App, { target: document.body });
  flushSync();
}

beforeEach(() => {
  window.history.replaceState({}, "", "/");
  stubEditor();
});

afterEach(async () => {
  if (app !== undefined) unmount(app);
  app = undefined;
  recovered.snapshot = null;
  await flushAutosaves();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function choose(label: string): void {
  document.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')?.click();
  flushSync();
  const found = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(
    (entry) => entry.querySelector("span")?.textContent === label,
  );
  if (found === undefined) throw new Error(`no menu item ${label}`);
  found.click();
  flushSync();
}

function key(init: KeyboardEventInit): void {
  document.body.dispatchEvent(
    new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }),
  );
  flushSync();
}

function fileName(): string {
  return document.querySelector('[data-testid="file-name"]')?.textContent ?? "";
}

function blocks(): number {
  return Object.keys(hook().store().view.blocks).length;
}

/** The text Save writes of the open store. */
function written(): string {
  return writeWorkspace(hook().store().snapshot());
}

/** Add `bare` as one more block through the open store. */
function addBlock(id: string): void {
  const refusal = hook()
    .store()
    .dispatch({ type: "add", into: {}, block: { id, manifest: fixture("bare"), x: 0, y: 0 } });
  if (refusal !== null) throw new Error(refusal.message);
  flushSync();
}

/** Open… with the fallback input answered by `bare.yaml`; the input. */
async function openBare(): Promise<HTMLInputElement> {
  choose("Open…");
  let input: HTMLInputElement | undefined;
  await vi.waitFor(() => {
    input = pickFile("bare.yaml", fixtureText("bare"));
  });
  if (input === undefined) throw new Error("no input");
  return input;
}

const QUESTION = {
  question: "Add bare.yaml to the open workspace, or open it in a new, empty workspace?",
  answers: ["Add", "New workspace", "Cancel"],
};

describe("Open… with a manifest", () => {
  it("imports it into an empty workspace without a question", async () => {
    start();
    const input = await openBare();
    expect(input.accept).toBe(".tle.json,.json,.yaml,.yml,.parquet");
    await vi.waitFor(() => expect(blocks()).toBe(1));
    expect([hook().store().journal.length, openDialog()]).toEqual([1, null]);
  });

  it("asks whether to add it, or to open it in a new, empty workspace", async () => {
    start();
    hook().load(workspaceOf("bare"));
    const saved = hook().store();
    await openBare();
    await vi.waitFor(() => expect(openDialog()).toEqual(QUESTION));
    expect(document.activeElement?.textContent).toBe("Add");
    answer("Cancel");
    await vi.waitFor(() => expect(openDialog()).toBe(null));
    expect([hook().store() === saved, blocks()]).toEqual([true, 1]);

    await openBare();
    await vi.waitFor(() => expect(openDialog()).toEqual(QUESTION));
    answer("Add");
    await vi.waitFor(() => expect(blocks()).toBe(2));

    const downloads = interceptDownloads();
    const unsaved = written();
    await openBare();
    await vi.waitFor(() => expect(openDialog()).toEqual(QUESTION));
    answer("New workspace");
    await vi.waitFor(() => expect(blocks()).toBe(1));
    expect(downloads).toEqual([["untitled.tle.json", unsaved]]);
    expect([hook().store().view.name, hook().store().journal.length, fileName()]).toEqual([
      "untitled",
      1,
      "• untitled.tle.json",
    ]);
  });

  it("opens it in a new workspace at once from a saved one, and not at all when the save is cancelled", async () => {
    start();
    const downloads = interceptDownloads();
    hook().load(workspaceOf("bare"));
    const saved = hook().store();
    await openBare();
    await vi.waitFor(() => expect(openDialog()).toEqual(QUESTION));
    answer("New workspace");
    await vi.waitFor(() => expect(hook().store()).not.toBe(saved));
    expect([downloads, blocks(), hook().store().journal.length]).toEqual([[], 1, 1]);

    vi.stubGlobal(
      "showSaveFilePicker",
      vi.fn(async () => {
        throw new DOMException("cancelled", "AbortError");
      }),
    );
    const kept = hook().store();
    await openBare();
    await vi.waitFor(() => expect(openDialog()).toEqual(QUESTION));
    answer("New workspace");
    await vi.waitFor(() => expect(openDialog()).toBe(null));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect([hook().store() === kept, blocks()]).toEqual([true, 1]);
  });
});

/** A file handle holding `text`, recording what is written into it; its permission calls answer as given. */
function fileHandle(
  name: string,
  text: string,
  permission: { query: PermissionState; request: PermissionState } | null = {
    query: "granted",
    request: "granted",
  },
  refuse = false,
) {
  const writes: string[] = [];
  const handle = {
    kind: "file",
    name,
    getFile: async () => new File([text], name),
    createWritable: async () => {
      if (refuse) throw new DOMException("refused", "NotAllowedError");
      return {
        write: async (data: string) => {
          writes.push(data);
        },
        close: async () => undefined,
      };
    },
    ...(permission === null
      ? {}
      : {
          queryPermission: async () => permission.query,
          requestPermission: async () => permission.request,
        }),
  } as unknown as FileSystemFileHandle;
  return { handle, writes };
}

/** Open the workspace file held by `handle` through the File System Access picker. */
async function openHandle(handle: FileSystemFileHandle): Promise<void> {
  vi.stubGlobal(
    "showOpenFilePicker",
    vi.fn(async () => [handle]),
  );
  choose("Open…");
  await vi.waitFor(() => expect(fileName()).toBe(handle.name));
}

const EMPTY = writeWorkspace(createStore(emptyWorkspace()).snapshot());

describe("Save into the opened file", () => {
  it("writes into the file's handle where the browser lets it, asking for no file", async () => {
    start();
    const saving = vi.fn();
    vi.stubGlobal("showSaveFilePicker", saving);
    for (const [name, permission] of [
      ["w.tle.json", { query: "granted", request: "denied" }],
      ["v.tle.json", { query: "prompt", request: "granted" }],
    ] as const) {
      const opened = fileHandle(name, EMPTY, permission);
      await openHandle(opened.handle);
      addBlock("000000000a");
      expect(fileName()).toBe(`• ${name}`);
      const text = written();
      key({ key: "s", ctrlKey: true });
      await vi.waitFor(() => expect(opened.writes).toEqual([text]));
      expect(fileName()).toBe(name);
    }
    expect(saving).not.toHaveBeenCalled();
  });

  it("picks a file, as Save as, where the browser refuses writing; Save as always picks", async () => {
    start();
    for (const [permission, refuse] of [
      [{ query: "prompt", request: "denied" }, false],
      [{ query: "granted", request: "granted" }, true],
    ] as const) {
      const opened = fileHandle("w.tle.json", EMPTY, permission, refuse);
      const picked = fileHandle("other.tle.json", "");
      const saving = vi.fn(async () => picked.handle);
      vi.stubGlobal("showSaveFilePicker", saving);
      await openHandle(opened.handle);
      addBlock("000000000a");
      const text = written();
      key({ key: "s", ctrlKey: true });
      await vi.waitFor(() => expect(picked.writes).toEqual([text]));
      expect([opened.writes, saving.mock.calls.length, fileName()]).toEqual([
        [],
        1,
        "other.tle.json",
      ]);
    }

    const opened = fileHandle("w.tle.json", EMPTY);
    const picked = fileHandle("copy.tle.json", "");
    vi.stubGlobal(
      "showSaveFilePicker",
      vi.fn(async () => picked.handle),
    );
    await openHandle(opened.handle);
    key({ key: "s", ctrlKey: true, shiftKey: true });
    await vi.waitFor(() => expect(picked.writes).toEqual([EMPTY]));
    expect([opened.writes, fileName()]).toEqual([[], "copy.tle.json"]);
  });

  it("writes a restored workspace into the handle its autosave kept", async () => {
    const store = createStore(emptyWorkspace());
    expect(
      store.dispatch({
        type: "add",
        into: {},
        block: { id: "000000000a", manifest: fixture("bare"), x: 0, y: 0 },
      }),
    ).toBeNull();
    const text = writeWorkspace(store.snapshot());
    const kept = fileHandle("score.tle.json", EMPTY);
    recovered.snapshot = { text, name: "score.tle.json", handle: kept.handle };
    start();
    await slotsRead();
    await vi.waitFor(() => expect(openDialog()?.answers).toEqual(["Restore", "Discard"]));
    answer("Restore");
    await vi.waitFor(() => expect(fileName()).toBe("• score.tle.json"));
    key({ key: "s", ctrlKey: true });
    await vi.waitFor(() => expect(kept.writes).toEqual([text]));
    expect(fileName()).toBe("score.tle.json");
  });
});
