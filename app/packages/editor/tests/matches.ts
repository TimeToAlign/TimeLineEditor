/// <reference types="node" />
/**
 * The MatchClaim table of the editor's MatchStamp tests (`README.md`,
 * "MatchClaims and the Matchstamp tab"): the manifest of TimeToShare's table
 * fixture and five instant MatchClaims over it, with their beliefs.
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { LiveStore } from "@timetoalign/tilie-arranger";
import type { MatchClaimTable } from "@timetoalign/tilie-client";
import type { ClaimTimeline, Manifest } from "@timetoalign/tilie-core";
import {
  BELIEFS,
  DEFAULT_USER,
  isLoadError,
  loadManifest,
  matchClaimColumns,
  statedBy,
} from "@timetoalign/tilie-core";
import { Rational } from "@timetoalign/tilie-core/numbers";
import type { Belief } from "@timetoalign/timetoshare";
import { SCHEMA_VERSION } from "@timetoalign/timetoshare";
import type { MatchIndexes } from "../src/inspector/matchstamps.ts";
import { blockIndexes } from "../src/inspector/matchstamps.ts";
import type { MatchClaimTables } from "../src/matchClaims.svelte.ts";

export const q = (n: number, d = 1) => Rational.fromParts(BigInt(n), BigInt(d));

const directory = path.join(
  path.dirname(createRequire(import.meta.url).resolve("@timetoalign/timetoshare/package.json")),
  "fixtures",
  "tables",
  SCHEMA_VERSION,
);

/** The text of the table fixture's manifest. */
export const TABLE_MANIFEST_TEXT = readFileSync(path.join(directory, "manifest.yaml"), "utf8");

/** The table fixture's manifest. */
export function tableManifest(): Manifest {
  const manifest = loadManifest(TABLE_MANIFEST_TEXT);
  if (isLoadError(manifest)) throw new Error("the table fixture's manifest is refused");
  return manifest;
}

/** The editor's default user, as the belief filter's believer. */
export const ME = statedBy(DEFAULT_USER);
export const OTHER = "tag:example.org,2026:other";

/** The editor's `indexesOf` over `tables` for the user `ME`, reading the view of `live` as the editor reads its own. */
export function indexesOver(
  live: LiveStore,
  tables: MatchClaimTables,
): (block: string) => MatchIndexes | null {
  return (block) => blockIndexes(live.view, block, tables.of(block)?.table ?? null, ME);
}

/** The timelines of the table, numbered by ID. */
export const TIMELINES: readonly ClaimTimeline[] = [
  { id: "clt_1", numberType: "fraction" },
  { id: "clt_2", numberType: "fraction" },
  { id: "cpt_1", numberType: "float" },
  { id: "dpt_1", numberType: "int" },
];

/** Every claim's beliefs, `[actor, belief]`, by row. */
type Beliefs = readonly (readonly (readonly [string, Belief])[])[];

/** The table's beliefs by row: `claim_3` the user's false, `claim_4` the other's true, `claim_5` the user's true. */
export const BELIEFS_BY_ROW: Beliefs = [[], [], [[ME, "false"]], [[OTHER, "true"]], [[ME, "true"]]];

/** The five MatchClaims of the table with `beliefs` (by row). */
export function matchTable(beliefs: Beliefs = BELIEFS_BY_ROW): MatchClaimTable {
  const columns = matchClaimColumns(TIMELINES, [
    { id: "claim_1", timelines: [0, 3], start: [q(0), 0n] },
    { id: "claim_2", timelines: [0, 2], start: [q(0), 0] },
    { id: "claim_3", timelines: [0, 3], start: [q(4), 176400n] },
    { id: "claim_4", timelines: [0, 3], start: [q(4), 176400n] },
    { id: "claim_5", timelines: [2, 3], start: [8, 352800n] },
  ]);
  const actors = [ME, OTHER];
  const offsets = [0];
  const actor: number[] = [];
  const word: number[] = [];
  for (const row of beliefs) {
    for (const [who, belief] of row) {
      actor.push(actors.indexOf(who));
      word.push(BELIEFS.indexOf(belief));
    }
    offsets.push(actor.length);
  }
  return {
    columns,
    beliefs: {
      actors,
      offsets: Uint32Array.from(offsets),
      actor: Uint32Array.from(actor),
      word: Uint8Array.from(word),
    },
  };
}
