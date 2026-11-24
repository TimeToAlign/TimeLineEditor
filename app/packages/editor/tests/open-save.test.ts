/** Open… with a manifest, and Save into the opened file; derived in `README.md` ("Files"). */

import { ServerError } from "@timetoalign/tilie-client";
import {
  createStore,
  DEFAULT_USER,
  emptyWorkspace,
  isLoadError,
  readManifestFile,
  readWorkspace,
  writeWorkspace,
} from "@timetoalign/tilie-core";
import { fontMetrics } from "@timetoalign/timetoshare";
import { flushSync, mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App.svelte";
import type { Snapshot } from "../src/autosave.ts";
import type { TableRequest } from "../src/matchClaims.svelte.ts";
import type { FileHost } from "../src/workspaceSession.svelte.ts";
import { WorkspaceSession } from "../src/workspaceSession.svelte.ts";
import { stubEditor } from "./dom.ts";
import { matchTable, TABLE_MANIFEST_TEXT } from "./matches.ts";
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

/** The file's name as the page's title shows it, "• " first while unsaved. */
function fileName(): string {
  return document.title.replace(/ – TimeLineEditor$/u, "");
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

describe("through the server", () => {
  const MANIFEST = "story/step1.yaml";
  const TABLE = "story/step1.match_claims.parquet";
  const SAVED = "work/layerit.tle.json";
  const STEP_TEXT = TABLE_MANIFEST_TEXT.replace(
    "url: match_claims.parquet",
    "url: step1.match_claims.parquet",
  ).replace(/^timelines:/m, "name: LayerIt\ntimelines:");
  const canvas = {
    visible: () => ({ x: 0, y: 0, zoom: 1, width: 0, height: 0 }),
    focus: () => undefined,
  };

  /**
   * A server holding `story/step1.yaml` and its table, recording every read
   * and write, and a file dialog answering the paths queued in `answers`,
   * recording every call; `refuse` makes the next writes fail.
   */
  function hosting() {
    const held = new Map<string, Blob>([
      [MANIFEST, new Blob([STEP_TEXT])],
      [TABLE, new Blob(["PAR1"])],
    ]);
    const record = {
      held,
      reads: [] as string[],
      writes: [] as [string, string][],
      opens: [] as [string[], string][],
      saves: [] as [string, string, string][],
      answers: [] as (string | null)[],
      refuse: false,
    };
    const host: FileHost = {
      server: {
        async readFile(path) {
          record.reads.push(path);
          const found = held.get(path);
          if (found === undefined) throw new ServerError("status", 404, "no such file");
          return found;
        },
        async writeFile(path, content) {
          if (record.refuse) throw new ServerError("status", 404, "no such folder");
          const text = typeof content === "string" ? content : await content.text();
          record.writes.push([path, text]);
          held.set(path, new Blob([text]));
          return { path, size: text.length };
        },
      },
      open: async (kinds, start) => {
        record.opens.push([kinds.map((kind) => kind.description), start]);
        return record.answers.shift() ?? null;
      },
      save: async (kind, start, suggested) => {
        record.saves.push([kind.description, start, suggested]);
        return record.answers.shift() ?? null;
      },
    };
    return { host, record };
  }

  /** A session over `host`, its tables read by a stubbed table route, its questions and messages recorded. */
  function session(host: FileHost) {
    const said = { info: [] as string[], warning: [] as string[], error: [] as string[] };
    const questions: TableRequest[] = [];
    const opened = new WorkspaceSession({
      post: (level, text) => said[level].push(text),
      author: () => DEFAULT_USER.name,
      matchClaims: {
        matchClaims: async () => matchTable(),
        matchClaimProvenance: async () => [],
        believeMatchClaim: async () => new Blob([]),
        matchClaimEvents: async () => [],
      },
      askTables: async (request) => {
        questions.push(request);
        return null;
      },
      files: () => host,
    });
    return { opened, said, questions };
  }

  /** The location the text `text` states for block `block`. */
  function locationIn(text: string, block: string): unknown {
    const value = JSON.parse(text) as {
      settings: { manifests: { [block: string]: { location?: string } } };
    };
    return value.settings.manifests[block]?.location;
  }

  /** Import the manifest into a new session's unsaved workspace and save it as `work/layerit.tle.json`. */
  async function savedLayerIt() {
    const { host, record } = hosting();
    const { opened, said } = session(host);
    record.answers.push(MANIFEST);
    await opened.importManifest(canvas, fontMetrics);
    const [block = ""] = Object.keys(opened.store.view.blocks);
    record.answers.push(SAVED);
    await opened.save(false);
    return { host, record, opened, said, block };
  }

  it("keeps where an imported manifest lies, relative to the workspace's folder", async () => {
    const { host, record } = hosting();
    const { opened } = session(host);
    record.answers.push(MANIFEST);
    await opened.importManifest(canvas, fontMetrics);
    const [block = ""] = Object.keys(opened.store.view.blocks);
    expect(record.opens).toEqual([[["TimeToShare manifest"], ""]]);
    expect(record.reads).toEqual([MANIFEST]);
    const read = readManifestFile(STEP_TEXT);
    if (isLoadError(read)) throw new Error("refused");
    expect(opened.store.view.settings.manifests[block]).toEqual({
      ...read.file,
      location: MANIFEST,
    });
    expect(opened.store.journal.length).toBe(1);
  });

  it("saves as a path chosen, the locations relative to its folder", async () => {
    const { record, opened, block } = await savedLayerIt();
    expect(record.saves).toEqual([["TimeLineEditor workspace", "story", "untitled.tle.json"]]);
    expect(record.writes.map(([path]) => path)).toEqual([SAVED]);
    const [[, text] = ["", ""]] = record.writes;
    expect(locationIn(text, block)).toBe("../story/step1.yaml");
    expect(text).toBe(opened.text());
    expect([opened.path, opened.fileName, opened.dirty]).toEqual([
      SAVED,
      "layerit.tle.json",
      false,
    ]);
  });

  it("loads the table beside the manifest when the saved workspace is opened again", async () => {
    const { host, record } = await savedLayerIt();
    const again = session(host);
    expect(await again.opened.openPath(host, SAVED)).toBe(null);
    expect([again.opened.path, again.opened.fileName]).toEqual([SAVED, "layerit.tle.json"]);
    record.reads.length = 0;
    await again.opened.loadNamedTables();
    expect(record.reads).toEqual([TABLE]);
    expect(again.questions).toEqual([]);
    expect(again.said).toEqual({
      info: ["Loaded the MatchClaims of step1.match_claims.parquet."],
      warning: [],
      error: [],
    });

    record.held.delete(TABLE);
    const missing = session(host);
    expect(await missing.opened.openPath(host, SAVED)).toBe(null);
    await missing.opened.loadNamedTables();
    expect(
      missing.questions.map(({ manifest, table, question }) => [
        manifest,
        table.url,
        question.kind,
        question.kind === "table" ? question.missing : undefined,
      ]),
    ).toEqual([["LayerIt", "step1.match_claims.parquet", "table", MANIFEST]]);
  });

  it("asks where to save after a rename, and writes in place once it is undone", async () => {
    const { host, record } = await savedLayerIt();
    const { opened } = session(host);
    expect(await opened.openPath(host, SAVED)).toBe(null);
    record.saves.length = 0;
    record.writes.length = 0;
    expect(opened.rename("LayerIt")).toBe(null);
    record.answers.push(null);
    await opened.save(false);
    expect([record.saves, record.writes]).toEqual([
      [["TimeLineEditor workspace", "work", "LayerIt.tle.json"]],
      [],
    ]);
    opened.step(true);
    await opened.save(false);
    expect(record.writes.map(([path]) => path)).toEqual([SAVED]);
    expect(record.saves.length).toBe(1);
    // The store's refusal, as the store words it.
    expect(opened.rename("")).toBe("a name is a non-empty string");
  });

  it("saves a restored workspace back to the path its snapshot kept", async () => {
    const { host, record, opened } = await savedLayerIt();
    const restored = session(host).opened;
    const workspace = readWorkspace(opened.text());
    if (isLoadError(workspace)) throw new Error("refused");
    expect(restored.replace(workspace, "layerit.tle.json", null, false, SAVED)).toBe(null);
    record.saves.length = 0;
    record.writes.length = 0;
    await restored.save(false);
    expect([record.saves, record.writes.map(([path]) => path)]).toEqual([[], [SAVED]]);
  });

  it("rewrites the locations for another folder, and changes nothing when the write fails", async () => {
    const { record, opened, said, block } = await savedLayerIt();
    record.refuse = true;
    record.answers.push("layerit.tle.json");
    await opened.save(true);
    expect(said.error).toEqual(["The workspace could not be saved: no such folder"]);
    expect([
      opened.store.view.settings.manifests[block]?.location,
      opened.path,
      opened.dirty,
    ]).toEqual(["../story/step1.yaml", SAVED, false]);

    record.refuse = false;
    record.answers.push("layerit.tle.json");
    await opened.save(true);
    const [path, text = ""] = record.writes.at(-1) ?? [];
    expect([path, locationIn(text, block)]).toEqual(["layerit.tle.json", MANIFEST]);
    expect([opened.store.view.settings.manifests[block]?.location, opened.dirty]).toEqual([
      MANIFEST,
      false,
    ]);
  });

  it("opens a workspace or a manifest chosen in the dialog", async () => {
    const { host, record } = await savedLayerIt();
    const { opened } = session(host);
    record.opens.length = 0;
    record.answers.push(SAVED);
    expect(await opened.chooseOpened(host)).toBe(SAVED);
    expect(record.opens).toEqual([[["TimeLineEditor workspace", "TimeToShare manifest"], ""]]);
  });
});
