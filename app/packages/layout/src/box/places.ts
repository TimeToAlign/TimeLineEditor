/**
 * The items of a box at their places (`docs/drawing.md` in timeskeleton,
 * sections 8.1, 8.4 and 8.6): each group's frame with its members' cards,
 * and each ungrouped root's card, an item of one card without a frame. Each
 * card's member drawing is laid out here at its item's length and vertical
 * stretch; nothing is yet drawn.
 */

import {
  CARD_PLACE_MEMBERS,
  type CardPlace,
  type ContainerRef,
  type ItemPlace,
  indexOf,
  partAddress,
} from "@timetoalign/tilie-core";
import {
  BOX_KEY,
  elementKey,
  type MemberDrawing,
  memberDrawings,
  unownedKey,
} from "@timetoalign/tilie-core/drawing";
import type { Style } from "../cascade.ts";
import { F, P, Q, TITLE_GAP } from "../constants.ts";
import { layoutMember, type MemberLayout } from "../member.ts";
import { cleanText } from "../metrics.ts";
import { cutText } from "../names.ts";
import { unscoped } from "../numbers.ts";
import { type Context, type Holder, known, shown } from "../traversal.ts";

/** A title (section 8.1): its address, style and font size, and its text cut to its `max-width`. */
export interface Title {
  readonly address: string;
  readonly style: Style;
  readonly size: number;
  readonly text: string;
}

/**
 * A group's frame: its container as core lists it and its address, its key and style as its
 * cards' holder, and its drawn title.
 */
export interface Frame {
  readonly ref: ContainerRef;
  readonly address: string;
  readonly holder: Holder;
  readonly title: Title | undefined;
}

/** A card and the member drawing it holds, laid out in its item, its top and height known. */
export interface Card {
  readonly member: MemberDrawing;
  /** Its container as core lists it. */
  readonly ref: ContainerRef;
  /** `T/card`. */
  readonly address: string;
  readonly style: Style;
  /** What `places` states for a member's card; `{}` for a box-held card, whose item states it. */
  readonly stated: CardPlace;
  /** Its vertical stretch: a member's card's own `spacing`, else 1; a box-held card's item's. */
  readonly spacing: number;
  /** Its top and height in item coordinates. */
  readonly top: number;
  readonly height: number;
  readonly layout: MemberLayout;
}

/**
 * One item of the box (section 8.6), a frame or a box-held card: its key in
 * `places`, its frame (none for a box-held card), its place with the
 * defaults applied, its height in item coordinates, and its cards.
 */
export interface Item {
  readonly key: string;
  readonly frame: Frame | null;
  readonly stated: ItemPlace;
  readonly x: number;
  readonly y: number;
  readonly length: number;
  readonly scale: number;
  readonly spacing: number;
  readonly height: number;
  readonly cards: readonly Card[];
}

/**
 * The title at `address` of a group or the manifest named `name`, held by
 * `holder` (section 8.1): its name, else its id without scope, unless its
 * style's `content` replaces it; undefined when it is not displayed. Its
 * text is measured either way, so its unmapped characters are reported.
 */
export function titleOf(
  context: Context,
  address: string,
  id: string,
  name: string | null,
  holder: Holder,
): Title | undefined {
  const { cascade, measure } = context;
  const style = cascade.resolve(unownedKey("name", address, holder.key), holder.style);
  const size = style["font-size"];
  const source = style.content === "none" ? (name ?? unscoped(id)) : style.content;
  const { text } = cutText(measure, cleanText(source), size, style["max-width"]);
  return shown(style) ? { address, style, size, text } : undefined;
}

/** What `places` states under `key`; `{}` when it states nothing. */
function statedOf(context: Context, key: string): ItemPlace {
  const { places } = context.placement;
  return Object.hasOwn(places, key) ? (places[key] ?? {}) : {};
}

/** What `places` states for a member's card: the members a frame-held card may state. */
function requestOf(context: Context, key: string): CardPlace {
  const stated = statedOf(context, key);
  const request: { -readonly [Member in keyof CardPlace]: CardPlace[Member] } = {};
  for (const member of CARD_PLACE_MEMBERS) {
    const value = stated[member];
    if (value !== undefined) request[member] = value;
  }
  return request;
}

