/**
 * The pane a canvas's drawings are fitted to: the canvas's size in screen
 * pixels, left of the inspector drawer at its current width
 * (`Placement.view`, read only by the automatic proportion of an ancestor
 * card's elisions, `elision-proportion: auto`, `docs/drawing.md` in
 * TimeToShare, section 8.9). One per canvas: every drawing a canvas shows,
 * and every drawing read for what it shows (its gestures, keys and the
 * inspector beside it), is drawn at that canvas's pane. Until the canvas is
 * measured (and in a test without one) no pane is given, and a drawing
 * takes layout's default view. The pane also carries the host's reading of
 * flow control for each block (`readingOf`), with which every drawing of
 * that block fades what the reading does not read.
 *
 * The first size measured settles at once; every later size settles
 * `PANE_SETTLE` milliseconds after the last one measured, so dragging the
 * window or the drawer redraws once, when it stops.
 */

import type { Block, FlowReading } from "@timetoalign/tilie-core";
import type { View } from "@timetoalign/tilie-layout";
import { createSubscriber } from "svelte/reactivity";

/** How long, in milliseconds, a pane waits after the last size measured before it settles. */
export const PANE_SETTLE = 150;

/**
 * Where a drawing reads its pane: read only for a manifest drawing an
 * ancestor card, so a reaction drawing any other manifest never waits on it.
 */
export interface PaneSource {
  /** The size drawings are fitted to; `undefined` for layout's default view. */
  readonly view: View | undefined;
  /**
   * The reading in force of flow control for `block`'s drawing, which fades
   * what it does not read (`docs/drawing.md` in TimeToShare, section 1);
   * none (`null`, or no such member) fades what some actor believes `false`.
   */
  readingOf?(block: Block): FlowReading | null;
}

/** A canvas's pane (`PaneSource`), settled from the sizes the canvas measures. */
export class Pane implements PaneSource {
  /** The reading of flow control the host gives each block's drawing; none without one. */
  readonly readingOf: (block: Block) => FlowReading | null;
  #settled: View | undefined = undefined;
  #timer: ReturnType<typeof setTimeout> | undefined = undefined;
  /** The reactions reading the pane, told when it changes. */
  readonly #readers = new Set<() => void>();
  readonly #subscribe = createSubscriber((update) => {
    this.#readers.add(update);
    return () => this.#readers.delete(update);
  });

  constructor(readingOf: (block: Block) => FlowReading | null = () => null) {
    this.readingOf = readingOf;
  }

  /**
   * The size drawings are fitted to now; `undefined` before one settles.
   * Read in a reaction (a `$derived`, a template), it is read again when
   * the pane settles; read anywhere else, it is a plain value.
   */
  get view(): View | undefined {
    this.#subscribe();
    return this.#settled;
  }

  /**
   * The canvas measures `width` × `height` screen pixels: the first size
   * settles at once, a later one `PANE_SETTLE` milliseconds after the last
   * size measured, a size equal to the settled one only cancels a pending
   * one. A size that is not positive and finite (a canvas not laid out
   * yet, a collapsed one) is skipped.
   */
  measure(width: number, height: number): void {
    if (!(Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0)) return;
    clearTimeout(this.#timer);
    this.#timer = undefined;
    const settled = this.#settled;
    if (settled?.width === width && settled.height === height) return;
    if (settled === undefined) {
      this.#show({ width, height });
      return;
    }
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      this.#show({ width, height });
    }, PANE_SETTLE);
  }

  /** The canvas is gone: a pending size is dropped and the pane withdrawn. */
  release(): void {
    clearTimeout(this.#timer);
    this.#timer = undefined;
    if (this.#settled !== undefined) this.#show(undefined);
  }

  /** Make `next` the pane and tell every reaction reading it. */
  #show(next: View | undefined): void {
    this.#settled = next;
    for (const update of [...this.#readers]) update();
  }
}
