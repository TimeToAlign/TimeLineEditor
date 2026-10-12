/**
 * A manifest as JSON, YAML or TOML text, read back into the lossless
 * manifest value and patched in place.
 *
 * JSON is timeskeleton's standard writer (`dumps`) and lossless reader
 * (`parseJson`), always available. YAML (`yaml.ts`) and TOML (`toml.ts`)
 * keep the parsed document of the text; patching it with a new manifest
 * changes only the values that differ, so the comments typed in the text
 * survive. Their libraries are large, so each codec is loaded by a dynamic
 * import the first time its format is needed (`loadCodec`), and stays in its
 * own chunk of the bundle. Numbers stay exact in all three (`lossless.ts`).
 */

import type { Json } from "@timetoalign/tilie-core";
import { dumps, parseJson } from "@timetoalign/timeskeleton";
import type { Codec, Format, Read, Source, Text } from "./codec.ts";
import type { Result } from "./problems.ts";
import { InspectorCode, refused } from "./problems.ts";

export type { Codec, Format, Read, Source, Text } from "./codec.ts";
export { FORMATS } from "./codec.ts";

// JSON -------------------------------------------------------------------

const JSON_SOURCE: Source = {
  format: "json",
  patch: (value) => ({ ok: true, value: dumps(value) }),
};

function readJson(text: string): Result<Read> {
  try {
    return { ok: true, value: { value: parseJson(text) as Json, source: JSON_SOURCE } };
  } catch (error) {
    const message = (error as Error).message;
    const offset = /at position (\d+)/.exec(message);
    const position = lineColumn(text, offset === null ? text.length : Number(offset[1]));
    return refused(InspectorCode.syntaxError, message, [], position);
  }
}

/** The 1-based line and column of the UTF-16 offset `offset` in `text`. */
export function lineColumn(text: string, offset: number): { line: number; column: number } {
  const before = text.slice(0, offset).split("\n");
  return { line: before.length, column: (before.at(-1) as string).length + 1 };
}

const JSON_CODEC: Codec = {
  write: (value) => ({ ok: true, value: { text: dumps(value), source: JSON_SOURCE } }),
  read: readJson,
};

/** The codecs loaded so far; JSON from the start. */
const loaded: { [format in Format]?: Codec } = { json: JSON_CODEC };
const loading: { [format in Format]?: Promise<Codec> } = {};

/** Whether `format` can be written and read now, without waiting. */
export function isLoaded(format: Format): boolean {
  return loaded[format] !== undefined;
}

/**
 * Load the codec of `format` (once; JSON is already there). A failed import
 * rejects, and the next call tries again.
 */
export function loadCodec(format: Format): Promise<Codec> {
  const ready = loaded[format];
  if (ready !== undefined) return Promise.resolve(ready);
  const started =
    loading[format] ??
    (format === "yaml" ? import("./yaml.ts") : import("./toml.ts")).then(
      (module) => {
        loaded[format] = module.codec;
        return module.codec;
      },
      (error: unknown) => {
        delete loading[format];
        throw error;
      },
    );
  loading[format] = started;
  return started;
}

function codecOf(format: Format): Codec {
  const codec = loaded[format];
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
