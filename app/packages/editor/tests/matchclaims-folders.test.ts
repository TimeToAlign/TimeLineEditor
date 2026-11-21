/** The manifest's folder; the expected values are derived in `README.md` ("MatchClaims and the Matchstamp tab", item 9d). */

import { DEFAULT_USER, emptyWorkspace } from "@timetoalign/tilie-core";
import { fontMetrics } from "@timetoalign/timetoshare";
import { afterEach, describe, expect, it, vi } from "vitest";
import { folderPath, readInFolder } from "../src/files.ts";
import type {
  AskTables,
  FolderMemory,
  MatchClaimServer,
  TableChoice,
  TableRequest,
} from "../src/matchClaims.svelte.ts";
import { MatchClaimTables } from "../src/matchClaims.svelte.ts";
import { WorkspaceSession } from "../src/workspaceSession.svelte.ts";
import { matchTable, TABLE_MANIFEST_TEXT, tableManifest } from "./matches.ts";

/** A folder's content: files by name, and folders by name. */
interface Tree {
  readonly [name: string]: Blob | Tree;
}

/** What a folder's permission calls answer: the state queried, then the state a request gives. */
interface Permission {
  readonly query: PermissionState;
  readonly request: PermissionState;
}

/** An in-memory directory handle over `tree`, counting its permission requests. */
function folder(
  name: string,
  tree: Tree,
  permission: Permission | null = null,
): FileSystemDirectoryHandle & { readonly requests: number } {
  let requests = 0;
  const missing = (entry: string) => new DOMException(`no ${entry}`, "NotFoundError");
  const fileHandle = (entry: string, blob: Blob) => ({
    kind: "file" as const,
    name: entry,
    getFile: async () => new File([blob], entry),
  });
  const handle = {
    kind: "directory" as const,
    name,
    get requests() {
      return requests;
    },
    async getDirectoryHandle(entry: string) {
      const found = tree[entry];
      if (found === undefined) throw missing(entry);
      if (found instanceof Blob) throw new DOMException(entry, "TypeMismatchError");
      return folder(entry, found, permission);
    },
    async getFileHandle(entry: string) {
      const found = tree[entry];
      if (found === undefined) throw missing(entry);
      if (!(found instanceof Blob)) throw new DOMException(entry, "TypeMismatchError");
      return fileHandle(entry, found);
    },
    async *values() {
      for (const [entry, found] of Object.entries(tree)) {
        yield found instanceof Blob
          ? fileHandle(entry, found)
          : folder(entry, found as Tree, permission);
      }
    },
    ...(permission === null
      ? {}
      : {
          queryPermission: async () => permission.query,
          requestPermission: async () => {
            requests += 1;
            return permission.request;
          },
        }),
  };
  return handle as unknown as FileSystemDirectoryHandle & { readonly requests: number };
}

const MATCH_CLAIMS = new Blob(["PAR1 claims PAR1"]);
const PROJECTIONS = new Blob(["PAR1 projections PAR1"]);

/** The table fixture's folder: its manifest, a YAML file that is no manifest, and both tables. */
function packageFolder(permission: Permission | null = null, tables = true) {
  return folder(
    "pkg",
    {
      "manifest.yaml": new Blob([TABLE_MANIFEST_TEXT]),
      "expected.yaml": new Blob(["cases: []\n"]),
      ...(tables
        ? { "match_claims.parquet": MATCH_CLAIMS, "projections.parquet": PROJECTIONS }
        : {}),
    },
    permission,
  );
}

/** A server answering every table with the test table, recording each table file sent. */
function serving() {
  const sent: Blob[] = [];
  const server: MatchClaimServer = {
    matchClaims: async (_manifest, file) => {
      sent.push(file);
      return matchTable();
    },
    matchClaimProvenance: async () => {
      throw new Error("loading asks no provenance");
    },
    believeMatchClaim: async () => {
      throw new Error("loading records no belief");
    },
    matchClaimEvents: async () => {
      throw new Error("loading asks no events");
    },
  };
  return { server, sent };
}

/** The user answering every question with `choices`, recording the questions. */
function answering(choices: readonly TableChoice[] | null) {
  const questions: TableRequest[] = [];
  const ask: AskTables = async (request) => {
    questions.push(request);
    return choices;
  };
  return { ask, questions };
}

