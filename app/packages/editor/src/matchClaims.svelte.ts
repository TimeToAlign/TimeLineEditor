/**
 * The MatchClaim tables of the open workspace: per block the table its
 * manifest's MatchClaims were read from, as the server answered it (the
 * anchor index's columns and every row's beliefs), with the file it was
 * read from. A table is held for the session only, never written to the
 * workspace file: after reopening a workspace its table is picked again. A
 * table is read through the server, which checks it against the block's
 * manifest (`POST /api/match-claims`), once the server answered its health
 * check (`computes`); without a server there is none. The
 * server also reads the provenance of given MatchClaims of the file and
 * records the user's belief in one, answering the new file
 * (`decisions/0031-match-claim-provenance.md`): the block then holds the
 * new file, marked changed until the user saves it. Whatever replaces a
 * changed table asks first (`unsavedQuestion`). The server reads the
 * events on both sides of given MatchClaims of the file too (`events`;
 * `decisions/0032-match-claim-events.md`).
 *
 * The MatchClaim table a manifest names is loaded from where the manifest
 * came from (its `ManifestSource`) when it can be reached from there: a
 * served example, or, with a server that offers the user's files, the
 * folder of the manifest's file, which the workspace states
 * (`ManifestPlaces`). Otherwise the user is asked once (`AskTables`):
 * where the manifest lies, which the workspace then keeps (a block whose
 * manifest's file it does not state), or the table's file (a folder that
 * does not hold it), each located in the editor's file dialog, or a URL.
 * A server that offers no files gives no folder to look in: the user is
 * asked for the table's file, picked in the browser's picker, or a URL,
 * and nothing is kept of where a picked file lies. Nothing is asked while
 * no server can read a table (`unavailable`). The
 * editor reads no other resource a manifest names: it implements no event
 * resource, and the MatchClaim table alone carries what the match display
 * needs.
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
import type { FileKind, FileReader } from "./files.ts";
import {
  baseName,
  folderOf,
  MANIFEST_FILE,
  MATCH_CLAIM_TABLE,
  openFiles,
  saveFile,
  serverSource,
} from "./files.ts";
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

/** What the tables need of a server: the table route, the provenance routes and the events route. */
export type MatchClaimServer = Pick<
  Server,
  "matchClaims" | "matchClaimProvenance" | "believeMatchClaim" | "matchClaimEvents"
>;

/** The MatchClaim table a manifest names: its location (`null` where it names none). */
export interface NamedTable {
  readonly url: string | null;
}

/**
 * Where a block's manifest came from, as far as the files it names can be
 * read from there: a served example, or the folder of its file on the
 * server. A manifest picked from the user's system has none.
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
 * A file the user located: the path of a file on the server, the
 * manifest's or the table's as the question asked (`TableQuestion`), or a
 * table's file picked in the browser, which has no path.
 */
export type Located = { readonly path: string } | { readonly file: File };

/** What the user chose: a URL of the table, or a file located (`Located`). */
export type TableChoice = { readonly url: string } | Located;

/**
 * The user's files on the server, as the tables reach them: read by path
 * from the server's root, the path of the file each block's manifest came
 * from (the workspace states it), and the editor's file dialog.
 */
export interface ManifestPlaces {
  readonly files: FileReader;
  /** The path of the file block `block`'s manifest came from; `null` where the workspace states none. */
  pathOf(block: string): string | null;
  /** The user located block `block`'s manifest at the file `path`: the workspace keeps it. */
  located(block: string, path: string): void;
  /**
   * Let the user choose a file of one of `kinds` in the editor's file
   * dialog, starting in the folder of the file `near` (else where the
   * dialog starts); its path, `null` when they cancel.
   */
  choose(kinds: readonly FileKind[], near: string | null): Promise<string | null>;
}

/**
 * The question the user is asked: where the manifest lies (`manifest`, for
 * a block whose manifest's file the workspace does not state), or the
 * table's file (`table`; `missing` the manifest's path where the table is
 * not beside it, `null` when the user asked to load one or no path is
 * known). `locate` lets the user locate the file asked for: in the
 * editor's file dialog where the server offers the user's files, else, for
 * a table, in the browser's picker; `null` when they cancel.
 */
