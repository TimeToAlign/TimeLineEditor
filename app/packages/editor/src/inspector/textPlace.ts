/**
 * Where the selection lies in the Manifest tab's text: the places of the
 * selected elements in the block's manifest (core's `resolvedPath`, led
 * into the file form), and the lines of the text holding each place, found
 * in JSON and TOML here and in YAML by the YAML codec, which holds the
 * parser. A place the text does not show (the styling left out) has no
 * lines.
 */

import type { Subject } from "@timetoalign/tilie-arranger";
import type { PathSegment } from "@timetoalign/tilie-core";
import { addressKey, idFormPath, resolvedPath } from "@timetoalign/tilie-core";
import { destinationRows, flowOf } from "./flow.ts";

/** The lines of a text holding a place, 1-based, `last` included. */
export interface Lines {
  readonly first: number;
  readonly last: number;
}

/** A place in a text: the offset of its first character and the offset after its last. */
export type Span = readonly [number, number];

/**
 * The places of the selection in its block's manifest file, in selection
 * order, each once: each subject's (`resolvedPath`). A jump selected with
 * what one of its destinations leads to, as choosing that destination in
 * the Properties tab selects them, is placed at that destination in the
 * jump's `targets` (every destination leading there), followed by the
 * places of the elements it leads to.
 */
export function selectionPaths(subjects: readonly Subject[]): PathSegment[][] {
  const paths: PathSegment[][] = [];
  const seen = new Set<string>();
  const add = (path: readonly PathSegment[] | null) => {
    if (path === null) return;
    const file = idFormPath(path, true);
    const key = JSON.stringify(file);
    if (seen.has(key)) return;
    seen.add(key);
    paths.push(file);
  };
  const flow = subjects.length > 1 ? flowOf(subjects) : null;
  if (flow !== null) {
    const selected = new Set(subjects.map((subject) => addressKey(subject.address)));
    const jump = resolvedPath(flow.subject.resolved);
    const chosen = destinationRows(flow).filter(
      (row) =>
        row.marks.length > 1 && row.marks.slice(1).every((mark) => selected.has(addressKey(mark))),
    );
    if (jump !== null && chosen.length > 0) {
      for (const row of chosen) add([...jump, "targets", row.index]);
      const jumpKey = addressKey(flow.target);
      for (const subject of subjects) {
        if (addressKey(subject.address) !== jumpKey && subject !== flow.subject) {
          add(resolvedPath(subject.resolved));
        }
      }
      return paths;
    }
  }
  for (const subject of subjects) add(resolvedPath(subject.resolved));
  return paths;
}

/** The lines `span` covers in `text`, white space at its end left out. */
export function linesOf(text: string, [start, end]: Span): Lines {
  let last = end;
  while (last > start && /\s/u.test(text.charAt(last - 1))) last -= 1;
  const lineAt = (offset: number) => text.slice(0, offset).split("\n").length;
  return { first: lineAt(start), last: lineAt(Math.max(start, last - 1)) };
}

/**
 * How far to scroll a text whose rows are `row` tall so that the line
 * `first` shows with one line above it: the top of the line before it,
 * never above the text's top.
 */
export function scrollTopFor(first: number, row: number): number {
  return Math.max(0, (first - 2) * row);
}

// JSON -------------------------------------------------------------------

/**
 * The place of `path` in the JSON text `text`: a member from its key to
 * the end of its value, an item its value; `null` where the text holds no
 * such place or is no JSON the scan can follow.
 */
