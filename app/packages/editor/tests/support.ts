/// <reference types="node" />
/**
 * Fixtures and file stubs for the editor's tests: manifests from the
 * installed `@timetoalign/timetoshare`, workspaces and stores built of
 * them, the Full view of a store, the test hook of a mounted page, the open dialog read and
 * answered, the fallback file input answered with a chosen file, downloads
 * recorded instead of performed, the autosaves of mounted editors waited
 * for between tests, and the open editor of a level.
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { Editing, Level } from "@timetoalign/tilie-arranger";
import type { Manifest, Store } from "@timetoalign/tilie-core";
import {
  createIdMinter,
  createStore,
  importedManifest,
  isLoadError,
  loadManifest,
  readWorkspace,
  WORKSPACE,
} from "@timetoalign/tilie-core";
import type { DumpsOptions, Rule } from "@timetoalign/timetoshare";
import { dumps, loads, SCHEMA_VERSION, withBareIds, withFileIds } from "@timetoalign/timetoshare";
import { flushSync } from "svelte";
import { vi } from "vitest";
import type { Autosave, AutosaveOptions } from "../src/autosave.ts";
import { fixtureWorkspace } from "../src/fixtureWorkspace.ts";
import type { MatchIndexes } from "../src/inspector/matchstamps.ts";
import type { Lookup } from "../src/lookup/index.ts";
import { NO_LOOKUP, provideLookup } from "../src/lookup/index.ts";
import { MatchClaimTables } from "../src/matchClaims.svelte.ts";
import { type MessageLevel, postContext } from "../src/messages.svelte.ts";
import { ProfilesState, provideProfiles } from "../src/profiles/profiles.svelte.ts";
import type { TestHook } from "../src/testHook.ts";
import type { UserContext } from "../src/user.svelte.ts";
import { provideUser, UserState } from "../src/user.svelte.ts";

/**
 * Core's import of `file` (`importedManifest`), which mints the IDs of the
 * default timestamps it gives: those IDs, in the canonical order of the
 * timestamps, replaced by the ones `imported` holds there, so an imported
 * block's manifest is compared with it whole.
 */
export function importedAs(file: Manifest, imported: Manifest): Manifest {
  const expected = importedManifest(file);
  const { graphical } = expected;
  if (graphical === undefined || file.graphical !== undefined) return expected;
  const minted = imported.graphical?.timestamps ?? [];
  const timestamps = (graphical.timestamps ?? []).map((item, index) => ({
    ...item,
    id: minted[index]?.id ?? item.id,
  }));
  return { ...expected, graphical: { ...graphical, timestamps } };
}

const directory = path.join(
  path.dirname(createRequire(import.meta.url).resolve("@timetoalign/timetoshare/package.json")),
  "fixtures",
  SCHEMA_VERSION,
);

/** The text of a manifest fixture of the installed schema version. */
export function fixtureText(name: string): string {
  return readFileSync(path.join(directory, `${name}.yaml`), "utf8");
}

/** The value of a manifest fixture's text with its IDs bare, as the store holds them, to change. */
export function manifestValue(name: string): { [key: string]: unknown } {
  return withBareIds(loads(fixtureText(name)) as { [key: string]: unknown });
}

/** The text of a manifest file holding `value`, a manifest with bare IDs: every ID written `#id`. */
export function fileText(value: unknown, options?: DumpsOptions): string {
  return dumps(withFileIds(value), options);
}

/** A manifest fixture, failing loudly if it is refused. */
export function fixture(name: string): Manifest {
  const manifest = loadManifest(fixtureText(name));
  if (isLoadError(manifest)) throw new Error(`${name} refused`);
  return manifest;
}

/** The one item of `items` that `matches`, failing loudly if there are none or several. */
function theOne<T>(items: readonly T[], matches: (item: T) => boolean, what: string): T {
  const found = items.filter(matches);
  if (found.length !== 1) throw new Error(`${found.length} ${what}, not one`);
  return found[0] as T;
}

/** A timeline tree as the helpers below walk it. */
type Tree = {
  readonly regions: readonly { readonly id: string; readonly name?: string | null }[];
  readonly conversion_maps: readonly { readonly id: string; readonly type: string }[];
  readonly children: readonly Tree[];
};

