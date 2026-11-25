/**
 * The thumbnails of the things rectangles name: one `resolve` per IRI the
 * lookup resolves, started by an attachment on the element that shows the
 * image, the answer written when it arrives (a failure, or a thing without
 * an image, as `null`) and kept for the panel's life; a rectangle shows the
 * image of the first of its things that has one. An image is never written
 * to a manifest.
 */

import { createContext } from "svelte";
import type { Attachment } from "svelte/attachments";
import { SvelteMap } from "svelte/reactivity";
import type { Lookup } from "../../lookup/index.ts";
import type { Thing } from "./frame.ts";

/** The images of the things rectangles name, resolved through the lookup once per IRI. */
export class Thumbnails {
  readonly #lookup: Lookup;
  readonly #images = new SvelteMap<string, string | null>();
  /** The IRIs a resolve was started for; not state, read only by `load`. */
  readonly #started = new Set<string>();

  constructor(lookup: Lookup) {
    this.#lookup = lookup;
  }

  /** Whether the lookup resolves the system of any of `things`. */
  resolvable(things: readonly Thing[]): boolean {
    return things.some((thing) => this.#resolves(thing));
  }

  /**
   * The thumbnail of `things`, a rectangle's things in its order: the image
   * of the first whose answer arrived with one; `null` before, and while
   * none has one.
   */
  imageOf(things: readonly Thing[]): string | null {
    for (const thing of things) {
      const image = this.#images.get(thing.iri) ?? null;
      if (image !== null) return image;
    }
    return null;
  }

  /** An attachment starting the one resolve of the IRI of each of `things` the lookup resolves. */
  load(things: readonly Thing[]): Attachment {
    return () => {
      for (const thing of things) {
        if (this.#started.has(thing.iri) || !this.#resolves(thing) || thing.system === null) {
          continue;
        }
        this.#started.add(thing.iri);
        this.#lookup.resolve(thing.system, thing.iri).then(
          (candidate) => this.#images.set(thing.iri, candidate?.image ?? null),
          () => this.#images.set(thing.iri, null),
        );
      }
    };
  }

  #resolves(thing: Thing): boolean {
    return thing.system !== null && this.#lookup.resolvable(thing.system);
  }
}

/** The panel's thumbnails, for its rectangles. */
export const [thumbnailsOf, provideThumbnails] = createContext<Thumbnails>();