/** A folder memory in a map, recording what it was asked to keep. */
function memory(kept: Record<string, FileSystemDirectoryHandle> = {}) {
  const folders = new Map(Object.entries(kept));
  const remembered: [string, string][] = [];
  const forgotten: string[] = [];
  const memo: FolderMemory = {
    recall: async (block) => folders.get(block) ?? null,
    remember: async (block, handle) => {
      remembered.push([block, handle.name]);
      folders.set(block, handle);
    },
    forget: async (block) => {
      forgotten.push(block);
      folders.delete(block);
    },
  };
  return { memo, remembered, forgotten };
}

const canvas = {
  visible: () => ({ x: 0, y: 0, zoom: 1, width: 0, height: 0 }),
  focus: () => undefined,
};

const LOADED_BOTH = [
  "Loaded the MatchClaims of match_claims.parquet.",
  "Loaded the Projections of projections.parquet.",
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a location in a folder", () => {
  it("is the relative URL's path, decoded, with . and .. applied", () => {
    expect(
      [
        "match_claims.parquet",
        "./data/a%20b.parquet",
        "data/../p.parquet",
        "../p.parquet",
        "/p.parquet",
        "https://h/p.parquet",
        "file:p.parquet",
        "",
      ].map(folderPath),
    ).toEqual([
      ["match_claims.parquet"],
      ["data", "a b.parquet"],
      ["p.parquet"],
      null,
      null,
      null,
      null,
      null,
    ]);
  });

  it("is read from the folder, null where it holds none", async () => {
    const tree = folder("pkg", {
      data: { "a b.parquet": new Blob(["x"]) },
      "p.parquet": PROJECTIONS,
    });
    expect(await (await readInFolder(tree, "./data/a%20b.parquet"))?.text()).toBe("x");
    expect(await (await readInFolder(tree, "p.parquet"))?.text()).toBe(await PROJECTIONS.text());
    expect(await readInFolder(tree, "other.parquet")).toBe(null);
    expect(await readInFolder(tree, "missing/p.parquet")).toBe(null);
    expect(await readInFolder(tree, "p.parquet/x")).toBe(null);
    expect(await readInFolder(tree, "../p.parquet")).toBe(null);
  });

  it("is read only where the browser lets the page read the folder", async () => {
    const granted = folder(
      "pkg",
      { "p.parquet": PROJECTIONS },
      { query: "granted", request: "denied" },
    );
    const asked = folder(
      "pkg",
      { "p.parquet": PROJECTIONS },
      { query: "prompt", request: "granted" },
    );
    const denied = folder(
      "pkg",
      { "p.parquet": PROJECTIONS },
      { query: "prompt", request: "denied" },
    );
    expect((await readInFolder(granted, "p.parquet")) === null).toBe(false);
    expect(granted.requests).toBe(0);
    expect((await readInFolder(asked, "p.parquet")) === null).toBe(false);
    expect(asked.requests).toBe(1);
    expect(await readInFolder(denied, "p.parquet")).toBe(null);
    expect(denied.requests).toBe(1);
  });
});

describe("the folder chosen in the dialog", () => {
  it("gives every table it holds, and is kept as the block's", async () => {
    const { server, sent } = serving();
    const chosen = packageFolder();
    const { ask } = answering([{ folder: chosen }]);
    const { memo, remembered } = memory();
    const tables = new MatchClaimTables(server, ask, memo);
    expect(await tables.loadNamed("b", tableManifest())).toEqual({
      informed: LOADED_BOTH,
      warned: [],
    });
    expect(await Promise.all(sent.map((file) => file.text()))).toEqual([await MATCH_CLAIMS.text()]);
    expect(tables.of("b")?.name).toBe("match_claims.parquet");
    expect(tables.projectionsOf("b")?.name).toBe("projections.parquet");
    expect(await tables.projectionsOf("b")?.file.text()).toBe(await PROJECTIONS.text());
    expect(remembered).toEqual([["b", "pkg"]]);
  });

  it("says which table it does not hold", async () => {
    const { server } = serving();
    const chosen = folder("pkg", { "match_claims.parquet": MATCH_CLAIMS });
    const tables = new MatchClaimTables(server, answering([{ folder: chosen }]).ask);
    expect(await tables.loadNamed("b", tableManifest())).toEqual({
      informed: ["Loaded the MatchClaims of match_claims.parquet."],
      warned: ["The folder pkg holds no projections.parquet."],
    });
    expect(tables.projectionsOf("b")).toBe(null);
  });
});

