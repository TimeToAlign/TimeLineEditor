/**
 * A manifest as JSON, YAML or TOML text, read back into the lossless
 * manifest value and patched in place.
 *
 * JSON is TimeToShare's standard writer (`dumps`) and lossless reader
 * (`parseJson`), always available. YAML (`yaml.ts`) and TOML (`toml.ts`)
 * keep the parsed document of the text; patching it with a new manifest
 * changes only the values that differ, so the comments typed in the text
 * survive. Their libraries are large, so each codec is loaded by a dynamic
 * import the first time its format is needed (`loadCodec`), and stays in its
 * own chunk of the bundle. Numbers stay exact in all three (`lossless.ts`).
 * Which codecs are loaded is Svelte state: whatever reads `isLoaded` reads
 * again once a codec arrives.
 */

import type { Json } from "@timetoalign/tilie-core";
import { dumps, JsonSyntaxError, parseJson } from "@timetoalign/timetoshare";
import { SvelteMap } from "svelte/reactivity";
import type { Codec, Format, Read, Source, Text } from "./codec.ts";
import type { Result } from "./problems.ts";
import { InspectorCode, refused } from "./problems.ts";

export type { Codec, Format, Read, Source, Text } from "./codec.ts";
export { FORMATS } from "./codec.ts";

/** The word of each format, on its radio button and in its messages. */
export const FORMAT_LABELS: { readonly [format in Format]: string } = {
  json: "JSON",
  yaml: "YAML",
  toml: "TOML",
};

// JSON -------------------------------------------------------------------

const JSON_SOURCE: Source = {
  format: "json",
  patch: (value) => ({ ok: true, value: dumps(value) }),
};

/** The JSON value of `text`; a syntax error at the line and column TimeToShare's reader names. */
function readJson(text: string): Result<Read> {
  try {
    return { ok: true, value: { value: parseJson(text) as Json, source: JSON_SOURCE } };
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    const position =
      error instanceof JsonSyntaxError
        ? { line: error.line, column: error.column }
        : lineColumn(text, text.length);
    return refused(InspectorCode.syntaxError, error.message, [], position);
  }
}

/** The 1-based line and column of the UTF-16 offset `offset` in `text`. */
function lineColumn(text: string, offset: number): { line: number; column: number } {
  const before = text.slice(0, offset).split("\n");
  return { line: before.length, column: (before.at(-1) as string).length + 1 };
}

const JSON_CODEC: Codec = {
  write: (value) => ({ ok: true, value: { text: dumps(value), source: JSON_SOURCE } }),
  read: readJson,
};

/** The codecs loaded so far; JSON from the start. */
const loaded = new SvelteMap<Format, Codec>([["json", JSON_CODEC]]);
const loading = new Map<Format, Promise<Codec>>();

/** Whether `format` can be written and read now, without waiting. */
export function isLoaded(format: Format): boolean {
  return loaded.has(format);
}

/**
 * Load the codec of `format` (once; JSON is already there). A failed import
 * rejects, and the next call tries again.
 */
export function loadCodec(format: Format): Promise<Codec> {
  const ready = loaded.get(format);
  if (ready !== undefined) return Promise.resolve(ready);
  const started =
    loading.get(format) ??
    (format === "yaml" ? import("./yaml.ts") : import("./toml.ts")).then(
      (module) => {
        loaded.set(format, module.codec);
        return module.codec;
      },
      (error: unknown) => {
        loading.delete(format);
        throw error;
      },
    );
  loading.set(format, started);
  return started;
}

function codecOf(format: Format): Codec {
  const codec = loaded.get(format);
  if (codec === undefined) throw new Error(`the ${format} codec is not loaded; await loadCodec`);
  return codec;
}

/**
 * The text of `value` in `format`, freshly written.
 *
 * @throws {Error} when the format's codec has not been loaded (`loadCodec`).
 */
export function writeText(format: Format, value: Json): Result<Text> {
  return codecOf(format).write(value);
}

/**
 * The manifest value of `text` in `format`, or why it cannot be read.
 *
 * @throws {Error} when the format's codec has not been loaded (`loadCodec`).
 */
export function readText(format: Format, text: string): Result<Read> {
  return codecOf(format).read(text);
}
