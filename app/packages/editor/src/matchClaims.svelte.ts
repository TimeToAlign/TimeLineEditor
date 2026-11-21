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
 */

import type {
  ClaimProvenance,
  MatchClaimTable,
  Server,
  StatedBelief,
} from "@timetoalign/tilie-client";
import { ServerError } from "@timetoalign/tilie-client";
import type { Manifest } from "@timetoalign/tilie-core";
import { saveManifest } from "@timetoalign/tilie-core";
import { SvelteMap } from "svelte/reactivity";
import { MATCH_CLAIM_TABLE, saveFile } from "./files.ts";
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

/** What the tables need of a server: the table route and the provenance routes. */
export type MatchClaimServer = Pick<
  Server,
  "matchClaims" | "matchClaimProvenance" | "believeMatchClaim"
>;

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

  /** The tables read through `server`; `null`: no server, so no table is ever read. */
  constructor(server: MatchClaimServer | null) {
    this.#server = server;
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

  /** Forget every table: another workspace was opened. */
  clear(): void {
    this.#tables.clear();
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
    this.#tables.set(block, kept);
  }
}
