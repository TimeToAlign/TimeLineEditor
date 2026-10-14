/**
 * What the pointer highlights in a block: the card under it, which shows the
 * timeline that is selected and edited on its own, and a segment's boundary
 * (`docs/drawing.md` in timeskeleton, sections 6.6 and 8).
 */

import type { Drawing, RectElement } from "@timetoalign/tilie-layout";
import type { Descriptor } from "@timetoalign/tilie-writers";

/** A descriptor the pointer highlights: a card itself (not its shadow), or a boundary. */
export type Hoverable = "card" | "boundary";

interface Targets {
  readonly cards: readonly RectElement[];
  readonly cardAddresses: ReadonlySet<string>;
  readonly boundaries: ReadonlySet<string>;
}

const targets = new WeakMap<Drawing, Targets>();
const hoverables = new WeakMap<readonly Descriptor[], ReadonlyMap<Descriptor, Hoverable>>();

function targetsOf(drawing: Drawing): Targets {
  let found = targets.get(drawing);
  if (found === undefined) {
    const cards: RectElement[] = [];
    const boundaries = new Set<string>();
    for (const element of drawing.elements) {
      if (element.type === "card") cards.push(element);
      else if (element.type === "boundary") boundaries.add(element.address);
    }
    found = { cards, cardAddresses: new Set(cards.map(({ address }) => address)), boundaries };
    targets.set(drawing, found);
  }
  return found;
}

/**
 * The address of the drawn card whose area holds the point `(x, y)`, in the
 * drawing's units, edges included; `null` outside every drawn card. A card
 * spans its timeline's whole member drawing, so a point on any element of
 * that drawing lies in it; cards never overlap, so at most one does. A card
 * that is not displayed is not drawn and holds no point.
 */
export function cardAt(drawing: Drawing, x: number, y: number): string | null {
  const card = targetsOf(drawing).cards.find(
    (rect) => rect.x <= x && x <= rect.x + rect.width && rect.y <= y && y <= rect.y + rect.height,
  );
  return card?.address ?? null;
}

/**
 * The boundary of `drawing` that an element with this tag and `data-address`
 * draws: the address, when the element is a `line` carrying a boundary's
 * address (no other line carries one; a wedge shares the `S/start` form but
 * is a `polygon`), else `null`.
 */
export function boundaryOf(drawing: Drawing, tag: string, address: string | null): string | null {
  return tag === "line" && address !== null && targetsOf(drawing).boundaries.has(address)
    ? address
    : null;
}

/**
 * The descriptors of `drawing` the pointer highlights, memoized by the
 * descriptor list: `"card"` for a card's own rectangle, `"boundary"` for a
 * boundary's line (`boundaryOf`). A card's shadow carries the card's address
 * too, but is written before the card (section 7.2), so the card is the last
 * `rect` carrying its address. Every other descriptor is absent.
 */
export function hoverablesOf(
  drawing: Drawing,
  descriptors: readonly Descriptor[],
): ReadonlyMap<Descriptor, Hoverable> {
  let found = hoverables.get(descriptors);
  if (found === undefined) {
    const { cardAddresses } = targetsOf(drawing);
    const cards = new Map<string, Descriptor>();
    const marks = new Map<Descriptor, Hoverable>();
    for (const descriptor of descriptors) {
      const value = descriptor.attrs.find(([name]) => name === "data-address")?.[1];
      const address = typeof value === "string" ? value : null;
      if (descriptor.tag === "rect" && address !== null && cardAddresses.has(address)) {
        cards.set(address, descriptor);
      } else if (boundaryOf(drawing, descriptor.tag, address) !== null) {
        marks.set(descriptor, "boundary");
      }
    }
    for (const card of cards.values()) marks.set(card, "card");
    found = marks;
    hoverables.set(descriptors, found);
  }
  return found;
}
