import { describe, expect, it } from "vitest";
import { assertNever } from "../src/errors.ts";

type Shape = { readonly kind: "frame" } | { readonly kind: "card" };

/** A closed switch over `Shape`, as core's switches over address kinds end. */
function word(shape: Shape): string {
  switch (shape.kind) {
    case "frame":
      return "frame";
    case "card":
      return "card";
    default:
      return assertNever(shape);
  }
}

/** A switch that leaves `card` out: its end does not compile. */
function partial(shape: Shape): string {
  switch (shape.kind) {
    case "frame":
      return "frame";
    default:
      // @ts-expect-error `card` has no case, so `shape` is not `never` here.
      return assertNever(shape);
  }
}

describe("closed switches", () => {
  it("compile once every kind has its case", () => {
    expect([word({ kind: "frame" }), word({ kind: "card" })]).toEqual(["frame", "card"]);
  });

  it("throw for a value outside the type, naming its kind", () => {
    const stranger: unknown = { kind: "stranger" };
    expect(() => word(stranger as Shape)).toThrow(
      new Error("a closed switch has no case for stranger"),
    );
    expect(() => partial({ kind: "card" })).toThrow(
      new Error("a closed switch has no case for card"),
    );
    expect(() => assertNever(7 as never)).toThrow(new Error("a closed switch has no case for 7"));
  });
});
