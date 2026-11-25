/** The formats the inspector shows and the shape of one format's codec. */

import type { Json, PathSegment } from "@timetoalign/tilie-core";
import type { Result } from "./problems.ts";
import type { Lines } from "./textPlace.ts";

/** The formats in the order the format switches list them: YAML, the main serialization, first. */
export const FORMATS = ["yaml", "json", "toml"] as const;
/** One of the formats: `yaml`, `json` or `toml`. */
export type Format = (typeof FORMATS)[number];

/**
 * The parsed document behind a text. `patch` changes the document to hold
 * `value`, keeping everything of the text that `value` does not change, and
 * returns the new text.
 */
export interface Source {
  readonly format: Format;
  patch(value: Json): Result<string>;
}

/** A text and the document it was written from or read into. */
export interface Text {
  readonly text: string;
  readonly source: Source;
}

/** What reading a text gives: the manifest value and the document. */
export interface Read {
  readonly value: Json;
  readonly source: Source;
}

/** Writing and reading one format, and finding a place in its text. */
export interface Codec {
  write(value: Json): Result<Text>;
  read(text: string): Result<Read>;
  /** The lines of `text` holding the value at `path`; `null` where it holds none. */
  locate(text: string, path: readonly PathSegment[]): Lines | null;
}