/** Every timeline of a manifest fixture's trees, a parent before its children. */
function treesOf(name: string): Tree[] {
  const trees: Tree[] = [];
  const walk = (timeline: Tree): void => {
    trees.push(timeline);
    for (const child of timeline.children) walk(child);
  };
  for (const root of fixture(name).timelines) walk(root);
  return trees;
}

/**
 * The ID of the one region named `regionName` in a manifest fixture: how a
 * test names a region whose ID the library mints, as the sections it
 * computes ("A", "B", …).
 */
export function regionNamed(name: string, regionName: string): string {
  const regions = treesOf(name).flatMap((timeline) => timeline.regions);
  return theOne(regions, (region) => region.name === regionName, `regions ${regionName}`).id;
}

/**
 * The ID of the one conversion map of type `type` that a timeline of a
 * manifest fixture holds directly (not one inside another map): how a test
 * names a map whose ID the library mints, as a MeasureMap's record map.
 */
export function conversionMapOf(name: string, type: string): string {
  const maps = treesOf(name).flatMap((timeline) => timeline.conversion_maps);
  return theOne(maps, (map) => map.type === type, `${type}s in ${name}`).id;
}

/** The ID of the one FlowMap of a manifest fixture under `convention`, a FlowMap the library computes. */
export function flowMapUnder(name: string, convention: string): string {
  const flowMaps = fixture(name).flow_maps ?? [];
  return theOne(flowMaps, (flowMap) => flowMap.convention === convention, convention).id;
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

/**
 * The seed of the minter of every store `storeOf` opens, another than the
 * fixture workspaces' (`FIXTURE_SEED`): what a test dispatches mints the
 * same IDs every run. A test names a minted ID only through what holds it
 * (the journaled command's `ids`, the view), never as a literal.
 */
export const STORE_SEED = 20261127n;

/**
 * The IDs a store of `storeOf` mints first, one for each of `prefixes`, in
 * order: what the first command dispatched to it that creates elements
 * without carrying their IDs is given, in the order core creates them
 * (`CarriedIds`). Computed by a minter of `STORE_SEED`, never typed.
 */
export function storeMints(...prefixes: readonly string[]): string[] {
  const minter = createIdMinter({ seed: STORE_SEED });
  return prefixes.map((prefix) => minter.mint(prefix));
}

/** A store opened on `workspaceOf(...manifests)`, minting with a minter of `STORE_SEED`. */
export function storeOf(...manifests: readonly (string | Manifest)[]): Store {
  const workspace = readWorkspace(workspaceOf(...manifests));
  if (isLoadError(workspace)) throw new Error("the written workspace is refused");
  return createStore(workspace, { minter: createIdMinter({ seed: STORE_SEED }) });
}

/**
 * The rule hiding every elision (the drawing specification's section 8.9,
 * Elided and full), which the defaults draw on an ancestor card: the Full
 * view, every ancestor card drawn whole.
 */
export const FULL_CARDS = {
  select: { element: "elision" },
  set: { display: "none" },
} as const;

/** `store` with `rule` appended to its workspace's rules by one `set` of its `graphical`. */
function withWorkspaceRule(store: Store, rule: Rule): Store {
  const { graphical } = store.view;
  const rules = [...(graphical.rules ?? []), rule];
  const refused = store.dispatch({
    type: "set",
    changes: [{ target: WORKSPACE, values: { graphical: { ...graphical, rules } } }],
  });
  if (refused !== null) throw new Error(`${refused.code} at ${JSON.stringify(refused.path)}`);
  return store;
}

/**
 * `store` with `FULL_CARDS` appended to its workspace's rules: for a test
 * of an ancestor card whose subject is not the elision, so that its values,
 * derived on whole cards, stand.
 */
export function withFullCards(store: Store): Store {
  return withWorkspaceRule(store, FULL_CARDS);
}

/**
 * `store` with one workspace rule stating `mode` as the `elision-mode` of
 * every ancestor card (drawing.md section 8.9, Modes): `auto` for a test of
 * derived elisions, which the initial `custom` derives none of; the values
 * then hang on no initial value of the cascade.
 */
export function withElisionMode(store: Store, mode: "auto" | "custom"): Store {
  return withWorkspaceRule(store, {
    select: { element: "ancestor_card" },
    set: { "elision-mode": mode },
  });
}

/** The installed test hook of the mounted page. */
export function hook(): TestHook {
  const installed = window.__tilie;
  if (installed === undefined) throw new Error("window.__tilie is not installed");
  return installed;
}

/** The open modal dialog's question and answers. */
export function openDialog(): { question: string; answers: string[] } | null {
  const dialog = [...document.querySelectorAll("dialog")].find((element) => element.open);
  if (dialog === undefined) return null;
  return {
    question: dialog.querySelector("p")?.textContent ?? "",
    answers: Array.from(dialog.querySelectorAll("button"), (button) => button.textContent ?? ""),
  };
}

/** Press the answer `label` of the open modal dialog. */
export function answer(label: string): void {
  const button = [...document.querySelectorAll<HTMLButtonElement>("dialog[open] button")].find(
    (entry) => entry.textContent === label,
  );
  if (button === undefined) throw new Error(`no answer ${label}`);
  button.click();
  flushSync();
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

/** Every read of a slot since the last `flushAutosaves`, an editor's recovery read included. */
const reads = new Set<Promise<unknown>>();

/**
 * `src/autosave.ts` with every autosave `createAutosave` makes and every
 * read of a slot recorded, the module a test file's
 * `vi.mock("../src/autosave.ts", …)` returns.
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
    recoverWorkspace(key: string) {
      const read = actual.recoverWorkspace(key);
      reads.add(read);
      return read;
    },
  };
}

/**
 * Wait for every recorded read of a slot and then for one task, so that
 * what an editor does with its recovery read, which takes no further task
 * when the slot offers nothing, is done.
 */
export async function slotsRead(): Promise<void> {
  await Promise.allSettled(reads);
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Wait for every queued write of the recorded autosaves, the one an unmount
 * starts included, failures ignored, and forget them and the recorded reads:
 * `afterEach` awaits it before the next test installs its own IndexedDB.
 */
export async function flushAutosaves(): Promise<void> {
  await Promise.all([...autosaves].map((autosave) => autosave.flush().catch(() => {})));
  autosaves.clear();
  reads.clear();
}

/**
 * The innermost open editor of `level` in block `block` of `bundle_mixed`,
 * `null` on the arranger: the bundle editor, the editor of `group_1`, the
 * timeline editor of `score`, its children editor or its flow editor. A reader takes its level from it, and inside
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
    case "children":
    case "flow":
      return { target: { block, id: "score" }, kind: level };
  }
}

/**
 * The component context of an inspector component mounted on its own,
 * `mount`'s `context`: the text of each message it posts is appended to
 * the list of its level.
 */
export function posting(
  info: string[] = [],
  warning: string[] = [],
  error: string[] = [],
): ReturnType<typeof postContext> {
  const lists: Readonly<Record<MessageLevel, string[]>> = { info, warning, error };
  return postContext((level, text) => {
    lists[level].push(text);
  });
}

/**
 * The MatchClaim props of the inspector drawer for an editor without a
 * server: no table held, so no block has indexes.
 */
export function noMatchClaims(): {
  tables: MatchClaimTables;
  indexesOf: (block: string) => MatchIndexes | null;
} {
  return { tables: new MatchClaimTables(null), indexesOf: () => null };
}

/** The editor's user context over `state` (the default user, kept nowhere), whose question does nothing. */
export function userContext(state: UserState = new UserState(null)): UserContext {
  return { state, ask: async () => undefined };
}

/**
 * `component` wrapped so that it is mounted with the editor's user, lookup
 * and type profiles in its context, as the editor provides them: the
 * wrapper sets them before the component's own setup runs. The profiles are
 * by default an editor's without storage: none, kept nowhere.
 */
export function providing<C extends (...args: never[]) => unknown>(
  component: C,
  user: UserContext = userContext(),
  lookup: Lookup = NO_LOOKUP,
  profiles: ProfilesState = new ProfilesState(null),
): C {
  return ((...args: Parameters<C>) => {
    provideUser(user);
    provideLookup(lookup);
    provideProfiles(profiles);
    return Reflect.apply(component, undefined, args);
  }) as C;
}
