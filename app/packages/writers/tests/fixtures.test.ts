/**
 * The drawing fixtures of the schema package, drawn and written again from
 * their `inputs.json` alone, equal their `figure.svg` and `figure.tex` byte
 * for byte, and the fixtures are exactly the review cases.
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { isLoadError, loadManifest } from "@timetoalign/tilie-core";
import {
  DEFAULT_LAYER,
  DEFAULT_PLACEMENT,
  draw,
  manifestLayer,
  type Placement,
} from "@timetoalign/tilie-layout";
import {
  fontMetrics,
  type Graphical,
  isJsonFloat,
  isJsonObject,
  parseJson,
} from "@timetoalign/timetoshare";
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
  const layers = [DEFAULT_LAYER, ...inputs.layers, manifestLayer(manifest)];
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

  it("are 71", () => {
    expect(directories.length).toBe(71);
  });

  it("draw a timeline of two groups in a card of each, every address alike in both", () => {
    const svg = read("bundle__bundle_shared_member", "figure.svg");
    // Each written element's address attributes, `data-id`, `data-facet` and `data-part`.
    const attribute = (line: string, name: string) =>
      line.match(new RegExp(` ${name}="([^"]*)"`))?.[1] ?? null;
    const written = svg
      .split("\n")
      .filter((line) => /^<(rect|line|circle|polygon|polyline|path|text) /.test(line))
      .map((line) => [
        attribute(line, "data-id"),
        attribute(line, "data-facet"),
        attribute(line, "data-part"),
      ]);
    const cards = written.flatMap(([id, , part], line) => (part === "card" ? [{ id, line }] : []));
    // Each card is written twice, its shadow and itself, under one address for every card of `t`.
    expect(cards.map((card) => card.id)).toEqual(["t", "t", "u", "u", "t", "t", "v", "v"]);
    // A card's member drawing follows it, up to the next card.
    const between = (card: number) =>
      written.slice((cards[card]?.line ?? 0) + 1, cards[card + 1]?.line);
    const first = between(1);
    const second = between(5);
    expect(first).toContainEqual(["t", null, null]);
    expect(second).toEqual(first);
  });

  it.each(cases)("$name: inputs.json holds the case's inputs", (item) => {
    expect(read(item.name, "inputs.json")).toBe(inputsText(item));
  });

  const spaced = cases.filter(
    ({ placement }) =>
      placement.spacing !== DEFAULT_PLACEMENT.spacing ||
      Object.values(placement.places).some(
        (place) =>
          place.spacing !== undefined ||
          Object.values(place.cards ?? {}).some((card) => card.spacing !== undefined),
      ),
  );
  it.each(spaced)("$name: a stated spacing draws differently from the default", (item) => {
    const plain = cases.find(
      (other) =>
        other.manifest === item.manifest &&
        other.placement === DEFAULT_PLACEMENT &&
        other.settings.length === 0 &&
        other.scale === 1,
    );
    if (plain === undefined) throw new Error(`${item.manifest} has no default case`);
    expect(read(item.name, "figure.svg")).not.toBe(read(plain.name, "figure.svg"));
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
