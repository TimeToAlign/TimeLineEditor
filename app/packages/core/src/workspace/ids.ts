/**
 * Minting IDs: block ids, and the random IDs of the elements a command
 * creates (`createIdMinter`), with the prefix of each kind of element.
 *
 * A minter is a seed and a length L (1 to 13). It starts at `mix64(seed)`;
 * its k-th ID (k = 1, 2, …), for any prefix, is the prefix, `_` and
 * `mix64(start + k) mod 36^L` in base 36, left-padded with `0` to L
 * characters; one counter is shared by every prefix. All arithmetic is
 * modulo 2^64; `mix64` is the finalizer of SplitMix64, a bijection, so a
 * minter of length 13 (36^13 > 2^64) never mints one suffix twice. The
 * schema package's ID vectors (`fixtures/ids/minted_ids.json`) pin the
 * algorithm.
 *
 * The reducer mints nothing: it takes every ID it creates from an `IdSource`,
 * the IDs a command carries, then those a minter gives where the caller
 * holds one (`dispatch`, and `preview` with a copy of the store's minter).
 */

import type { TimelineClass } from "../manifest/elements.ts";
import type { BlockId } from "./blocks.ts";

declare const crypto: { getRandomValues<T extends Uint8Array>(bytes: T): T };

const ID_DIGITS = "0123456789abcdefghijklmnopqrstuvwxyz";

/** A fresh block id: ten random base-36 characters, so concurrent peers never collide. */
export function mintBlockId(
  fill: (bytes: Uint8Array) => void = (bytes) => crypto.getRandomValues(bytes),
): BlockId {
  let id = "";
  const byte = new Uint8Array(1);
  while (id.length < 10) {
    fill(byte);
    const value = byte[0] as number;
    if (value < 252) id += ID_DIGITS[value % 36];
  }
  return id;
}

/** The prefix of a minted timeline ID (`clt_…`, `dpt_…`, …) by its timeline class. */
export const TIMELINE_PREFIX = {
  ContinuousLogicalTimeline: "clt",
  DiscreteLogicalTimeline: "dlt",
  ContinuousPhysicalTimeline: "cpt",
  DiscretePhysicalTimeline: "dpt",
  ContinuousGraphicalTimeline: "cgt",
  DiscreteGraphicalTimeline: "dgt",
} as const satisfies Readonly<Record<TimelineClass, string>>;

/** The prefix of a named timestamp's ID. */
export const TIMESTAMP_PREFIX = "timestamp";

/** The prefix of an elision's ID. */
export const ELISION_PREFIX = "elision";

/** The prefix of a named MatchStamp's ID. */
export const MATCHSTAMP_PREFIX = "matchstamp";

/** The prefix of an alignment anchor's ID. */
export const ANCHOR_PREFIX = "anchor";

/** The prefix of a group's ID. */
export const GROUP_PREFIX = "group";

/** The prefix of a FlowMap's ID. */
export const FLOW_MAP_PREFIX = "flow";

/** The prefix of a region's ID. */
export const REGION_PREFIX = "region";

/** The prefix of a conversion map's ID. */
export const CONVERSION_MAP_PREFIX = "cmap";

/** The number of base-36 characters of a minted ID's suffix by default. */
export const ID_LENGTH = 13;

const MASK = (1n << 64n) - 1n;

/** SplitMix64's finalizer over 64-bit integers, a bijection: `x` is taken modulo 2^64. */
export function mix64(x: bigint): bigint {
  let z = BigInt.asUintN(64, x);
  z ^= z >> 30n;
  z = (z * 0xbf58476d1ce4e5b9n) & MASK;
  z ^= z >> 27n;
  z = (z * 0x94d049bb133111ebn) & MASK;
  z ^= z >> 31n;
  return z;
}

/** A minter: its seed (modulo 2^64), its length, and the next ID it mints for a prefix. */
export interface IdMinter {
  readonly seed: bigint;
  readonly length: number;
  /** The next ID: `prefix`, `_` and the next suffix of the minter. */
  mint(prefix: string): string;
  /**
   * A minter of this one's seed and length at its count: it mints what this
   * one mints next, and minting from either leaves the other where it was.
   */
  copy(): IdMinter;
}

/** The options of `createIdMinter`. */
export interface IdMinterOptions {
  /** The seed, taken modulo 2^64; 64 random bits when left out. */
  readonly seed?: bigint;
  /** The number of base-36 characters of a suffix, 1 to 13; 13 by default. */
  readonly length?: number;
}

/** 64 random bits. */
function randomSeed(): bigint {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return bytes.reduce((seed, byte) => (seed << 8n) | BigInt(byte), 0n);
}

/**
 * A minter of `seed` (64 random bits when left out) and `length` (13 by
 * default); a length that is not an integer from 1 to 13 throws a
 * `RangeError`.
 */
export function createIdMinter(options: IdMinterOptions = {}): IdMinter {
  const length = options.length ?? ID_LENGTH;
  if (!Number.isInteger(length) || length < 1 || length > ID_LENGTH) {
    throw new RangeError(`an ID's length is an integer from 1 to ${ID_LENGTH}, not ${length}`);
  }
  return minterAt(BigInt.asUintN(64, options.seed ?? randomSeed()), length, 0n);
}

/** A minter of `seed` and `length` that has minted `count` IDs. */
function minterAt(seed: bigint, length: number, count: bigint): IdMinter {
  const start = mix64(seed);
  const modulus = 36n ** BigInt(length);
  let counter = count;
  return {
    seed,
    length,
    mint(prefix) {
      counter += 1n;
      const suffix = (mix64(start + counter) % modulus).toString(36).padStart(length, "0");
      return `${prefix}_${suffix}`;
    },
    copy: () => minterAt(seed, length, counter),
  };
}

/** What gives an ID to an element a command creates: one for each call, for an element of `prefix`. */
export type Mint = (prefix: string) => string;

/**
 * Thrown by an `IdSource` asked for more IDs than its command carries when
 * it has no minter; the reducer refuses the command for it.
 */
export class MissingIdError extends Error {
  readonly given: number;
  constructor(given: number) {
    super(`the command carries ${given} IDs and creates more`);
    this.name = "MissingIdError";
    this.given = given;
  }
}

/**
 * Where the reducer takes the IDs of what a command creates, in the order it
 * creates them: the IDs the command carries first, then, with a minter,
 * those the minter mints.
 */
export interface IdSource {
  /** The next ID; throws `MissingIdError` past the given IDs without a minter. */
  readonly take: Mint;
  /** Every ID taken so far, in order. */
  readonly taken: readonly string[];
  /** How many given IDs no call took. */
  readonly left: number;
}

/** A source taking `given` in order, then minting with `minter`, where there is one. */
export function idSource(given: readonly string[], minter: IdMinter | null = null): IdSource {
  const taken: string[] = [];
  return {
    take(prefix) {
      const id = given[taken.length] ?? minter?.mint(prefix);
      if (id === undefined) throw new MissingIdError(given.length);
      taken.push(id);
      return id;
    },
    get taken() {
      return taken;
    },
    get left() {
      return Math.max(0, given.length - taken.length);
    },
  };
}
