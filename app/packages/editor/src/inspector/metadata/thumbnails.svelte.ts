/**
 * The thumbnails of the things rectangles name: one `resolve` per IRI,
 * started by an attachment on the element that shows the image, the answer
 * written when it arrives (a failure, or a thing without an image, as
 * `null`) and kept for the panel's life. An image is never written to a
 * manifest.
 */

import { createContext } from "svelte";
import type { Attachment } from "svelte/attachments";
import { SvelteMap } from "svelte/reactivity";
import type { Lookup } from "../../lookup/index.ts";
import type { Thing } from "./frame.ts";

export class Thumbnails {
  readonly #lookup: Lookup;
  readonly #images = new SvelteMap<string, string | null>();
  /** The IRIs a resolve was started for; not state, read only by `load`. */
  readonly #started = new Set<string>();

  constructor(lookup: Lookup) {
    this.#lookup = lookup;
  }

  /** The first of `things` whose system the lookup resolves; `null` for none. */
  first(things: readonly Thing[]): Thing | null {
    return (
      things.find((thing) => thing.system !== null && this.#lookup.resolvable(thing.system)) ?? null
    );
  }

  /** The thumbnail of `thing`, once its answer arrived; `null` before, and without one. */
  imageOf(thing: Thing): string | null {
    return this.#images.get(thing.iri) ?? null;
  }

  /** An attachment starting the one resolve of `thing`'s IRI. */
  load(thing: Thing): Attachment {
    return () => {
      const system = thing.system;
      if (system === null || this.#started.has(thing.iri) || !this.#lookup.resolvable(system)) {
        return;
      }
      this.#started.add(thing.iri);
      this.#lookup.resolve(system, thing.iri).then(
        (candidate) => this.#images.set(thing.iri, candidate?.image ?? null),
        () => this.#images.set(thing.iri, null),
      );
    };
  }
}

/** The panel's thumbnails, for its rectangles. */
export const [thumbnailsOf, provideThumbnails] = createContext<Thumbnails>();
