/**
 * The flow switch's motion (`switchMorphs`): when a block's drawing changes
 * and a card of it became switched, each of its chunks moves from the
 * stretch it plays as written to its place on the virtual axis, on the one
 * progress every motion of the canvas runs on (`Progress`, which the canvas
 * uses in the place of `svelte/motion`'s `Tween`: loading that module makes
 * its media query at once). Nothing moves for a preview, under reduced
 * motion, or on the first drawing.
 */

import type { Manifest } from "@timetoalign/tilie-core";
import type { Drawing } from "@timetoalign/tilie-layout";
import { untrack } from "svelte";
import { Progress } from "./animation/progress.svelte.ts";
import { durationOf } from "./animation/unfold.ts";
import type { ChunkMorph } from "./flowSwitch.ts";
import { morphTransform, switchMorphs } from "./flowSwitch.ts";

/** What a block's motion follows: its manifest and its drawing. */
export interface Switched {
  readonly manifest: Manifest;
  readonly drawing: Drawing;
}

/**
 * Follows a block's drawing (`drawn`) as `CardMotions` does: each new drawing
 * whose cards became switched moves their chunks over the canvas's motion
 * duration. Made while a component is initialised; its motion stops when the
 * component is destroyed.
 */
export class SwitchMotion {
  readonly #progress = new Progress(1);
  #previous: Drawing;
  /** The chunks moving, by element index of the drawing shown. */
  #moving: ReadonlyMap<number, ChunkMorph> = $state.raw(new Map());

  constructor(drawn: () => Switched, reduced: () => boolean, still: () => boolean) {
    this.#previous = untrack(drawn).drawing;
    $effect.pre(() => {
      const next = drawn();
      untrack(() => this.#follow(next, reduced() || still()));
    });
    $effect(() => () => this.#progress.stop());
  }

  #follow(next: Switched, instant: boolean): void {
    const before = this.#previous;
    if (before === next.drawing) return;
    this.#previous = next.drawing;
    const morphs = instant ? [] : switchMorphs(next.manifest, before, next.drawing);
    this.#moving = new Map(
      morphs.flatMap((morph) => morph.elements.map((index) => [index, morph])),
    );
    this.#progress.to(morphs.length > 0 ? 0 : 1, 0);
    if (morphs.length > 0) this.#progress.to(1, durationOf(0, 1, false));
  }

  /** The `transform` of the element at `element` of the drawing shown, a text or not; `null` at rest. */
  transformOf(element: number, text: boolean): string | null {
    const morph = this.#moving.get(element);
    return morph === undefined ? null : morphTransform(morph, text, this.#progress.current);
  }
}
