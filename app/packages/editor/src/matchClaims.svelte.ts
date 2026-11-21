/**
 * The MatchClaim tables of the open workspace: per block the table its
 * manifest's MatchClaims were read from, as the server answered it (the
 * anchor index's columns and every row's beliefs), with the file it was
 * read from. A table is held for the session only, never written to the
 * workspace file: after reopening a workspace its table is picked again. A
 * table is read through the server, which checks it against the block's
 * manifest (`POST /api/match-claims`); without a server there is none. The
 * server also reads the provenance of given MatchClaims of the file and
 * records the user's belief in one, answering the new file
 * (`decisions/0031-match-claim-provenance.md`): the block then holds the
 * new file, marked changed until the user saves it. Whatever replaces a
 * changed table asks first (`unsavedQuestion`).
 *
 * A block also holds the Projections table its manifest names, which the
 * server reads beside the MatchClaim table to say which events of a
 * MatchClaim are Projections and of what (`events`;
 * `decisions/0032-match-claim-events.md`). The tables a manifest names are
 * loaded from where the manifest came from (its `ManifestSource`) when they
 * can be reached from there; otherwise the user chooses them (`AskTables`):
 * a file on their system or a URL, or, where the browser hands over
 * folders, the manifest's folder, which the block then keeps for the
 * session and, where the browser can, beyond it (`FolderMemory`), so its
 * tables load from there without a question.
 */

import type {
  ClaimEvents,
  ClaimProvenance,
  MatchClaimTable,
  Server,
  StatedBelief,
} from "@timetoalign/tilie-client";
import { ServerError } from "@timetoalign/tilie-client";
import type { Manifest } from "@timetoalign/tilie-core";
import { saveManifest } from "@timetoalign/tilie-core";
import { SvelteMap } from "svelte/reactivity";
import { MATCH_CLAIM_TABLE, readInFolder, saveFile } from "./files.ts";
import { messageOf } from "./messages.svelte.ts";

/** What a block's table is read from: its file's name, the server's answer and the file. */
export interface LoadedTable {
  readonly name: string;
  readonly table: MatchClaimTable;
  /** The Parquet file the table was read from: the picked one, or the server's after a belief. */
  readonly file: Blob;
  /** Whether `file` holds beliefs the user has not saved yet. */
  readonly changed: boolean;
}

/** A block's table holding beliefs the user has not saved yet. */
export interface ChangedTable {
  readonly block: string;
  readonly loaded: LoadedTable;
}

/** A block's Projections table: its file's name and the file. */
export interface LoadedProjections {
  readonly name: string;
  readonly file: Blob;
}

/** What the tables need of a server: the table route, the provenance routes and the events route. */
export type MatchClaimServer = Pick<
  Server,
  "matchClaims" | "matchClaimProvenance" | "believeMatchClaim" | "matchClaimEvents"
>;

/** The types of the tables a manifest names in its `resources` that the editor reads. */
export type TableType = "MatchClaim" | "Projection";

/** A table a manifest names: its type and its location (`null` for a table it names none of). */
export interface NamedTable {
  readonly type: TableType;
  readonly url: string | null;
}

/**
 * Where a block's manifest came from, as far as the files it names can be
 * read from there: a served example, say. A manifest picked from the
 * user's system, or read from a workspace, has none.
 */
export interface ManifestSource {
  /**
   * The file at `url`, a location as the manifest's `resources` state it
   * (relative to the manifest); `null` when it cannot be reached from
   * there. Rejects when reading it failed.
   */
  read(url: string): Promise<Blob | null>;
}

/**
 * What the user chose: for one table a file of their system or a URL; or
 * the folder the manifest lies in, which holds every table it names.
 */
export type TableChoice =
  | { readonly type: TableType; readonly file: File }
  | { readonly type: TableType; readonly url: string }
  | { readonly folder: FileSystemDirectoryHandle };

/**
 * The folders blocks' manifests lie in, kept beyond the session by block
 * (in the browser's storage): `recall` gives the one kept for a block,
 * `null` when none is; `remember` keeps one. Neither fails: what cannot be
 * kept is not.
 */