export type TableQuestion =
  | { readonly kind: "manifest"; readonly locate: () => Promise<Located | null> }
  | {
      readonly kind: "table";
      readonly missing: string | null;
      readonly locate: () => Promise<Located | null>;
    };

/** What the user is asked to choose: the MatchClaim table of the manifest called `manifest`. */
export interface TableRequest {
  readonly manifest: string;
  readonly table: NamedTable;
  readonly question: TableQuestion;
}

/** Ask the user for the file of `request`'s table: what they chose, `null` when they cancel. */
export type AskTables = (request: TableRequest) => Promise<TableChoice | null>;

/** What a load has to say in the message bar: information, and the failures, shown as errors. */
export interface TableMessages {
  readonly informed: readonly string[];
  readonly failed: readonly string[];
}

const NO_MESSAGES: TableMessages = { informed: [], failed: [] };

/**
 * The location of the MatchClaim table `manifest` names in its `resources`
 * (the first resource of type `MatchClaim`), `null` where it names none.
 */
export function namedTable(manifest: Manifest): string | null {
  return manifest.resources?.find((resource) => resource.type === "MatchClaim")?.url ?? null;
}

/** A table the user chose or the manifest's source gave: its file's name and the file. */
interface TableFile {
  readonly name: string;
  readonly file: Blob;
}

/** The last part of a location: the file name a picker gives for it. */
export function fileNameOf(url: string): string {
  return url.split(/[/\\]/).at(-1) ?? url;
}

/** How a manifest is called in a message or the dialog's title: its name, else its ID, else "The manifest". */
export function manifestTitle(manifest: Manifest): string {
  return manifest.name ?? manifest.id ?? "The manifest";
}

/**
 * Whether the location `url` is an absolute `http` or `https` URL: fetched
 * as it stands, never looked for beside a manifest.
 */
function isWebUrl(url: string): boolean {
  return /^https?:\/\//iu.test(url);
}

/** The path `path` chosen in the file dialog as a file located; `null` when it was cancelled. */
function locatedAt(path: string | null): Located | null {
  return path === null ? null : { path };
}

/**
 * Let the user pick one MatchClaim table in the browser's picker
 * (`openFiles`), where the server offers no files: the file picked, `null`
 * when they cancel.
 */
async function pickedTable(): Promise<Located | null> {
  const [opened] = await openFiles(MATCH_CLAIM_TABLE);
  return opened === undefined ? null : { file: opened.file };
}