describe("a kept folder", () => {
  it("gives the tables without a question", async () => {
    const { server } = serving();
    const { ask, questions } = answering(null);
    const tables = new MatchClaimTables(server, ask, memory({ b: packageFolder() }).memo);
    expect(await tables.loadNamed("b", tableManifest())).toEqual({
      informed: LOADED_BOTH,
      warned: [],
    });
    expect(questions).toEqual([]);
  });

  it("no longer readable, asks as before", async () => {
    const { server } = serving();
    const { ask, questions } = answering(null);
    const denied = packageFolder({ query: "prompt", request: "denied" });
    const tables = new MatchClaimTables(server, ask, memory({ b: denied }).memo);
    expect(await tables.loadNamed("b", tableManifest())).toEqual({ informed: [], warned: [] });
    expect(questions.map(({ tables: asked }) => asked)).toEqual([
      [
        { type: "MatchClaim", url: "match_claims.parquet" },
        { type: "Projection", url: "projections.parquet" },
      ],
    ]);
  });
});

describe("Import manifest from folder…", () => {
  function session(server: MatchClaimServer, memo: FolderMemory) {
    const warned: string[] = [];
    const informed: string[] = [];
    const { ask, questions } = answering(null);
    const opened = new WorkspaceSession({
      warn: (text) => warned.push(text),
      inform: (text) => informed.push(text),
      author: () => DEFAULT_USER.name,
      matchClaims: server,
      askTables: ask,
      folders: memo,
    });
    return { opened, warned, informed, questions };
  }

  it("imports the folder's manifests, keeping the folder for their tables", async () => {
    const { server, sent } = serving();
    const { memo, remembered } = memory();
    const { opened, warned, informed, questions } = session(server, memo);
    vi.stubGlobal(
      "showDirectoryPicker",
      vi.fn(async () => packageFolder()),
    );
    await opened.importFolder(canvas, fontMetrics);
    const blocks = Object.keys(opened.store.view.blocks);
    expect(blocks.length).toBe(1);
    expect(opened.store.journal.length).toBe(1);
    expect(informed).toEqual(["Left expected.yaml in pkg: no manifest."]);
    expect(warned).toEqual([
      `The manifest names the MatchClaim table match_claims.parquet, which is not loaded: Show matches (M) loads it.`,
    ]);
    expect(remembered).toEqual([[blocks[0], "pkg"]]);

    await opened.loadNamedTables();
    expect(questions).toEqual([]);
    expect(await Promise.all(sent.map((file) => file.text()))).toEqual([await MATCH_CLAIMS.text()]);
    expect(informed.slice(1)).toEqual(LOADED_BOTH);
  });

  it("forgets the folder of a block that leaves the workspace, never of one that leaves with it", async () => {
    const { server, sent } = serving();
    const { memo, forgotten } = memory();
    const { opened, questions } = session(server, memo);
    vi.stubGlobal(
      "showDirectoryPicker",
      vi.fn(async () => packageFolder()),
    );
    await opened.importFolder(canvas, fontMetrics);
    const [block] = Object.keys(opened.store.view.blocks);
    if (block === undefined) throw new Error("one block is imported");
    expect(opened.store.dispatch({ type: "remove", targets: [{ block }] })).toBe(null);
    expect(forgotten).toEqual([block]);
    opened.step(true);
    expect(Object.keys(opened.store.view.blocks)).toEqual([block]);
    expect(forgotten).toEqual([block]);
    await opened.loadNamedTables();
    expect(questions).toEqual([]);
    expect(sent.length).toBe(1);

    opened.replace(emptyWorkspace(), "untitled", null, true);
    expect(forgotten).toEqual([block]);
  });

  it("adds nothing from a folder holding no manifest, nor from a cancelled picker", async () => {
    const { server } = serving();
    const { opened, warned } = session(server, memory().memo);
    vi.stubGlobal(
      "showDirectoryPicker",
      vi.fn(async () => folder("pkg", { "expected.yaml": new Blob(["cases: []\n"]) })),
    );
    await opened.importFolder(canvas, fontMetrics);
    expect(warned).toEqual(["The folder pkg holds no manifest TimeLineEditor can import."]);
    vi.stubGlobal(
      "showDirectoryPicker",
      vi.fn(async () => {
        throw new DOMException("cancelled", "AbortError");
      }),
    );
    await opened.importFolder(canvas, fontMetrics);
    expect([Object.keys(opened.store.view.blocks), warned.length]).toEqual([[], 1]);
  });
});