/** The frame or card that core lists under the `places` key `key`, and its address. */
function containerOf(
  context: Context,
  key: string,
): { readonly ref: ContainerRef; readonly address: string } {
  const ref = known(indexOf(context.manifest).containers.byKey, key);
  if (ref.address === null) throw new Error(`the container of ${key} has no address`);
  return { ref, address: ref.address };
}

/** The card of `member` held by `holder`, its member drawing laid out at `L` and stretch `v`. */
function cardOf(
  context: Context,
  member: MemberDrawing,
  holder: Holder,
  L: number,
  v: number,
): Pick<Card, "member" | "ref" | "address" | "style" | "layout"> {
  const timeline = member.timeline;
  const { ref, address } = containerOf(context, timeline.id);
  const style = context.cascade.resolve(
    elementKey("card", address, timeline, holder.key),
    holder.style,
  );
  const laid: Context = { ...context, placement: { ...context.placement, length: L, spacing: v } };
  return { member, ref, address, style, layout: layoutMember(laid, member, holder, address) };
}

/**
 * Every item of the box in drawing order, the frames then the box-held
 * cards (section 8.6), `box` the holder of the frames and the box-held
 * cards and `top` the default top of the first item, below the title's
 * slot. An item's length `L`, scale and spacing are what its place states,
 * else the placement's length, 1 and 1; its member drawings are laid out at
 * `L` and the vertical stretch `v`, the placement's `spacing` times the
 * item's, a member's times its card's too. Its height, in item coordinates,
 * is the larger of its content's and the requested one; its place `x` and
 * `y` what is stated, else `P` and, for `y`, the first item at `top`, each
 * further one `F` below the largest drawn bottom edge, after the scale, of
 * the items before it.
 */
export function placeItems(context: Context, box: Holder, top: number): Item[] {
  const { placement, measure } = context;
  const { frames, ungrouped } = memberDrawings(context.manifest);
  let lowest: number | undefined;
  const place = (
    key: string,
    frame: Frame | null,
    content: (L: number, v: number) => { readonly height: number; readonly cards: Card[] },
  ): Item => {
    const stated = statedOf(context, key);
    const length = stated.length ?? placement.length;
    const scale = stated.scale ?? 1;
    const spacing = stated.spacing ?? 1;
    const laid = content(length, placement.spacing * spacing);
    const height = stated.height === undefined ? laid.height : Math.max(laid.height, stated.height);
    const x = stated.x ?? P;
    const y = stated.y ?? (lowest === undefined ? top : lowest + F);
    const bottom = y + scale * height;
    lowest = lowest === undefined ? bottom : Math.max(lowest, bottom);
    // A box-held card is as high as its item.
    const cards = frame === null ? laid.cards.map((card) => ({ ...card, height })) : laid.cards;
    return { key, frame, stated, x, y, length, scale, spacing, height, cards };
  };

  const framed = frames.map(({ group, members }) => {
    const { ref, address } = containerOf(context, group.id);
    const key = unownedKey("group", address, BOX_KEY);
    const holder: Holder = { key, style: context.cascade.resolve(key, box.style) };
    const title = titleOf(context, partAddress(address, "name"), group.id, group.name, holder);
    const frame: Frame = { ref, address, holder, title };
    return place(group.id, frame, (L, v) => {
      // The title's slot, then the cards F apart, each the larger of its member drawing's height
      // and the height its own request asks (section 8.4); each member drawing stretched by the
      // frame's `v` times its card's own `spacing`.
      let y = Q;
      if (title !== undefined) y = y + measure.lineHeight(title.size) + TITLE_GAP;
      const cards = members.map((member, index): Card => {
        const stated = requestOf(context, member.timeline.id);
        const spacing = stated.spacing ?? 1;
        const card = cardOf(context, member, holder, L, v * spacing);
        const height =
          stated.height === undefined
            ? card.layout.height
            : Math.max(card.layout.height, stated.height);
        if (index > 0) y = y + F;
        const cardTop = y;
        y = y + height;
        return { ...card, stated, spacing, top: cardTop, height };
      });
      return { cards, height: y + Q };
    });
  });
  const loose = ungrouped.map((member) => {
    const key = member.timeline.id;
    const spacing = statedOf(context, key).spacing ?? 1;
    return place(key, null, (L, v) => {
      const card = cardOf(context, member, box, L, v);
      const height = card.layout.height;
      return { cards: [{ ...card, stated: {}, spacing, top: 0, height }], height };
    });
  });
  return [...framed, ...loose];
}