/** The file at the URL `text` (absolute, or relative to the page), named by its last part. */
async function fetched(text: string): Promise<TableFile> {
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

/** The first sentence of `HOW_TO_START_A_SERVER`: why matches cannot be shown. */
export const MATCHES_NEED_A_SERVER = "Matches need a running tilie-server.";

/** The information turning Show matches on gives where no block holds a MatchClaim table then. */
export const NO_MATCHES = "No MatchClaim table loaded.";

/**
 * While no server can read a table, what is said wherever matches are
 * asked for (Show matches turned on, Load MatchClaims… without a server,
 * the disabled controls' hints): that sentence,
 * then how to start the server (the command the repository's README starts
 * it from the source tree with). Plain text: every place shows it as such.
 */
export const HOW_TO_START_A_SERVER =
  `${MATCHES_NEED_A_SERVER} To start it, run ` +
  "uv run tilie --static-dir ../app/packages/editor/dist in the repository's server folder " +
  "(or tilie, once installed with pip install tilie-server), " +
  "then open the editor at the address it prints.";

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
    "this server cannot read MatchClaim tables.",
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

/** What the tables know of their server now, and how they ask the user; every member optional. */
export interface TablesOptions {
  /** Ask the user for the files of tables; without it never asked, as if they cancelled. */
  readonly ask?: AskTables | null | undefined;
  /**
   * Whether the server answered its health check now, so it computes: a
   * table is read through it only then. Without it, never.
   */
  readonly computes?: (() => boolean) | undefined;
  /**
   * The user's files on the server as far as it offers them now (`null`:
   * it offers none, or has not answered yet). Without it, never.
   */
  readonly places?: (() => ManifestPlaces | null) | undefined;
  /** Why the server's health check failed now, `null` while it has not. Without it, never. */
  readonly failure?: (() => string | null) | undefined;
}

/** The MatchClaim tables held for the open workspace's blocks, one per block, read through a server. */
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
  /** The events asked of each table, as `#provenance`. */
  readonly #events = new WeakMap<LoadedTable, Map<string, Promise<readonly ClaimEvents[]>>>();
  /** Where the manifests of examples came from, by block: their files are read from there. */
  readonly #sources = new Map<string, ManifestSource>();
  readonly #ask: AskTables | null;
  readonly #computes: () => boolean;
  readonly #places: () => ManifestPlaces | null;
  readonly #failure: () => string | null;

  /**
   * The tables read through `server` (`null`: no server, so no table is
   * ever read), as `options` say what is known of it now: whether it
   * computes, the user's files it offers, why its health check failed.
   * A table is read only through a server that computes; where it offers
   * no files, the files a manifest names are not looked for beside it.
   */
  constructor(server: MatchClaimServer | null, options: TablesOptions = {}) {
    this.#server = server;
    this.#ask = options.ask ?? null;
    this.#computes = options.computes ?? (() => false);
    this.#places = options.places ?? (() => null);
    this.#failure = options.failure ?? (() => null);
  }

  /**
   * Why no server can read a table now, `HOW_TO_START_A_SERVER` after the
   * failure of the server's health check where it failed: no server is
   * given, or it has not answered its health check; `null` while one can,
   * whether or not it offers the user's files. Nothing asks the user for a
   * table then.
   */
  get unavailable(): string | null {
    return this.#ready() === null ? this.#why() : null;
  }

  /**
   * Whether the server given has not answered its health check yet, nor
   * failed it: nobody can tell yet whether it will read tables.
   */
  get waiting(): boolean {
    return this.#server !== null && !this.#computes() && this.#failure() === null;
  }

  /**
   * The server while it reads tables (given, and its health check
   * answered); else `null`: everything read through it asks it only then.
   */
  #ready(): MatchClaimServer | null {
    return this.#computes() ? this.#server : null;
  }

  /** What `unavailable` says while no server reads tables. */
  #why(): string {
    const failure = this.#server === null ? null : this.#failure();
    return failure === null ? HOW_TO_START_A_SERVER : `${failure} ${HOW_TO_START_A_SERVER}`;
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

  /** Block `block`'s manifest came from `source` (an example): the files it names are read from there. */
  locate(block: string, source: ManifestSource): void {
    this.#sources.set(block, source);
  }

  /**
   * Where block `block`'s manifest came from: located this session (an
   * example), else the folder of its file on the server (`places`, where
   * the server offers files), else `null`.
   */
  #sourceOf(block: string, places: ManifestPlaces | null): ManifestSource | null {
    const located = this.#sources.get(block);
    if (located !== undefined) return located;
    if (places === null) return null;
    const path = places.pathOf(block);
    return path === null ? null : serverSource(places.files, folderOf(path));
  }

  /**
   * The question for the table of block `block`, located through `places`:
   * with a `source` of its manifest, its table's file, missing beside it;
   * without one, where the manifest lies. Where the server offers no files
   * there is no place to look beside: the table's file (`#tableQuestion`).
   */
  #question(
    block: string,
    places: ManifestPlaces | null,
    source: ManifestSource | null,
  ): TableQuestion {
    if (places === null) return this.#tableQuestion(block, null);
    if (source === null) {
      return {
        kind: "manifest",
        locate: async () => locatedAt(await places.choose([MANIFEST_FILE], null)),
      };
    }
    const path = places.pathOf(block);
    return {
      kind: "table",
      missing: path,
      locate: async () => locatedAt(await places.choose([MATCH_CLAIM_TABLE], path)),
    };
  }

  /**
   * The question for the table of block `block` that is missing from no
   * place: its file, located in the file dialog near the manifest, or,
   * where the server offers no files, picked in the browser's picker.
   */
  #tableQuestion(block: string, places: ManifestPlaces | null): TableQuestion {
    return {
      kind: "table",
      missing: null,
      locate:
        places === null
          ? pickedTable
          : async () => locatedAt(await places.choose([MATCH_CLAIM_TABLE], places.pathOf(block))),
    };
  }

  /** Forget every table and where every manifest came from: another workspace was opened. */
  clear(): void {
    this.#tables.clear();
    this.#sources.clear();
  }

  /**
   * Load the MatchClaim table block `block`'s manifest `manifest` names,
   * when it names one and the block holds none (what Show matches asks):
   * named by an absolute `http` or `https` URL, fetched from there;
   * otherwise from where the manifest came from (`#sourceOf`) where it lies
   * there; either silently, else as the user chooses it in one question
   * (`#tableQuestion` after a URL, else `#question`; cancelled, it is
   * left), read through the server (`load`). While no server can read a
   * table (`unavailable`) nothing is asked and nothing said: the caller
   * says it once (`WorkspaceSession.loadNamedTables`).
   */
  async loadNamed(block: string, manifest: Manifest): Promise<TableMessages> {
    const url = namedTable(manifest);
    if (this.#ready() === null || this.of(block) !== null || url === null) return NO_MESSAGES;
    const places = this.#places();
    const failed: string[] = [];
    let reached: TableFile | null;
    let question: TableQuestion;
    if (isWebUrl(url)) {
      reached = await this.#fetchedTable(url, failed);
      question = this.#tableQuestion(block, places);
    } else {
      const source = this.#sourceOf(block, places);
      reached = source === null ? null : await this.#read(source, url, failed);
      question = this.#question(block, places, source);
    }
    const taken = reached ?? (await this.#chosen(block, manifest, url, question, places, failed));
    return this.#take(block, manifest, taken, failed);
  }

  /**
   * Let the user choose the MatchClaim table of block `block`'s manifest
   * `manifest` (Load MatchClaims…): its file, located in the file dialog
   * (picked in the browser's picker where the server offers no files), or
   * a URL; then load it as `loadNamed` loads it. While no server can read
   * a table nothing is asked and `unavailable` is the failure.
   */
  async choose(block: string, manifest: Manifest): Promise<TableMessages> {
    if (this.#ready() === null) return { informed: [], failed: [this.#why()] };
    const failed: string[] = [];
    const places = this.#places();
    const question = this.#tableQuestion(block, places);
    const url = namedTable(manifest);
    const chosen = await this.#chosen(block, manifest, url, question, places, failed);
    return this.#take(block, manifest, chosen, failed);
  }

  /** The table at the URL `url`; `null` where (said in `failed`) it cannot be fetched. */
  async #fetchedTable(url: string, failed: string[]): Promise<TableFile | null> {
    try {
      return await fetched(url);
    } catch (error) {
      failed.push(messageOf(error));
      return null;
    }
  }

  /** The table at `url` from `source`; `null` where it holds none, or (said in `failed`) cannot be read. */
  async #read(source: ManifestSource, url: string, failed: string[]): Promise<TableFile | null> {
    try {
      const file = await source.read(url);
      return file === null ? null : { name: fileNameOf(url), file };
    } catch (error) {
      failed.push(
        `${url} could not be read from where the manifest came from: ${messageOf(error)}`,
      );
      return null;
    }
  }

  /**
   * The file the user chooses for the table `url` of block `block`'s
   * manifest `manifest`, asked `question`; `null` when they cancel (or
   * nobody can be asked). A URL, or a path on the server (`places`), that
   * cannot be read adds its failure to `failed` and gives `null`. The
   * manifest's file located on the server becomes the block's
   * (`ManifestPlaces.located`) and the table is read beside it; a folder
   * not holding it is said in `failed`. A file picked in the browser is
   * the table as it stands, and nothing is kept of where it lies.
   */
  async #chosen(
    block: string,
    manifest: Manifest,
    url: string | null,
    question: TableQuestion,
    places: ManifestPlaces | null,
    failed: string[],
  ): Promise<TableFile | null> {
    const request = { manifest: manifestTitle(manifest), table: { url }, question };
    const choice = this.#ask === null ? null : await this.#ask(request);
    if (choice === null) return null;
    if ("file" in choice) return { name: choice.file.name, file: choice.file };
    if ("path" in choice) {
      if (places === null) {
        throw new Error(`${choice.path} was chosen on a server that offers no files`);
      }
      if (question.kind !== "manifest") return this.#atPath(places, choice.path, failed);
      places.located(block, choice.path);
      if (url === null) return null;
      const reached = await this.#read(
        serverSource(places.files, folderOf(choice.path)),
        url,
        failed,
      );
      if (reached === null && failed.length === 0) {
        failed.push(`${url} is not beside ${baseName(choice.path)}.`);
      }
      return reached;
    }
    try {
      return await fetched(choice.url);
    } catch (error) {
      failed.push(`The MatchClaim table was not loaded: ${messageOf(error)}`);
      return null;
    }
  }

  /** The file `path` on the server; `null`, said in `failed`, where it cannot be read. */
  async #atPath(places: ManifestPlaces, path: string, failed: string[]): Promise<TableFile | null> {
    try {
      return { name: baseName(path), file: await places.files.readFile(path) };
    } catch (error) {
      failed.push(`${path} could not be read: ${messageOf(error)}`);
      return null;
    }
  }

  /** Hold `taken` (none: nothing) as block `block`'s table, read through the server; the messages, after `failed`. */
  async #take(
    block: string,
    manifest: Manifest,
    taken: TableFile | null,
    failed: readonly string[],
  ): Promise<TableMessages> {
    if (taken === null) return { informed: [], failed };
    const failure = await this.load(block, manifest, taken.file, taken.name);
    return failure === null
      ? { informed: [`Loaded the MatchClaims of ${taken.name}.`], failed }
      : { informed: [], failed: [...failed, failure] };
  }

  /**
   * Read the MatchClaim table `file`, called `name`, through the server,
   * checked against `manifest` (written as its file writes it), as the
   * table of block `block`: `null` once it is held, else why not
   * (`HOW_TO_START_A_SERVER` without a server, `loadFailure` when the
   * server refuses it or fails).
   */
  async load(block: string, manifest: Manifest, file: Blob, name: string): Promise<string | null> {
    if (this.#server === null) return HOW_TO_START_A_SERVER;
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
   * failed one is let go, so asking again asks the server again). `null`,
   * asking nothing, while no server reads tables (`unavailable` says why)
   * or without a table.
   */
  provenance(
    block: string,
    manifest: Manifest,
    claims: readonly string[],
  ): Promise<readonly ClaimProvenance[]> | null {
    const loaded = this.of(block);
    const server = this.#ready();
    if (server === null || loaded === null) return null;
    let asked = this.#provenance.get(loaded);
    if (asked === undefined) {
      asked = new Map();
      this.#provenance.set(loaded, asked);
    }
    const key = JSON.stringify(claims);
    const known = asked.get(key);
    if (known !== undefined) return known;
    const held = asked;
    const read = server.matchClaimProvenance(saveManifest(manifest), loaded.file, claims);
    held.set(key, read);
    read.catch(() => {
      if (held.get(key) === read) held.delete(key);
    });
    return read;
  }

  /**
   * The events on both sides of the MatchClaims `claims` of block `block`'s
   * table, in that order (`ClaimEvents`: each side's timeline, event ID and
   * name; the certainty; whether it states synchrony), read through the
   * server with `manifest`: asked once per table and list of claims, the
   * promise kept while the table is held (a failed one is let go, so asking
   * again asks the server again; `eventsFailure` words its error). `null`,
   * asking nothing, while no server reads tables (`unavailable` says why)
   * or without a table.
   */
  events(
    block: string,
    manifest: Manifest,
    claims: readonly string[],
  ): Promise<readonly ClaimEvents[]> | null {
    const loaded = this.of(block);
    const server = this.#ready();
    if (server === null || loaded === null) return null;
    let asked = this.#events.get(loaded);
    if (asked === undefined) {
      asked = new Map();
      this.#events.set(loaded, asked);
    }
    const key = JSON.stringify(claims);
    const known = asked.get(key);
    if (known !== undefined) return known;
    const held = asked;
    const read = server.matchClaimEvents(saveManifest(manifest), loaded.file, claims);
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
   * else why not (the table is kept): while no server reads tables, asking
   * nothing, `unavailable`.
   */
  async believe(block: string, manifest: Manifest, belief: StatedBelief): Promise<string | null> {
    const loaded = this.of(block);
    const server = this.#ready();
    if (server === null) return this.#why();
    if (loaded === null)
      return `Your belief in ${belief.claim} was not recorded: no table is loaded.`;
    const text = saveManifest(manifest);
    try {
      const file = await server.believeMatchClaim(text, loaded.file, belief);
      const table = await server.matchClaims(text, file);
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
