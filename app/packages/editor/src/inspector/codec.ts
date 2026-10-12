/** The formats the inspector shows and the shape of one format's codec. */

import type { Json } from "@timetoalign/tilie-core";
import type { Result } from "./problems.ts";

export const FORMATS = ["json", "yaml", "toml"] as const;
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

/** Writing and reading one format. */
export interface Codec {
  write(value: Json): Result<Text>;
  read(text: string): Result<Read>;
}
