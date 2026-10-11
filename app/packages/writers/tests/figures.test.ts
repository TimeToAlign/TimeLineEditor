import { describe, expect, it } from "vitest";
import { writeBlockSvg, writeSvg, writeTikz } from "../src/index.ts";
import { block, figureText, specimens } from "./support.ts";

describe("the 16 single-root 0.3.0 figures", () => {
  it("has exactly 16 specimens", () => {
    expect(specimens.length).toBe(16);
  });

  it.each(specimens)("reproduces %s byte for byte", (name) => {
    const value = block(name);
    expect(writeSvg(value)).toBe(figureText(name, "figure.svg"));
    expect(writeTikz(value)).toBe(figureText(name, "figure.tex"));
  });
});

describe("embedded SVG", () => {
  it.each(specimens)("wraps exactly the standalone body of %s", (name) => {
    const value = block(name);
    const standalone = writeSvg(value).split("\n");
    const body = standalone.slice(1, -2).join("\n");
    expect(writeBlockSvg(value)).toBe(`<g>\n${body}\n</g>\n`);
  });

  it("opens a plain <g> and carries no transform", () => {
    const lines = writeBlockSvg(block("bare")).split("\n");
    expect(lines[0]).toBe("<g>");
    expect(lines[1]).toBe(writeSvg(block("bare")).split("\n")[1]);
    expect(lines.at(-2)).toBe("</g>");
    expect(lines.at(-1)).toBe("");
    expect(writeBlockSvg(block("bare")).includes("transform")).toBe(false);
  });
});
