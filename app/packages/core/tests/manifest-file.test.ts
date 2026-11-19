import type { FileForm } from "@timetoalign/timetoshare";
import { dumps, loads, SERIALIZATIONS } from "@timetoalign/timetoshare";
import { describe, expect, it } from "vitest";
import { isLoadError } from "../src/errors.ts";
import type { ReadManifestFile } from "../src/manifest/io.ts";
import {
  loadManifest,
  manifestFileValue,
  NEW_MANIFEST_FILE,
  readManifestFile,
  saveManifest,
} from "../src/manifest/io.ts";
import {
  allFixtures,
  fileFormText,
  fileText,
  fixture,
  load,
  loadText,
  manifestValue,
} from "./support.ts";

/** A manifest file's text read, failing loudly if it is refused. */
function read(text: string): ReadManifestFile {
  const result = readManifestFile(text);
  if (isLoadError(result)) throw new Error(`refused: ${JSON.stringify(result.problems)}`);
  return result;
}

/** The text of a YAML text's value without its `graphical` member. */
function unstyled(text: string): string {
  const { graphical: _, ...rest } = loads(text) as { readonly [key: string]: unknown };
  return dumps(rest);
}

/** Every text of the round trip: each fixture and twin in canonical YAML, and `bare` without styling. */
const TEXTS: readonly (readonly [name: string, text: string, minimal: boolean])[] = [
  ...allFixtures.flatMap(({ name, text, twin }) => [
    [name, text, false] as const,
    [`${name} (twin)`, twin, true] as const,
  ]),
  ["bare.yaml without graphical", unstyled(fixture("bare.yaml").text), false],
  ["bare.yaml (twin) without graphical", unstyled(fixture("bare.yaml").twin), true],
];

/** Each text in each serialization, written by the schema package's `dumps` from its value. */
const CASES = TEXTS.flatMap(([name, text, minimal]) =>
  SERIALIZATIONS.map((serialization) => {
    const value = loads(text) as { readonly [key: string]: unknown };
    return {
      name: `${name} in ${serialization}`,
      text: dumps(value, { serialization }),
      file: { minimal, styling: Object.hasOwn(value, "graphical"), serialization },
    };
  }),
);

describe("a manifest file written back as it came", () => {
  it("writes the fixtures and twins in canonical YAML as they are", () => {
    for (const [, text] of TEXTS.slice(0, -2)) expect(dumps(loads(text))).toBe(text);
    expect(read(fixture("bare.yaml").text).file.styling).toBe(true);
    expect(TEXTS.at(-2)?.[1].includes("graphical")).toBe(false);
  });

  it.each(CASES)("infers how $name is written", ({ text, file }) => {
    const result = read(text);
    expect(result.file).toEqual(file);
    expect(result.manifest).toEqual(loadManifest(text));
  });

  it.each(CASES)("writes $name back byte for byte", ({ text }) => {
    const { manifest, file } = read(text);
    expect(saveManifest(manifest, file)).toBe(text);
  });

  it("leaves the styling out when asked", () => {
    const manifest = load("bare.yaml");
    const { graphical: _, ...without } = manifest;
    const plain = saveManifest(manifest, { styling: false });
    expect(Object.hasOwn(loads(plain) as object, "graphical")).toBe(false);
    expect(loadText(plain)).toEqual(without);
    const styled = loadText(saveManifest(manifest, { styling: true }));
    expect(styled.graphical).toEqual(manifest.graphical);
  });

  it("gives the value a file writes: each fixture's own value, from it and from its twin", () => {
    for (const { name, text, twin } of allFixtures) {
      for (const held of [loadManifest(text), loadManifest(twin)]) {
        if (isLoadError(held)) throw new Error(`${name} refused`);
        const before = dumps(held);
        expect(dumps(manifestFileValue(held)), name).toBe(text);
        expect(dumps(held), name).toBe(before);
      }
    }
    const bare = load("bare.yaml");
    expect(Object.hasOwn(bare, "@context")).toBe(false);
    expect(Object.hasOwn(manifestFileValue(bare), "@context")).toBe(true);
  });

  it("writes a manifest as a new one by default: minimal, styled, in canonical YAML", () => {
    const expected: FileForm = { minimal: true, styling: true, serialization: "yaml" };
    expect(NEW_MANIFEST_FILE).toEqual(expected);
    expect(saveManifest(load("bare.yaml"))).toBe(fixture("bare.yaml").twin);
  });

  it.each([
    {
      name: "neither.yaml, neither minimal nor complete",
      text: fileFormText("neither.yaml"),
      file: { minimal: false, styling: true, serialization: "yaml" },
      written: fileFormText("neither.expected.yaml"),
    },
    {
      name: "one_line.json, pretty JSON in another layout",
      text: fileFormText("one_line.json"),
      file: { minimal: true, styling: false, serialization: "json" },
      written: fileFormText("one_line.expected.json"),
    },
    {
      name: "bare.yaml in RFC 8785 JSON after a byte order mark",
      text: `\uFEFF${fileText(manifestValue("bare.yaml"), { serialization: "jcs" })}`,
      file: { minimal: false, styling: true, serialization: "json" },
      written: fileText(manifestValue("bare.yaml"), { serialization: "json" }),
    },
  ])("writes $name back as its form says", ({ text, file, written }) => {
    const result = read(text);
    expect(result.file).toEqual(file);
    expect(saveManifest(result.manifest, result.file)).toBe(written);
  });

  it.each([
    ['{"timetoshare": ', "invalid_json"],
    ["timelines: [", "invalid_yaml"],
    [fileText({ ...manifestValue("bare.yaml"), timetoshare: "0.6.0" }), "schema_violation"],
  ])("refuses %j as loadManifest does (%s)", (text, code) => {
    const result = readManifestFile(text);
    expect(result).toEqual(loadManifest(text));
    expect(isLoadError(result) && result.problems.map((problem) => problem.code)).toEqual([code]);
  });
});
