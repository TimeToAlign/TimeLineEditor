/**
 * The items of a block at their places (`docs/drawing.md` in TimeToShare,
 * sections 8.1, 8.4 and 8.6): each group's frame with its members' cards,
 * and each ungrouped root's card, an item of one card without a frame. Each
 * card's member drawing is laid out here at its item's length and its card's
 * spacing; nothing is yet drawn.
 */

import {
  CARD_PLACE_MEMBERS,
  type CardPlace,
  type ContainerRef,
  type ElementAddress,
  type ItemPlace,
  idAddress,
  indexOf,
  type PlaceKey,
  partAddress,
  placeAt,
  placeKeyText,
} from "@timetoalign/tilie-core";
import {
  BLOCK_KEY,
  elementKey,
  type MemberDrawing,
  memberDrawings,
  unownedKey,
} from "@timetoalign/tilie-core/drawing";
import type { Style } from "../cascade.ts";
import { CARD_SPACING, FRAME_SPACING, P, Q, TITLE_GAP } from "../constants.ts";
import { layoutMember, type MemberLayout } from "../member.ts";
import { cleanText } from "../metrics.ts";
import { cutText } from "../names.ts";
import { type Context, type Holder, known, shown } from "../traversal.ts";

/** A title (section 8.1): its address, style and font size, and its text cut to its `max-width`. */
export interface Title {
  readonly address: ElementAddress;
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
  readonly address: ElementAddress;
  readonly holder: Holder;
  readonly title: Title | undefined;
}

/** A card and the member drawing it holds, laid out in its item, its top and height known. */
export interface Card {
  readonly member: MemberDrawing;
  /** Its container as core lists it. */
  readonly ref: ContainerRef;
  /** `{id: T, part: ["card"]}`, every card of `T` alike. */
  readonly address: ElementAddress;
  readonly style: Style;
  /** What `places` states for a member's card; `{}` for a block-held card, whose item states it. */
  readonly stated: CardPlace;
  /**
   * Its spacing `S`, the gap between its rows and between its bands: a member's card's own
   * `spacing`, a block-held card's its item's, else 4.
   */
  readonly spacing: number;
  /** Its top and height in item coordinates. */
  readonly top: number;
  readonly height: number;
  readonly layout: MemberLayout;
}

/**
 * One item of the block (section 8.6), a frame or a block-held card: its
 * place key, its frame (none for a block-held card), its place with the
 * defaults applied, its height in item coordinates, and its cards.
 */
