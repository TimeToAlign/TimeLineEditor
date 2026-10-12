/**
 * The TOML codec of the inspector, loaded on first use:
 * `@decimalturn/toml-patch` with every integer a `bigint`. The parsed
 * document is kept and patched, so comments survive; nulls follow the rule
 * of `nulls.ts`.
 */

import { stringify, TomlDocument } from "@decimalturn/toml-patch";
import type { Json } from "@timetoalign/tilie-core";
import type { Codec, Read, Source, Text } from "./codec.ts";
import { fromLibrary, toLibrary } from "./lossless.ts";
import { omitNulls, restoreNulls } from "./nulls.ts";
import type { Result } from "./problems.ts";
import { catching, InspectorCode, refused } from "./problems.ts";

/**
 * Plain JavaScript integers (only integral floats reach the library as
 * plain numbers) are written with a fractional digit, `bigint`s as integers;
 * every table is its own `[section]` (arrays of arrays stay inline, as TOML
 * requires).
 */
const TOML_FORMAT = { minimumDecimals: 1, inlineTableStart: Number.MAX_SAFE_INTEGER } as const;
const TOML_OPTIONS = { integersAsBigInt: true } as const;

function tomlSource(document: TomlDocument): Source {
  return {
    format: "toml",
    patch: (value) =>
      catching(() => {
        document.patch(toLibrary(omitNulls(value)), TOML_FORMAT);
        return document.toTomlString;
      }),
  };
}

function writeToml(value: Json): Result<Text> {
  const written = catching(() => stringify(toLibrary(omitNulls(value)), TOML_FORMAT));
  if (!written.ok) return written;
  const document = new TomlDocument(written.value, TOML_OPTIONS);
  return { ok: true, value: { text: written.value, source: tomlSource(document) } };
}

function readToml(text: string): Result<Read> {
  let document: TomlDocument;
  let parsed: unknown;
  try {
    document = new TomlDocument(text, TOML_OPTIONS);
    // The document checks the grammar; building its value checks the rest (a key defined twice).
    parsed = document.toJsObject;
  } catch (error) {
    const { line, column } = error as { line?: number; column?: number };
    const message = ((error as Error).message.split("\n").at(-1) as string) || "invalid TOML";
    const position =
      typeof line === "number" && typeof column === "number" ? { line, column: column + 1 } : null;
    return refused(InspectorCode.syntaxError, message, [], position);
  }
  const read = catching(() => restoreNulls(fromLibrary(parsed)));
  return read.ok ? { ok: true, value: { value: read.value, source: tomlSource(document) } } : read;
}

export const codec: Codec = { write: writeToml, read: readToml };
