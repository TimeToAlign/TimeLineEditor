/**
 * The YAML codec of the inspector, loaded on first use. A manifest is
 * written as TimeToShare's canonical YAML (`dumps`), so the text is the
 * manifest file's, and read by TimeToShare's `parseYaml`, so the tab
 * accepts exactly what Import accepts. The text is also parsed by the
 * `yaml` package (every integer a `bigint`, the YAML 1.2 core schema) into
 * a document that is kept and patched node by node, so comments survive
 * wherever a value keeps its kind. A patch that leaves the value as it is
 * returns the text as it stands; one that changes it writes a document
 * holding a comment in the library's layout, one without again in
 * canonical YAML. Comments are no part of a manifest; keeping them is a
 * convenience of the text.
 */

import type { Json } from "@timetoalign/tilie-core";
import { dumps, isJsonFloat, parseYaml, YamlSyntaxError } from "@timetoalign/timetoshare";
import type { Document, Node } from "yaml";
import { isMap, isScalar, isSeq, Pair, parseDocument, Scalar, visit, YAMLMap, YAMLSeq } from "yaml";
import type { Codec, Read, Source, Text } from "./codec.ts";
import { fromLibrary, toLibrary } from "./lossless.ts";
import type { Result } from "./problems.ts";
import { catching, InspectorCode, refused } from "./problems.ts";

const YAML_OPTIONS = { intAsBigInt: true, schema: "core", uniqueKeys: true } as const;

/** How a document holding comments is written: sequences of scalars as canonical YAML spells them, `[8, 1]`. */
const TO_STRING = { flowCollectionPadding: false } as const;

/** Whether `document` holds a comment anywhere. */
function hasComments(document: Document): boolean {
  if (document.commentBefore || document.comment) return true;
  let found = false;
  visit(document, (_, node) => {
    if ((isScalar(node) || isMap(node) || isSeq(node)) && (node.commentBefore || node.comment)) {
      found = true;
      return visit.BREAK;
    }
    return undefined;
  });
  return found;
}

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
    return sameValue(fromLibrary(current), value);
  } catch {
    return false;
  }
}

/** Whether two values have one standard text; a value `dumps` refuses equals nothing. */
function sameValue(held: Json, value: Json): boolean {
  try {
    return dumps(held) === dumps(value);
  } catch {
    return false;
  }
}

/**
 * The document of `text`, whose value is `value`. A patch to the value the
 * source last held returns its text unchanged.
 */
function yamlSource(document: Document, text: string, value: Json): Source {
  let held = { text, value };
  return {
    format: "yaml",
    patch: (next) =>
      catching(() => {
        if (sameValue(held.value, next)) return held.text;
        document.contents = patchYaml(
          document,
          document.contents,
          next,
        ) as typeof document.contents;
        held = {
          text: hasComments(document) ? document.toString(TO_STRING) : dumps(next),
          value: next,
        };
        return held.text;
      }),
  };
}

function writeYaml(value: Json): Result<Text> {
  const text = dumps(value);
  return {
    ok: true,
    value: { text, source: yamlSource(parseDocument(text, YAML_OPTIONS), text, value) },
  };
}

/** The manifest value of `text`; a refusal at the line and column TimeToShare's reader names. */
function readYaml(text: string): Result<Read> {
  let value: Json;
  try {
    value = parseYaml(text) as Json;
  } catch (error) {
    if (!(error instanceof YamlSyntaxError)) throw error;
    const position = { line: error.line, column: error.column };
    return refused(InspectorCode.syntaxError, error.message, [], position);
  }
  const document = parseDocument(text, YAML_OPTIONS);
  return { ok: true, value: { value, source: yamlSource(document, text, value) } };
}

/** The YAML codec: `writeYaml` and `readYaml`. */
export const codec: Codec = { write: writeYaml, read: readYaml };