export interface Item {
  readonly key: PlaceKey;
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
 * `holder` (section 8.1): its name, else its whole ID, unless its
 * style's `content` replaces it; undefined when it is not displayed. Its
 * text is measured either way, so its unmapped characters are reported.
 */
export function titleOf(
  context: Context,
  address: ElementAddress,
  id: string,
  name: string | null,
  holder: Holder,
): Title | undefined {
  const { cascade, measure } = context;
  const style = cascade.resolve(unownedKey("name", address, holder.key), holder.style);
  const size = style["font-size"];
  const source = style.content === "none" ? (name ?? id) : style.content;
  const { text } = cutText(measure, cleanText(source), size, style["max-width"]);
  return shown(style) ? { address, style, size, text } : undefined;
}

/** What `places` states under `key` (its `cards` aside); `{}` when it states nothing. */
function statedOf(context: Context, key: PlaceKey): ItemPlace {
  return placeAt(context.placement.places, key) ?? {};
}

/** What `places` states for a member's card: the members a frame-held card may state. */
function requestOf(context: Context, key: PlaceKey): CardPlace {
  const stated = statedOf(context, key);
  const request: { -readonly [Member in keyof CardPlace]: CardPlace[Member] } = {};
  for (const member of CARD_PLACE_MEMBERS) {
    const value = stated[member];
    if (value !== undefined) request[member] = value;
  }
  return request;
}

/** The frame or card that core lists under the place key `key`. */
function containerOf(context: Context, key: PlaceKey): ContainerRef {
  return known(indexOf(context.manifest).containers.byKey, placeKeyText(key));
}

/**
 * The card of `member` whose place key is `key`, held by `holder` (the
 * frame of its group, or the block), its member drawing laid out at `L`
 * and spacing `S`.
 */
function cardOf(
  context: Context,
  member: MemberDrawing,
  holder: Holder,
  key: PlaceKey,
  L: number,
  S: number,
): Pick<Card, "member" | "ref" | "address" | "style" | "layout"> {
  const timeline = member.timeline;
  const ref = containerOf(context, key);
  const { address } = ref;
  const style = context.cascade.resolve(
    elementKey("card", address, timeline, holder.key),
    holder.style,
  );
  const laid: Context = { ...context, placement: { ...context.placement, length: L } };
  return { member, ref, address, style, layout: layoutMember(laid, member, holder, key, S) };
}

/**
 * Every item of the block in drawing order, the frames then the block-held
 * cards (section 8.6), `block` the holder of the frames and the block-held
 * cards and `top` the default top of the first item, below the title's
 * slot. An item's length `L`, scale and spacing are what its place states,
 * else the placement's length, 1, and 8 for a frame, 4 for a block-held card;
 * its member drawings are laid out at `L`, a block-held card's at its item's
 * spacing, a member's at its own card's (else 4), and a frame's cards lie
 * its spacing apart. No spacing multiplies another. Its height, in item
 * coordinates, is the larger of its content's and the requested one; its
 * place `x` and `y` what is stated, else `P` and, for `y`, the first item at
 * `top`, each further one the placement's `spacing` below the largest drawn
 * bottom edge, after the scale, of the items before it.
 */
export function placeItems(context: Context, block: Holder, top: number): Item[] {
  const { placement, measure } = context;
  const { frames, ungrouped } = memberDrawings(context.manifest);
  let lowest: number | undefined;
  const place = (
    key: PlaceKey,
    frame: Frame | null,
    content: (L: number, spacing: number) => { readonly height: number; readonly cards: Card[] },
  ): Item => {
    const stated = statedOf(context, key);
    const length = stated.length ?? placement.length;
    const scale = stated.scale ?? 1;
    const spacing = stated.spacing ?? (frame === null ? CARD_SPACING : FRAME_SPACING);
    const laid = content(length, spacing);
    const height = stated.height === undefined ? laid.height : Math.max(laid.height, stated.height);
    const x = stated.x ?? P;
    const y = stated.y ?? (lowest === undefined ? top : lowest + placement.spacing);
    const bottom = y + scale * height;
    lowest = lowest === undefined ? bottom : Math.max(lowest, bottom);
    // A block-held card is as high as its item.
    const cards = frame === null ? laid.cards.map((card) => ({ ...card, height })) : laid.cards;
    return { key, frame, stated, x, y, length, scale, spacing, height, cards };
  };

  const framed = frames.map(({ group, members }) => {
    const item: PlaceKey = { item: group.id };
    const ref = containerOf(context, item);
    const address = idAddress(group.id);
    const key = unownedKey("frame", address, BLOCK_KEY);
    const holder: Holder = { key, style: context.cascade.resolve(key, block.style) };
    const title = titleOf(context, partAddress(address, "name"), group.id, group.name, holder);
    const frame: Frame = { ref, address, holder, title };
    return place(item, frame, (L, Sf) => {
      // The title's slot, then the cards the frame's spacing `Sf` apart, each the larger of its
      // member drawing's height and the height its own request asks (section 8.4); each member
      // drawing laid out at its card's own spacing.
      let y = Q;
      if (title !== undefined) y = y + measure.lineHeight(title.size) + TITLE_GAP;
      const cards = members.map((member, index): Card => {
        const key: PlaceKey = { item: group.id, member: member.timeline.id };
        const stated = requestOf(context, key);
        const spacing = stated.spacing ?? CARD_SPACING;
        const card = cardOf(context, member, holder, key, L, spacing);
        const height =
          stated.height === undefined
            ? card.layout.height
            : Math.max(card.layout.height, stated.height);
        if (index > 0) y = y + Sf;
        const cardTop = y;
        y = y + height;
        return { ...card, stated, spacing, top: cardTop, height };
      });
      return { cards, height: y + Q };
    });
  });
  const loose = ungrouped.map((member) => {
    const key: PlaceKey = { item: member.timeline.id };
    return place(key, null, (L, spacing) => {
      const card = cardOf(context, member, block, key, L, spacing);
      const height = card.layout.height;
      return { cards: [{ ...card, stated: {}, spacing, top: 0, height }], height };
    });
  });
  return [...framed, ...loose];
}
