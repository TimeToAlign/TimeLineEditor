/**
 * The YAML codec of the inspector, loaded on first use: the `yaml` package
 * with every integer a `bigint` and the YAML 1.2 core schema. The parsed
 * document is kept and patched node by node, so comments survive wherever a
 * value keeps its kind.
 */

import type { Json } from "@timetoalign/tilie-core";
import { dumps, isJsonFloat } from "@timetoalign/timeskeleton";
import type { Node } from "yaml";
import {
  Document,
  isAlias,
  isMap,
  isScalar,
  isSeq,
  Pair,
  parseDocument,
  Scalar,
  YAMLMap,
  YAMLSeq,
} from "yaml";
import type { Codec, Read, Source, Text } from "./codec.ts";
import { fromLibrary, toLibrary } from "./lossless.ts";
import type { Result } from "./problems.ts";
import { catching, InspectorCode, ProblemError, refused } from "./problems.ts";

const YAML_OPTIONS = { intAsBigInt: true, schema: "core", uniqueKeys: true } as const;

/** A YAML node holding `value`; sequences of scalars only are written in flow style. */
function yamlNode(document: Document, value: Json): Node {
  if (Array.isArray(value)) {
    const sequence = new YAMLSeq<Node>();
    for (const item of value) sequence.items.push(yamlNode(document, item));
    sequence.flow = value.every(
      (item) => item === null || typeof item !== "object" || isJsonFloat(item),
    );
    return sequence;
  }
  if (value !== null && typeof value === "object" && !isJsonFloat(value)) {
    const map = new YAMLMap<Scalar, Node>();
    for (const [key, item] of Object.entries(value)) {
      map.items.push(new Pair(new Scalar(key), yamlNode(document, item)));
    }
    return map;
  }
  const scalar = new Scalar(toLibrary(value));
  setScalarFormat(scalar, value);
  return scalar;
}

/** An integral float is written with a fractional digit (`2.0`), so YAML reads a float back. */
function setScalarFormat(scalar: Scalar, value: Json): void {
  delete scalar.format;
  delete scalar.type;
  if (isJsonFloat(value)) scalar.minFractionDigits = 1;
  else delete scalar.minFractionDigits;
}

/** The manifest value of a YAML node. */
function fromYaml(document: Document, node: unknown, path: (string | number)[]): Json {
  if (isAlias(node)) return fromYaml(document, node.resolve(document), path);
  if (isMap(node)) {
    const entries: [string, Json][] = [];
    for (const pair of node.items) {
      const key = isScalar(pair.key) ? pair.key.value : pair.key;
      if (key === null || typeof key === "object") {
        throw new ProblemError({
          code: InspectorCode.invalidValue,
          message: "a key must be a string",
          path,
        });
      }
      const name = String(key);
      entries.push([name, fromYaml(document, pair.value, [...path, name])]);
    }
    return Object.fromEntries(entries);
  }
  if (isSeq(node))
    return node.items.map((item, index) => fromYaml(document, item, [...path, index]));
  if (isScalar(node)) return fromLibrary(node.value, path);
  if (node === null || node === undefined) return null;
  throw new ProblemError({ code: InspectorCode.invalidValue, message: "not a JSON value", path });
}

/** Change `node` to hold `value`, in place where the kinds agree; returns the node to keep. */
function patchYaml(document: Document, node: unknown, value: Json): Node {
  if (Array.isArray(value)) {
    if (!isSeq(node)) return yamlNode(document, value);
    node.items.length = Math.min(node.items.length, value.length);
    value.forEach((item, index) => {
      node.items[index] =
        index < node.items.length
          ? patchYaml(document, node.items[index], item)
          : yamlNode(document, item);
    });
    return node;
  }
  if (value !== null && typeof value === "object" && !isJsonFloat(value)) {
    if (!isMap(node)) return yamlNode(document, value);
    const wanted = value as { readonly [key: string]: Json };
    const keyOf = (pair: Pair): string => String(isScalar(pair.key) ? pair.key.value : pair.key);
    node.items = node.items.filter((pair) => Object.hasOwn(wanted, keyOf(pair as Pair)));
    const present = new Set<string>();
    for (const pair of node.items) {
      const key = keyOf(pair as Pair);
      present.add(key);
      pair.value = patchYaml(document, pair.value, wanted[key] as Json);
    }
    for (const [key, item] of Object.entries(wanted)) {
      if (!present.has(key)) node.items.push(new Pair(new Scalar(key), yamlNode(document, item)));
    }
    return node;
  }
  if (!isScalar(node)) return yamlNode(document, value);
  if (sameScalar(node.value, value)) return node;
  node.value = toLibrary(value);
  setScalarFormat(node, value);
  return node;
}

/** Whether a scalar already holds `value`: the same kind of number with the same value, or the same string, boolean or null. */
function sameScalar(current: unknown, value: Json): boolean {
  try {
    return dumps(fromLibrary(current)) === dumps(value);
  } catch {
    return false;
  }
}

function yamlSource(document: Document): Source {
  return {
    format: "yaml",
    patch: (value) =>
      catching(() => {
        document.contents = patchYaml(
          document,
          document.contents,
          value,
        ) as typeof document.contents;
        return document.toString();
      }),
  };
}

function writeYaml(value: Json): Result<Text> {
  const document = new Document(null, YAML_OPTIONS);
  document.contents = yamlNode(document, value) as typeof document.contents;
  return { ok: true, value: { text: document.toString(), source: yamlSource(document) } };
}

function readYaml(text: string): Result<Read> {
  const document = parseDocument(text, YAML_OPTIONS);
  const [error] = document.errors;
  if (error !== undefined) {
    const start = error.linePos?.[0];
    const position = start === undefined ? null : { line: start.line, column: start.col };
    // The message repeats the position, which the problem carries on its own.
    const message = (error.message.split("\n")[0] as string).replace(
      / at line \d+, column \d+:?$/,
      "",
    );
    return refused(InspectorCode.syntaxError, message, [], position);
  }
  const read = catching(() => fromYaml(document, document.contents, []));
  return read.ok ? { ok: true, value: { value: read.value, source: yamlSource(document) } } : read;
}

export const codec: Codec = { write: writeYaml, read: readYaml };
