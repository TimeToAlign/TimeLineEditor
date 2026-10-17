/**
 * Motion inside a block's drawing. The drawing is an SVG whose user units
 * are drawing units, scaled on screen by the block's scale and the canvas
 * zoom, so a screen offset becomes drawing units through an element's
 * screen CTM before it is applied to the element.
 */

import type { AnimationConfig, FlipParams } from "svelte/animate";
import { cubicOut } from "svelte/easing";

/** The six numbers of a 2D matrix, as an element's `getScreenCTM()` returns them. */
export type Matrix = Pick<DOMMatrixReadOnly, "a" | "b" | "c" | "d" | "e" | "f">;

/** An element's screen CTM; `null` for an element that is not drawn or has none. */
export function screenMatrix(element: Element): Matrix | null {
  const graphic = element as Partial<Pick<SVGGraphicsElement, "getScreenCTM">>;
  return graphic.getScreenCTM?.() ?? null;
}

/**
 * The drawing-unit offset that moves an element by `(dx, dy)` screen pixels:
 * the inverse of the linear part of its screen CTM, the translation left out.
 * `null` when the matrix cannot be inverted (an element drawn at no size).
 */
export function offsetIn(matrix: Matrix, dx: number, dy: number): { x: number; y: number } | null {
  const { a, b, c, d } = matrix;
  const determinant = a * d - b * c;
  if (determinant === 0 || !Number.isFinite(determinant)) return null;
  return { x: (d * dx - c * dy) / determinant, y: (a * dy - b * dx) / determinant };
}

/**
 * The screen CTM of the `<svg>` an element is drawn in, whose user units are
 * the drawing's. Unlike the element's own, it is never moved by `slide` nor
 * by a reorder, so a pointer read through it stays where the drawing is.
 */
export function drawingMatrix(element: SVGElement): Matrix | null {
  return screenMatrix(element.ownerSVGElement ?? element);
}

/** The point in an element's user units under the screen point `(x, y)`. */
export function pointIn(matrix: Matrix, x: number, y: number): { x: number; y: number } | null {
  return offsetIn(matrix, x - matrix.e, y - matrix.f);
}

/**
 * An `animate:` function for the elements of a block's drawing: on a keyed
 * reorder, each element slides from where it was to where it now is.
 * Svelte measures both places as screen rectangles; `flip` would apply
 * their offset as CSS pixels, which inside the scaled SVG are drawing
 * units, so this converts the offset through the element's screen CTM.
 * Only the position moves; an element keeps its size on a reorder.
 *
 * `duration` is in milliseconds, or a function of the screen distance in
 * pixels (by default `√d × 120`, as `flip`'s); the block node passes 0
 * whenever its elements are not to slide. No animation when the element
 * has no screen CTM.
 */
export function slide(
  node: Element,
  { from, to }: { from: DOMRect; to: DOMRect },
  params: FlipParams = {},
): AnimationConfig {
  const { delay = 0, duration = (d: number) => Math.sqrt(d) * 120, easing = cubicOut } = params;
  const dx = from.left - to.left;
  const dy = from.top - to.top;
  const matrix = screenMatrix(node);
  const offset = matrix === null ? null : offsetIn(matrix, dx, dy);
  if (offset === null) return { delay, duration: 0 };
  const style = getComputedStyle(node).transform;
  const transform = style === "none" || style === "" ? "" : `${style} `;
  const distance = Math.hypot(dx, dy);
  return {
    delay,
    duration: typeof duration === "function" ? duration(distance) : duration,
    easing,
    css: (_t, u) => `transform: ${transform}translate(${u * offset.x}px, ${u * offset.y}px);`,
  };
}