export interface FolderMemory {
  recall(block: string): Promise<FileSystemDirectoryHandle | null>;
  remember(block: string, folder: FileSystemDirectoryHandle): Promise<void>;
}

/** A manifest's folder as where it came from: the files it names, read from the folder. */
export function folderSource(folder: FileSystemDirectoryHandle): ManifestSource {
  return { read: (url) => readInFolder(folder, url) };
}

/** What the user is asked to choose: the tables of the manifest called `manifest`. */
export interface TableRequest {
  readonly manifest: string;
  readonly tables: readonly NamedTable[];
}

/**
 * Ask the user for the files of `request`'s tables: what they chose (a table
 * left without a choice is absent), `null` when they cancel.
 */
export type AskTables = (request: TableRequest) => Promise<readonly TableChoice[] | null>;

/** What a load has to say in the message bar: information and warnings. */
export interface TableMessages {
  readonly informed: readonly string[];
  readonly warned: readonly string[];
}

const NO_MESSAGES: TableMessages = { informed: [], warned: [] };

/**
 * The tables `manifest` names in its `resources` that the editor reads, the
 * MatchClaim table first, then the Projections table; one of a type it
 * does not name is absent.
 */
export function namedTables(manifest: Manifest): NamedTable[] {
  const types: readonly TableType[] = ["MatchClaim", "Projection"];
  return types.flatMap((type) => {
    const url = manifest.resources?.find((resource) => resource.type === type)?.url;
    return url === undefined ? [] : [{ type, url }];
  });
}

/** The last part of a location: the file name a picker gives for it. */
export function fileNameOf(url: string): string {
  return url.split(/[/\\]/).at(-1) ?? url;
}

/** How a manifest is called in a message or the dialog's title: its name, else its ID, else "The manifest". */
export function manifestTitle(manifest: Manifest): string {
  return manifest.name ?? manifest.id ?? "The manifest";
}

/** The words for a table of type `type`. */
export function tableWords(type: TableType): string {
  return type === "MatchClaim" ? "MatchClaim table" : "Projections table";
}

/** The file at the URL `text` (absolute, or relative to the page), named by its last part. */
async function fetched(text: string): Promise<{ name: string; file: Blob }> {
  let url: URL;
  try {
    url = new URL(text, globalThis.location?.href);
  } catch {
    throw new Error(`'${text}' is no URL`);
  }
  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    throw new Error(`${url.href} could not be read: ${messageOf(error)}`);
  }
  if (!response.ok) {
    throw new Error(
      `${url.href} could not be read: ${response.status} ${response.statusText}`.trim(),
    );
  }
  return { name: fileNameOf(url.pathname), file: await response.blob() };
}

/** Without a server: what is said wherever matches are asked for. */
export const MATCHES_NEED_A_SERVER =
  "Matches need a server: MatchClaim tables are read through tilie-server.";

/** HTTP 501: the server cannot read MatchClaim tables. */
const NOT_IMPLEMENTED = 501;

/** Why the server did not do it, from its failure `error`, for a sentence starting with `failed`. */
function failure(failed: string, error: unknown, notImplemented: string): string {
  if (!(error instanceof ServerError)) return `${failed}: ${messageOf(error)}`;
  if (error.code === "unreachable") {
    return `${failed}: the server did not answer (${error.message}).`;
  }
  if (error.status === NOT_IMPLEMENTED) return `${failed}: ${notImplemented}`;
  const problems = error.refusal?.problems ?? [];
  const listed = problems.map((problem) =>
    problem.row === null ? problem.message : `row ${problem.row}: ${problem.message}`,
  );
  const reasons = listed.length > 0 ? listed.join("; ") : error.message;
  return `${failed}: ${reasons}`;
}

/** Why `name` was not loaded, from the server's failure `error`. */
export function loadFailure(name: string, error: unknown): string {
  return failure(
    `${name} could not be loaded`,
    error,
    "this server cannot read MatchClaim tables.",
  );
}

/** Why the belief in `claim` was not recorded, from the server's failure `error`. */
export function beliefFailure(claim: string, error: unknown): string {
  return failure(
    `Your belief in ${claim} was not recorded`,
    error,
    "this server cannot record beliefs.",
  );
}

