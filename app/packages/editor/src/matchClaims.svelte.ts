/**
 * The MatchClaim tables of the open workspace: per block the table its
 * manifest's MatchClaims were read from, as the server answered it (the
 * anchor index's columns and every row's beliefs). A table is held for the
 * session only, never written to the workspace file: after reopening a
 * workspace its table is picked again. A table is read through the server,
 * which checks it against the block's manifest (`POST /api/match-claims`);
 * without a server there is none.
 */

import type { MatchClaimTable, Server } from "@timetoalign/tilie-client";
import { ServerError } from "@timetoalign/tilie-client";
import type { Manifest } from "@timetoalign/tilie-core";
import { saveManifest } from "@timetoalign/tilie-core";
import { SvelteMap } from "svelte/reactivity";
import { messageOf } from "./messages.svelte.ts";

/** What a block's table is read from: its file's name and the server's answer. */
export interface LoadedTable {
  readonly name: string;
  readonly table: MatchClaimTable;
}

/** Without a server: what is said wherever matches are asked for. */
export const MATCHES_NEED_A_SERVER =
  "Matches need a server: MatchClaim tables are read through tilie-server.";

/** HTTP 501: the server cannot read MatchClaim tables. */
const NOT_IMPLEMENTED = 501;

/** Why `name` was not loaded, from the server's failure `error`. */
export function loadFailure(name: string, error: unknown): string {
  if (!(error instanceof ServerError)) return `${name} could not be loaded: ${messageOf(error)}`;
  if (error.code === "unreachable") {
    return `${name} could not be loaded: the server did not answer (${error.message}).`;
  }
  if (error.status === NOT_IMPLEMENTED) {
    return `${name} could not be loaded: this server cannot read MatchClaim tables.`;
  }
  const problems = error.refusal?.problems ?? [];
  const listed = problems.map((problem) =>
    problem.row === null ? problem.message : `row ${problem.row}: ${problem.message}`,
  );
  const reasons = listed.length > 0 ? listed.join("; ") : error.message;
  return `${name} could not be loaded: ${reasons}`;
}

export class MatchClaimTables {
  readonly #tables = new SvelteMap<string, LoadedTable>();
  readonly #server: Pick<Server, "matchClaims"> | null;

  /** The tables read through `server`; `null`: no server, so no table is ever read. */
  constructor(server: Pick<Server, "matchClaims"> | null) {
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
      this.hold(block, { name, table });
      return null;
    } catch (error) {
      return loadFailure(name, error);
    }
  }
}
