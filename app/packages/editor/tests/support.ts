/// <reference types="node" />
/**
 * Fixtures and file stubs for the editor's tests: manifests from the
 * installed `@timetoalign/timetoshare`, workspaces and stores built of
 * them, the test hook of a mounted page, the fallback file input answered
 * with a chosen file, downloads recorded instead of performed, the
 * autosaves of mounted editors waited for between tests, and the open
 * editor of a level.
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { Editing, Level } from "@timetoalign/tilie-arranger";
import type { Manifest, Store } from "@timetoalign/tilie-core";
import { createStore, isLoadError, loadManifest, readWorkspace } from "@timetoalign/tilie-core";
import { SCHEMA_VERSION } from "@timetoalign/timetoshare";
import { vi } from "vitest";
import type { Autosave, AutosaveOptions } from "../src/autosave.ts";
import { fixtureWorkspace } from "../src/fixtureWorkspace.ts";
import type { TestHook } from "../src/testHook.ts";

const directory = path.join(
  path.dirname(createRequire(import.meta.url).resolve("@timetoalign/timetoshare/package.json")),
  "fixtures",
  SCHEMA_VERSION,
);

/** The text of a manifest fixture of the installed schema version. */
export function fixtureText(name: string): string {
  return readFileSync(path.join(directory, `${name}.json`), "utf8");
}

/** A manifest fixture, failing loudly if it is refused. */
export function fixture(name: string): Manifest {
  const manifest = loadManifest(fixtureText(name));
  if (isLoadError(manifest)) throw new Error(`${name} refused`);
  return manifest;
}

/** The id of the `index`th block of `workspaceOf`: `0000000000`, `0000000001`, … */
export function blockId(index: number): string {
  return String(index).padStart(10, "0");
}

/**
 * The workspace text of one block per manifest, each given whole or as a
 * fixture's name: the `index`th as block `blockId(index)` at (800 · index, 0),
 * journalled as one `add` each (`fixtureWorkspace`).
 */
export function workspaceOf(...manifests: readonly (string | Manifest)[]): string {
  return fixtureWorkspace(
    manifests.map(
      (manifest, index) =>
        [
          blockId(index),
          typeof manifest === "string" ? fixture(manifest) : manifest,
          800 * index,
          0,
        ] as const,
    ),
  );
}

/** A store opened on `workspaceOf(...manifests)`. */
export function storeOf(...manifests: readonly (string | Manifest)[]): Store {
  const workspace = readWorkspace(workspaceOf(...manifests));
  if (isLoadError(workspace)) throw new Error("the written workspace is refused");
  return createStore(workspace);
}

/** The installed test hook of the mounted page. */
export function hook(): TestHook {
  const installed = window.__tilie;
  if (installed === undefined) throw new Error("window.__tilie is not installed");
  return installed;
}

/** Answer the pending fallback file input with the file `name` holding `text`; returns the input. */
export function pickFile(name: string, text: string): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>("input[type=file]");
  if (input === null) throw new Error("no file input is waiting");
  Object.defineProperty(input, "files", { value: [new File([text], name)] });
  input.dispatchEvent(new Event("change"));
  return input;
}

/**
 * Record downloads instead of performing them: each clicked download link
 * adds `[file name, text]`, once its blob is read. jsdom has no object URLs,
 * so each call installs its own (the link stub is undone by
 * `vi.restoreAllMocks()`).
 */
export function interceptDownloads(): [string, string][] {
  const blobs = new Map<string, Blob>();
  const downloads: [string, string][] = [];
  URL.createObjectURL = (blob: Blob) => {
    const url = `blob:test/${blobs.size}`;
    blobs.set(url, blob);
    return url;
  };
  URL.revokeObjectURL = () => {};
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    const blob = blobs.get(this.getAttribute("href") ?? "");
    if (blob === undefined) return;
    const name = this.download;
    void blob.text().then((text) => downloads.push([name, text]));
  });
  return downloads;
}

/**
 * Every autosave created since the last `flushAutosaves`. Each test has its
 * own IndexedDB, but a write reaches whichever is installed when it runs.
 */
const autosaves = new Set<Autosave>();

/**
 * `src/autosave.ts` with every autosave `createAutosave` makes recorded, the
 * module a test file's `vi.mock("../src/autosave.ts", …)` returns.
 */
export function recordAutosaves(
  actual: typeof import("../src/autosave.ts"),
): typeof import("../src/autosave.ts") {
  return {
    ...actual,
    createAutosave(options: AutosaveOptions): Autosave {
      const autosave = actual.createAutosave(options);
      autosaves.add(autosave);
      return autosave;
    },
  };
}

/**
 * Wait for every queued write of the recorded autosaves, the one an unmount
 * starts included, failures ignored, and forget them: `afterEach` awaits it
 * before the next test installs its own IndexedDB.
 */
export async function flushAutosaves(): Promise<void> {
  await Promise.all([...autosaves].map((autosave) => autosave.flush().catch(() => {})));
  autosaves.clear();
}

/**
 * The innermost open editor of `level` in block `block` of `bundle_mixed`,
 * `null` on the arranger: the bundle editor, the editor of `group_1` or the
 * timeline editor of `score`. A reader takes its level from it, and inside
 * a group editor the frame its cards lie in.
 */
export function editorAt(level: Level, block: string): Editing | null {
  switch (level) {
    case "arranger":
      return null;
    case "bundle":
      return { target: { block }, kind: level };
    case "group":
      return { target: { block, id: "group_1" }, kind: level };
    case "timeline":
      return { target: { block, id: "score" }, kind: level };
  }
}