export function jsonSpan(text: string, path: readonly PathSegment[]): Span | null {
  if (path.length === 0) return null;
  let at = 0;
  const space = () => {
    while (at < text.length && /\s/u.test(text.charAt(at))) at += 1;
  };
  const string = (): string => {
    const start = at;
    at += 1;
    while (at < text.length && text.charAt(at) !== '"') at += text.charAt(at) === "\\" ? 2 : 1;
    at += 1;
    return JSON.parse(text.slice(start, at)) as string;
  };
  /** Skip one value, or go into it along `path` from `depth`; the place found, else `null`. */
  const value = (depth: number): Span | null => {
    space();
    const open = text.charAt(at);
    if (open === '"') {
      string();
      return null;
    }
    if (open !== "{" && open !== "[") {
      while (at < text.length && !/[\s,\]}]/u.test(text.charAt(at))) at += 1;
      return null;
    }
    const close = open === "{" ? "}" : "]";
    const wanted = path[depth];
    at += 1;
    space();
    if (text.charAt(at) === close) {
      at += 1;
      return null;
    }
    for (let index = 0; at < text.length; index += 1) {
      space();
      const start = at;
      const key = open === "{" ? string() : index;
      if (open === "{") {
        space();
        if (text.charAt(at) !== ":") throw new SyntaxError("a member without a colon");
        at += 1;
      }
      const here = key === wanted;
      if (here && depth === path.length - 1) {
        space();
        const from = open === "{" ? start : at;
        value(path.length);
        return [from, at];
      }
      const found = value(here ? depth + 1 : path.length);
      if (found !== null) return found;
      space();
      const next = text.charAt(at);
      at += 1;
      if (next === close) return null;
      if (next !== ",") throw new SyntaxError("a value without a comma after it");
    }
    return null;
  };
  try {
    return value(0);
  } catch {
    return null;
  }
}

// TOML -------------------------------------------------------------------

/** One stretch of a TOML text: a table from its header, or a key and its value; its place and lines. */
interface TomlEntry {
  readonly path: readonly PathSegment[];
  readonly first: number;
  last: number;
}

/** The keys of a dotted key (`a."b c".d`), each bare, basic-quoted or literal-quoted. */
function dottedKeys(text: string): string[] | null {
  const keys: string[] = [];
  let at = 0;
  const pattern = /\s*(?:"((?:[^"\\]|\\.)*)"|'([^']*)'|([A-Za-z0-9_-]+))\s*/uy;
  while (at < text.length) {
    pattern.lastIndex = at;
    const match = pattern.exec(text);
    if (match === null) return null;
    const [whole, basic, literal, bare] = match;
    keys.push(basic !== undefined ? (JSON.parse(`"${basic}"`) as string) : (literal ?? bare ?? ""));
    at += whole.length;
    if (at < text.length) {
      if (text.charAt(at) !== ".") return null;
      at += 1;
    }
  }
  return keys;
}

/** A table of the text as its headers build it: its subtables and its arrays of tables. */
interface TomlTable {
  readonly tables: Map<string, TomlTable>;
  readonly arrays: Map<string, TomlTable[]>;
}

const newTable = (): TomlTable => ({ tables: new Map(), arrays: new Map() });

/**
 * The stretches of a TOML text: every table and array-of-tables element
 * from its header to the line before the next header, every key from its
 * line to its value's end. A header's keys name the last element of every
 * array of tables they pass through, as TOML reads them.
 */
