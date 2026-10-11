/**
 * The drawing fixtures of the schema package, drawn and written again from
 * their `inputs.json` alone, equal their `figure.svg` and `figure.tex` byte
 * for byte, and the fixtures are exactly the review cases.
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { isLoadError, loadManifest } from "@timetoalign/tilie-core";
import { DEFAULT_LAYER, draw, type Placement } from "@timetoalign/tilie-layout";
import {
  fontMetrics,
  type Graphical,
  isJsonFloat,
  isJsonObject,
  parseJson,
} from "@timetoalign/timeskeleton";
import { describe, expect, it } from "vitest";
import { writeSvg, writeTikz } from "../src/index.ts";
import { drawingsDirectory, fixturesDirectory, inputsText, reviewCases } from "./support.ts";

interface Inputs {
  readonly manifest: string;
  readonly placement: Placement;
  readonly scale: number;
  readonly layers: readonly Graphical[];
}

/** A value read by `parseJson` with every number as a plain number. */
function plainNumbers(value: unknown): unknown {
  if (isJsonFloat(value)) return value.value;
  if (typeof value === "bigint") return Number(value);
  if (Array.isArray(value)) return value.map(plainNumbers);
  if (isJsonObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, plainNumbers(item)]),
    );
  }
  return value;
}

function read(name: string, file: string): string {
  return readFileSync(path.join(drawingsDirectory, name, file), "utf8");
}

/** The SVG and TikZ of a fixture, from its `inputs.json` alone. */
function written(name: string): { svg: string; tex: string } {
  const inputs = plainNumbers(parseJson(read(name, "inputs.json"))) as Inputs;
  const manifest = loadManifest(
    readFileSync(path.join(fixturesDirectory, inputs.manifest), "utf8"),
  );
  if (isLoadError(manifest)) throw new Error(`${name}: ${manifest.problems[0]?.message}`);
  const layers = [DEFAULT_LAYER, ...inputs.layers, manifest.graphical];
  const drawing = draw(manifest, inputs.placement, layers, fontMetrics);
  const placed = [{ drawing, x: 0, y: 0, scale: inputs.scale }];
  return { svg: writeSvg(placed), tex: writeTikz(placed) };
}

const cases = reviewCases();
const directories = readdirSync(drawingsDirectory, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

describe("the drawing fixtures", () => {
  it("are exactly the review cases", () => {
    expect(directories).toEqual(cases.map((item) => item.name).sort());
  });

  it.each(cases)("$name: inputs.json holds the case's inputs", (item) => {
    expect(read(item.name, "inputs.json")).toBe(inputsText(item));
  });
});

describe.each(directories)("the drawing fixture %s", (name) => {
  it("figure.svg is the SVG writer's output", () => {
    expect(written(name).svg).toBe(read(name, "figure.svg"));
  });

  it("figure.tex is the TikZ writer's output", () => {
    expect(written(name).tex).toBe(read(name, "figure.tex"));
  });
});