/** Why the provenance was not read, from the server's failure `error`. */
export function provenanceFailure(error: unknown): string {
  return failure("The provenance could not be read", error, "this server cannot read provenance.");
}

/** Why the events of MatchClaims were not read, from the server's failure `error`. */
export function eventsFailure(error: unknown): string {
  return failure(
    "The MatchClaims' events could not be read",
    error,
    "this server cannot read Projections.",
  );
}

/** Why a table was not saved, from the failure `error`. */
export function saveFailure(error: unknown): string {
  return `The MatchClaims were not saved: ${messageOf(error)}`;
}

/** `names` in one phrase: "a", "a and b", "a, b and c". */
function listed(names: readonly string[]): string {
  return names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/**
 * The one question asked before unsaved work is dropped, naming it: the
 * workspace's file `workspace` when the workspace has unsaved changes
 * (`null` when it has none), then the changed MatchClaim tables `tables`
 * by their file names, in the order they were loaded. At least one of the
 * two names something.
 */
export function unsavedQuestion(workspace: string | null, tables: readonly string[]): string {
  const article = workspace === null ? "The" : "the";
  const named =
    tables.length === 0
      ? []
      : [`${article} MatchClaim ${tables.length === 1 ? "table" : "tables"} ${listed(tables)}`];
  const parts = workspace === null ? named : [workspace, ...named];
  const verb = parts.length > 1 || tables.length > 1 ? "have" : "has";
  return `${parts.join(" and ")} ${verb} unsaved changes. Save them?`;
}

export class MatchClaimTables {
  readonly #tables = new SvelteMap<string, LoadedTable>();
  readonly #server: MatchClaimServer | null;
  /**
   * The provenance asked of each table, by the claims asked for (their
   * JSON): a cache the tab fills while it derives what it shows, so plain
   * maps, never state.
   */
  readonly #provenance = new WeakMap<
    LoadedTable,
    Map<string, Promise<readonly ClaimProvenance[]>>
  >();
  /** The events asked of each table, by the Projections table sent with them, then as `#provenance`. */
  readonly #events = new WeakMap<
    LoadedTable,
    Map<LoadedProjections | null, Map<string, Promise<readonly ClaimEvents[]>>>
  >();
  readonly #projections = new SvelteMap<string, LoadedProjections>();
  /** Where each block's manifest came from, where it came from somewhere its files can be read. */
  readonly #sources = new Map<string, ManifestSource>();
  readonly #ask: AskTables | null;
  readonly #folders: FolderMemory | null;

  /**
   * The tables read through `server` (`null`: no server, so no table is
   * ever read), the user asked for the files of tables through `ask`
   * (`null`: never asked, as if they cancelled), the folders of blocks'
   * manifests kept in `folders` (`null`: for the session only).
   */
  constructor(
    server: MatchClaimServer | null,
    ask: AskTables | null = null,
    folders: FolderMemory | null = null,
  ) {
    this.#server = server;
    this.#ask = ask;
    this.#folders = folders;
  }

  /** Whether tables can be read: a server is given. */
  get connected(): boolean {
    return this.#server !== null;
  }

  /** The table of block `block`; `null` while none is loaded. */
  of(block: string): LoadedTable | null {
    return this.#tables.get(block) ?? null;
  }

  /** The blocks holding a table, in the order their tables were loaded. */
  get blocks(): readonly string[] {
    return [...this.#tables.keys()];
  }

  /** The tables holding beliefs not saved yet, in the order they were loaded. */
  get changed(): readonly ChangedTable[] {
    return [...this.#tables]
      .filter(([, loaded]) => loaded.changed)
      .map(([block, loaded]) => ({ block, loaded }));
  }

  /** Hold `loaded` as the table of block `block`, replacing any held. */
  hold(block: string, loaded: LoadedTable): void {
    this.#tables.delete(block);
    this.#tables.set(block, loaded);
  }

  /** The Projections table of block `block`; `null` while none is loaded. */
  projectionsOf(block: string): LoadedProjections | null {
    return this.#projections.get(block) ?? null;
  }

  /** Hold `loaded` as the Projections table of block `block`, replacing any held. */
  holdProjections(block: string, loaded: LoadedProjections): void {
    this.#projections.set(block, loaded);
  }

  /** Block `block`'s manifest came from `source`: the files it names are read from there. */
  locate(block: string, source: ManifestSource): void {
    this.#sources.set(block, source);
  }

  /**
   * Block `block`'s manifest lies in `folder`: the files it names are read
   * from there, for the session and, kept in the folder memory, after the
   * workspace is opened again.
   */
  inFolder(block: string, folder: FileSystemDirectoryHandle): void {
    this.locate(block, folderSource(folder));
    void this.#folders?.remember(block, folder);
  }

  /**
   * Where block `block`'s manifest came from: as located this session, else
   * the folder the memory kept for it (located from then on), else `null`.
   */
  async #sourceOf(block: string): Promise<ManifestSource | null> {
    const located = this.#sources.get(block);
    if (located !== undefined || this.#folders === null) return located ?? null;
    const folder = await this.#folders.recall(block);
    if (folder === null) return null;
    const source = folderSource(folder);
    this.#sources.set(block, source);
    return source;
  }

  /** Forget every table and where every manifest came from: another workspace was opened. */
  clear(): void {
    this.#tables.clear();
    this.#projections.clear();
    this.#sources.clear();
  }

  /**
   * Load the tables block `block`'s manifest `manifest` names, when it names
   * a MatchClaim table and the block holds none (what Show matches asks):
   * each from where the manifest came from (located this session, or its
   * folder kept from an earlier one) where it can be reached there, the
   * others as the user chooses them (one question for all, the user's
   * `AskTables`; cancelled, they are left). The MatchClaim table is read
   * through the server (`load`), the Projections table held as it is. What
   * the message bar says of it: nothing without a server, which Show matches
   * says itself.
   */
  async loadNamed(block: string, manifest: Manifest): Promise<TableMessages> {
    const named = namedTables(manifest);
    if (this.#server === null || this.of(block) !== null) return NO_MESSAGES;
    if (!named.some(({ type }) => type === "MatchClaim")) return NO_MESSAGES;
    const source = await this.#sourceOf(block);
    const reached: { type: TableType; name: string; file: Blob }[] = [];
    const unreached: NamedTable[] = [];
    const warned: string[] = [];
    for (const table of named) {
      if (table.type === "Projection" && this.projectionsOf(block) !== null) continue;
      const url = table.url ?? "";
      try {
        const file = source === null ? null : await source.read(url);
        if (file === null) unreached.push(table);
        else reached.push({ type: table.type, name: fileNameOf(url), file });
      } catch (error) {
        warned.push(
          `${url} could not be read from where the manifest came from: ${messageOf(error)}`,
        );
        unreached.push(table);
      }
    }
    const chosen =
      unreached.length === 0 ? [] : await this.#chosen(block, manifest, unreached, warned);
    if (chosen === null && reached.length === 0) return { informed: [], warned };
    const taken = await this.#take(block, manifest, [...reached, ...(chosen ?? [])]);
    return { informed: taken.informed, warned: [...warned, ...taken.warned] };
  }

  /**
   * Let the user choose the tables of block `block`'s manifest `manifest`
   * (Load MatchClaims…): its MatchClaim table, and its Projections table
   * where it names one, each a file of their system or a URL, then load
   * what they chose as `loadNamed` loads it. Without a server nothing is
   * asked and `MATCHES_NEED_A_SERVER` is the warning.
   */
  async choose(block: string, manifest: Manifest): Promise<TableMessages> {
    if (this.#server === null) return { informed: [], warned: [MATCHES_NEED_A_SERVER] };
    const named = namedTables(manifest);
    const tables: NamedTable[] = named.some(({ type }) => type === "MatchClaim")
      ? named
      : [{ type: "MatchClaim", url: null }, ...named];
    const warned: string[] = [];
    const chosen = await this.#chosen(block, manifest, tables, warned);
    if (chosen === null) return { informed: [], warned };
    const taken = await this.#take(block, manifest, chosen);
    return { informed: taken.informed, warned: [...warned, ...taken.warned] };
  }

  /**
   * The files the user chooses for `tables` of block `block`'s manifest
   * `manifest`, each URL read; `null` when they cancel (or nobody can be
   * asked). A URL that cannot be read adds its warning to `warned` and is
   * left. A folder chosen becomes the block's (`inFolder`) and every table
   * named is read from it; one it does not hold is said in `warned`.
   */
  async #chosen(
    block: string,
    manifest: Manifest,
    tables: readonly NamedTable[],
    warned: string[],
  ): Promise<{ type: TableType; name: string; file: Blob }[] | null> {
    const choices =
      this.#ask === null ? null : await this.#ask({ manifest: manifestTitle(manifest), tables });
    if (choices === null) return null;
    const files: { type: TableType; name: string; file: Blob }[] = [];
    for (const choice of choices) {
      if ("folder" in choice) {
        this.inFolder(block, choice.folder);
        files.push(...(await this.#fromFolder(choice.folder, tables, warned)));
        continue;
      }
      if ("file" in choice) {
        files.push({ type: choice.type, name: choice.file.name, file: choice.file });
        continue;
      }
      try {
        files.push({ type: choice.type, ...(await fetched(choice.url)) });
      } catch (error) {
        warned.push(`The ${tableWords(choice.type)} was not loaded: ${messageOf(error)}`);
      }
    }
    return files;
  }

  /** The files of `tables` that `folder` holds; each it does not hold, or fails to read, said in `warned`. */
  async #fromFolder(
    folder: FileSystemDirectoryHandle,
    tables: readonly NamedTable[],
    warned: string[],
  ): Promise<{ type: TableType; name: string; file: Blob }[]> {
    const files: { type: TableType; name: string; file: Blob }[] = [];
    for (const { type, url } of tables) {
      if (url === null) continue;
      try {
        const file = await readInFolder(folder, url);
        if (file === null) warned.push(`The folder ${folder.name} holds no ${url}.`);
        else files.push({ type, name: fileNameOf(url), file });
      } catch (error) {
        warned.push(`${url} could not be read from the folder ${folder.name}: ${messageOf(error)}`);
      }
    }
    return files;
  }

  /** Hold `files` as block `block`'s tables: the MatchClaim table read through the server. */
  async #take(
    block: string,
    manifest: Manifest,
    files: readonly { type: TableType; name: string; file: Blob }[],
  ): Promise<TableMessages> {
    const informed: string[] = [];
    const warned: string[] = [];
    for (const { type, name, file } of files) {
      if (type === "Projection") {
        this.holdProjections(block, { name, file });
        informed.push(`Loaded the Projections of ${name}.`);
        continue;
      }
      const failure = await this.load(block, manifest, file, name);
      if (failure === null) informed.push(`Loaded the MatchClaims of ${name}.`);
      else warned.push(failure);
    }
    return { informed, warned };
  }

  /**
   * Read the MatchClaim table `file`, called `name`, through the server,
   * checked against `manifest` (written as its file writes it), as the
   * table of block `block`: `null` once it is held, else why not
   * (`MATCHES_NEED_A_SERVER` without a server, `loadFailure` when the
   * server refuses it or fails).
   */
  async load(block: string, manifest: Manifest, file: Blob, name: string): Promise<string | null> {
    if (this.#server === null) return MATCHES_NEED_A_SERVER;
    try {
      const table = await this.#server.matchClaims(saveManifest(manifest), file);
      this.hold(block, { name, table, file, changed: false });
      return null;
    } catch (error) {
      return loadFailure(name, error);
    }
  }

  /**
   * The provenance of the MatchClaims `claims` of block `block`'s table, in
   * that order, read through the server with `manifest`: asked once per
   * table and list of claims, the promise kept while the table is held (a
   * failed one is let go, so asking again asks the server again). `null`
   * without a server or a table.
   */
  provenance(
    block: string,
    manifest: Manifest,
    claims: readonly string[],
  ): Promise<readonly ClaimProvenance[]> | null {
    const loaded = this.of(block);
    if (this.#server === null || loaded === null) return null;
    let asked = this.#provenance.get(loaded);
    if (asked === undefined) {
      asked = new Map();
      this.#provenance.set(loaded, asked);
    }
    const key = JSON.stringify(claims);
    const known = asked.get(key);
    if (known !== undefined) return known;
    const held = asked;
    const read = this.#server.matchClaimProvenance(saveManifest(manifest), loaded.file, claims);
    held.set(key, read);
    read.catch(() => {
      if (held.get(key) === read) held.delete(key);
    });
    return read;
  }

  /**
   * The events on both sides of the MatchClaims `claims` of block `block`'s
   * table, in that order (`ClaimEvents`: each side's timeline, event ID and
   * name, whether its event is a Projection of the block's Projections
   * table and of what; the certainty; whether it states synchrony), read
   * through the server with `manifest` and the Projections table the block
   * holds: asked once per table, Projections table and list of claims, the
   * promise kept while both are held (a failed one is let go, so asking
   * again asks the server again; `eventsFailure` words its error). `null`
   * without a server or a table. Without a Projections table no event is
   * known as a Projection.
   */
  events(
    block: string,
    manifest: Manifest,
    claims: readonly string[],
  ): Promise<readonly ClaimEvents[]> | null {
    const loaded = this.of(block);
    if (this.#server === null || loaded === null) return null;
    const projections = this.projectionsOf(block);
    let byProjections = this.#events.get(loaded);
    if (byProjections === undefined) {
      byProjections = new Map();
      this.#events.set(loaded, byProjections);
    }
    let asked = byProjections.get(projections);
    if (asked === undefined) {
      asked = new Map();
      byProjections.set(projections, asked);
    }
    const key = JSON.stringify(claims);
    const known = asked.get(key);
    if (known !== undefined) return known;
    const held = asked;
    const read = this.#server.matchClaimEvents(
      saveManifest(manifest),
      loaded.file,
      projections?.file ?? null,
      claims,
    );
    held.set(key, read);
    read.catch(() => {
      if (held.get(key) === read) held.delete(key);
    });
    return read;
  }

  /**
   * Record `belief` in block `block`'s table through the server, checked
   * against `manifest`: the server answers the new file, which is read again
   * and held as the block's table, marked changed. `null` once it is held,
   * else why not (the table is kept).
   */
  async believe(block: string, manifest: Manifest, belief: StatedBelief): Promise<string | null> {
    const loaded = this.of(block);
    if (this.#server === null) return MATCHES_NEED_A_SERVER;
    if (loaded === null)
      return `Your belief in ${belief.claim} was not recorded: no table is loaded.`;
    const text = saveManifest(manifest);
    try {
      const file = await this.#server.believeMatchClaim(text, loaded.file, belief);
      const table = await this.#server.matchClaims(text, file);
      this.#tables.set(block, { name: loaded.name, table, file, changed: true });
      return null;
    } catch (error) {
      return beliefFailure(belief.claim, error);
    }
  }

  /**
   * Save block `block`'s changed table, offered under its file's name: the
   * name it was saved under, after which it is no longer changed (if still
   * held); `null` when it is not changed or the viewer cancelled. A failure
   * to write throws.
   */
  async save(block: string): Promise<string | null> {
    const loaded = this.of(block);
    if (loaded === null || !loaded.changed) return null;
    const saved = await saveFile(loaded.file, MATCH_CLAIM_TABLE, loaded.name);
    if (saved === null) return null;
    this.#saved(block, loaded);
    return saved.name;
  }

  /** The table `loaded` of block `block` was saved: it is no longer changed, if still held. */
  #saved(block: string, loaded: LoadedTable): void {
    if (this.of(block) !== loaded) return;
    const kept = { ...loaded, changed: false };
    const asked = this.#provenance.get(loaded);
    if (asked !== undefined) this.#provenance.set(kept, asked);
    const events = this.#events.get(loaded);
    if (events !== undefined) this.#events.set(kept, events);
    this.#tables.set(block, kept);
  }
}