function tomlEntries(text: string): TomlEntry[] {
  const lines = text.split("\n");
  const root = newTable();
  const entries: TomlEntry[] = [];
  let table: readonly PathSegment[] = [];
  let open: TomlEntry | null = null;
  let depth = 0;
  let quoted: string | null = null;
  lines.forEach((raw, index) => {
    const line = index + 1;
    if (quoted !== null || depth > 0) {
      // A line of a value begun on a key's line belongs to that key.
      ({ depth, quoted } = scanValue(raw, depth, quoted));
      if (open !== null) open.last = line;
      return;
    }
    const header = /^\s*(\[\[?)(.*?)\]\]?\s*(?:#.*)?$/u.exec(raw);
    const keyed =
      header === null ? /^\s*((?:[^=#"']|"(?:[^"\\]|\\.)*"|'[^']*')+?)\s*=/u.exec(raw) : null;
    if (header !== null) {
      const keys = dottedKeys(header[2] ?? "");
      if (keys === null) return;
      const element = header[1] === "[[";
      const path: PathSegment[] = [];
      let node = root;
      keys.forEach((key, at) => {
        const array = node.arrays.get(key);
        if (element && at === keys.length - 1) {
          const items = array ?? [];
          node.arrays.set(key, items);
          items.push(newTable());
          path.push(key, items.length - 1);
          node = items.at(-1) as TomlTable;
        } else if (array !== undefined && array.length > 0) {
          path.push(key, array.length - 1);
          node = array.at(-1) as TomlTable;
        } else {
          const next = node.tables.get(key) ?? newTable();
          node.tables.set(key, next);
          path.push(key);
          node = next;
        }
      });
      for (const entry of entries)
        if (entry.last === Number.POSITIVE_INFINITY) entry.last = line - 1;
      table = path;
      open = { path, first: line, last: Number.POSITIVE_INFINITY };
      entries.push(open);
      return;
    }
    if (keyed !== null) {
      const keys = dottedKeys(keyed[1] ?? "");
      if (keys !== null) {
        open = { path: [...table, ...keys], first: line, last: line };
        entries.push(open);
        const rest = raw.slice(keyed[0].length);
        ({ depth, quoted } = scanValue(rest, 0, null));
      }
    }
  });
  for (const entry of entries)
    if (entry.last === Number.POSITIVE_INFINITY) entry.last = lines.length;
  return entries;
}

/** The depth of brackets and braces, and the open multi-line string, after `text` of a value. */
function scanValue(
  text: string,
  depth: number,
  quoted: string | null,
): { depth: number; quoted: string | null } {
  let at = 0;
  let open = quoted;
  let level = depth;
  while (at < text.length) {
    if (open !== null) {
      const end = text.indexOf(open, at);
      if (end < 0) return { depth: level, quoted: open };
      at = end + open.length;
      open = null;
      continue;
    }
    const char = text.charAt(at);
    if (char === "#") break;
    if (text.startsWith('"""', at) || text.startsWith("'''", at)) {
      open = text.slice(at, at + 3);
      at += 3;
    } else if (char === '"') {
      at += 1;
      while (at < text.length && text.charAt(at) !== '"') at += text.charAt(at) === "\\" ? 2 : 1;
      at += 1;
    } else if (char === "'") {
      const end = text.indexOf("'", at + 1);
      at = end < 0 ? text.length : end + 1;
    } else {
      if (char === "[" || char === "{") level += 1;
      if (char === "]" || char === "}") level -= 1;
      at += 1;
    }
  }
  return { depth: Math.max(0, level), quoted: open };
}

/** Whether `path` begins with `prefix`. */
const startsWith = (path: readonly PathSegment[], prefix: readonly PathSegment[]) =>
  prefix.length <= path.length && prefix.every((key, index) => path[index] === key);

/**
 * The lines of `path` in the TOML text `text`: every stretch within it
 * (a table with its subtables, an element of an array of tables, a key),
 * from the first's first line to the last's last, trailing blank lines
 * left out; where the place lies inside a value, the lines of that key.
 * `null` where the text holds no such place.
 */
export function tomlLines(text: string, path: readonly PathSegment[]): Lines | null {
  if (path.length === 0) return null;
  const entries = tomlEntries(text);
  const within = entries.filter((entry) => startsWith(entry.path, path));
  const holder = entries
    .filter((entry) => entry.path.length > 0 && startsWith(path, entry.path))
    .at(-1);
  const found = within.length > 0 ? within : holder === undefined ? [] : [holder];
  if (found.length === 0) return null;
  const lines = text.split("\n");
  const first = Math.min(...found.map((entry) => entry.first));
  let last = Math.max(...found.map((entry) => entry.last));
  while (last > first && (lines[last - 1] ?? "").trim() === "") last -= 1;
  return { first, last };
}
