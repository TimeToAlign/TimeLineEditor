/**
 * The items of a block at their places (`docs/drawing.md` in TimeToShare,
 * sections 8.1, 8.4 and 8.6): each group's frame with its members' cards,
 * and each ungrouped root's card, an item of one card without a frame. Each
 * card's member drawing is laid out here at its item's length and its card's
 * spacing and margin; nothing is yet drawn.
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
  samePlaceKey,
} from "@timetoalign/tilie-core";
import {
  BLOCK_KEY,
  elementKey,
  type GroupFrame,
  type MemberDrawing,
  unownedKey,
} from "@timetoalign/tilie-core/drawing";
import type { Style } from "../cascade.ts";
import { CARD_SPACING, FRAME_SPACING, P, Q, TITLE_GAP } from "../constants.ts";
import {
  cardElisionsOf,
  type DrawnMode,
  drawnMode,
  type FrameElisions,
  frameElisions,
  ungroupedAxis,
} from "../elisions.ts";
import { layoutScope, type MemberLayout } from "../member.ts";
import { cleanText } from "../metrics.ts";
import { cutText } from "../names.ts";
import {
  type Context,
  type Holder,
  known,
  type Scope,
  shown,
  traverse,
  withAxis,
} from "../traversal.ts";
import { drawnRoots, virtualFlow, withRuns } from "../virtual.ts";

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
  /**
   * Its margin `V`, empty space above its first row or band and below its last: a member's card's
   * own `margin`, a block-held card's its item's, else 0.
   */
  readonly margin: number;
  /** Its top and height in item coordinates. */
  readonly top: number;
  readonly height: number;
  readonly layout: MemberLayout;
  /** A block-held card's elision mode, `auto` resolved (section 8.9); null for a member's card. */
  readonly mode: DrawnMode | null;
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
  readonly margin: number;
  readonly height: number;
  readonly cards: readonly Card[];
  /** The height of its content before its request, which a later layout of it reuses. */
  readonly content: number;
  /** A frame's group elisions (section 8.9): its elided axis; none where it draws no gap. */
  readonly elisions: FrameElisions | undefined;
  /** `DG`, the sum of the shrinks of a frame's gaps, which shortens its members (section 8.2); 0 otherwise. */
  readonly DG: number;
}

/**
 * The ordinates of the lines of a root's timelines in its drawing alone (section 8.8, step 1), by
 * timeline ID, for each member card on whose root's side the ancestor card behind its frame is
 * drawn, by the card's place key text (section 8.3).
 */
export type AlignedRows = ReadonlyMap<string, ReadonlyMap<string, number>>;

/**
 * How `placeItems` places the items of an arranged block (section 8.6,
 * Arrangements): `order`, the IDs of every item, the order to take them in,
 * each at its default `x` and `y` in that order, its stated `x` and `y` kept
 * and not used; `padding`, by a member card's place key text, how much lower
 * that card lies than section 8.4 lays it, the gap above it grown so (section
 * 8.8, Drawn once).
 */
export interface Arranged {
  readonly order?: readonly string[];
  readonly padding?: ReadonlyMap<string, number>;
}

/**
 * How far the displayed ancestor cards behind a frame reach beyond it (section 8.8, No room), in
 * its item coordinates: `top`, the least top of its cards and the frame (0 or less), and `bottom`,
 * the largest bottom edge of its cards and the frame, shadows not counted. Keyed by the frame's
 * place key text.
 */
export interface Reach {
  readonly top: number;
  readonly bottom: number;
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
 * frame of its group, or the block): its container, address and style, and
 * its member drawing traversed at `L`, spacing `S` and margin `V`, a member
 * card of `frame` where one is given.
 */
function cardOf(
  context: Context,
  member: MemberDrawing,
  holder: Holder,
  key: PlaceKey,
  L: number,
  S: number,
  V: number,
  frame: GroupFrame | null,
): Pick<Card, "member" | "ref" | "address" | "style"> & { readonly scope: Scope } {
  const timeline = member.timeline;
  const ref = containerOf(context, key);
  const { address } = ref;
  const style = context.cascade.resolve(
    elementKey("card", address, timeline, holder.key),
    holder.style,
  );
  const laid: Context = { ...context, placement: { ...context.placement, length: L } };
  // A virtual timeline's card draws its chunks, its runs drawn once in a card the block holds.
  const flow = virtualFlow(context.manifest, member, frame === null);
  const scope = withRuns(traverse(laid, member, holder, S, V, frame, flow));
  return { member, ref, address, style, scope };
}

/**
 * Every item of the block in drawing order, the frames then the block-held
 * cards (section 8.6), `block` the holder of the frames and the block-held
 * cards and `top` the default top of the first item, below the title's
 * slot and the block's margin. An item's length `L`, scale, spacing and
 * margin are what its place states, else the placement's length, 1, 8 for a
 * frame and 4 for a block-held card, and 0; its member drawings are laid out
 * at `L`, a block-held card's at its item's spacing and margin, a member's
 * at its own card's (else 4 and 0), and a frame's cards lie its spacing
 * apart, its margin above the first and below the last. No spacing or
 * margin multiplies another. Its height, in item
 * coordinates, is the larger of its content's and the requested one; its
 * place `x` and `y` what is stated, else `P` and, for `y`, the first item at
 * `top`, each further one the placement's `spacing` below the largest drawn
 * bottom edge, after the scale, of the items before it.
 *
 * A frame's member drawings are traversed first and laid out on its elided
 * axis where its group elisions draw gaps (section 8.9), a block-held card's
 * on its own where its mode draws its stored card elisions. Each member card
 * of `aligned` places its ancestor rows on its root's side at the distances
 * its ordinates give (section 8.3); an item none of whose cards it names and
 * none of whose cards `arranged` pads is taken from `previous` where that
 * holds it, its content kept. An arranged block's items are taken in the
 * order `arranged` gives instead of drawing order, each at its default place.
 *
 * An item behind whose frame ancestor cards are drawn reaches as far as
 * `reaches` gives under its place key text (section 8.8, No room): its
 * default `y` lies so far lower that its cards' top lies the placement's
 * `spacing` below the largest bottom edge of the items before it (the first
 * item keeps its default `y`), and its bottom edge for the items after it
 * is its cards' where they reach lower than its frame, so no card overlaps
 * another item's.
 */
export function placeItems(
  context: Context,
  block: Holder,
  top: number,
  aligned: AlignedRows = new Map(),
  previous: readonly Item[] = [],
  arranged: Arranged = {},
  reaches: ReadonlyMap<string, Reach> = new Map(),
): Item[] {
  const padding = arranged.padding ?? new Map<string, number>();
  const free = arranged.order === undefined;
  const { placement, measure } = context;
  const { frames, ungrouped, placed } = drawnRoots(context.manifest, placement.places);
  let lowest: number | undefined;
  type Content = Pick<Item, "cards" | "elisions" | "DG"> & { readonly height: number };
  const place = (
    key: PlaceKey,
    frame: Frame | null,
    content: (L: number, spacing: number, margin: number) => Content,
  ): Item => {
    const stated = statedOf(context, key);
    const length = stated.length ?? placement.length;
    const scale = stated.scale ?? 1;
    const spacing = stated.spacing ?? (frame === null ? CARD_SPACING : FRAME_SPACING);
    const margin = stated.margin ?? 0;
    const before = previous.find((item) => samePlaceKey(item.key, key));
    const kept = before?.cards.every(
      (card) =>
        card.ref.key === null ||
        (!aligned.has(placeKeyText(card.ref.key)) && !padding.has(placeKeyText(card.ref.key))),
    );
    const laid: Content =
      kept === true && before !== undefined
        ? { cards: before.cards, height: before.content, elisions: before.elisions, DG: before.DG }
        : content(length, spacing, margin);
    const height = stated.height === undefined ? laid.height : Math.max(laid.height, stated.height);
    const reach = reaches.get(placeKeyText(key));
    const x = (free ? stated.x : undefined) ?? P;
    const y =
      (free ? stated.y : undefined) ??
      (lowest === undefined
        ? top
        : lowest + placement.spacing - scale * Math.min(0, reach?.top ?? 0));
    const bottom = y + scale * Math.max(height, reach?.bottom ?? height);
    lowest = lowest === undefined ? bottom : Math.max(lowest, bottom);
    // A block-held card is as high as its item.
    const cards = frame === null ? laid.cards.map((card) => ({ ...card, height })) : laid.cards;
    return {
      key,
      frame,
      stated,
      x,
      y,
      length,
      scale,
      spacing,
      margin,
      height,
      cards,
      content: laid.height,
      elisions: laid.elisions,
      DG: laid.DG,
    };
  };

  const framed = frames.map((drawn) => () => {
    const { group, members } = drawn;
    const item: PlaceKey = { item: group.id };
    const ref = containerOf(context, item);
    const address = idAddress(group.id);
    const key = unownedKey("frame", address, BLOCK_KEY);
    const holder: Holder = { key, style: context.cascade.resolve(key, block.style) };
    const title = titleOf(context, partAddress(address, "name"), group.id, group.name, holder);
    const frame: Frame = { ref, address, holder, title };
    return place(item, frame, (L, Sf, Vf) => {
      // Each member drawing is traversed at its card's own spacing and margin, then laid out on
      // the frame's elided axis where its group elisions draw gaps (section 8.9).
      const traversed = members.map((member) => {
        const key: PlaceKey = { item: group.id, member: member.timeline.id };
        const stated = requestOf(context, key);
        const spacing = stated.spacing ?? CARD_SPACING;
        const margin = stated.margin ?? 0;
        const card = cardOf(context, member, holder, key, L, spacing, margin, drawn);
        return { key, stated, spacing, margin, card };
      });
      const elisions = frameElisions(
        traversed.map(({ card }) => ({ scope: card.scope })),
        group.id,
        holder,
        L,
      );
      // The title's slot, the frame's margin `Vf`, then the cards the frame's spacing `Sf` apart,
      // each the larger of its member drawing's height and the height its own request asks, and
      // `Vf` again after the last (section 8.4); a frame without cards draws no margin.
      let y = Q;
      if (title !== undefined) y = y + measure.lineHeight(title.size) + TITLE_GAP;
      if (members.length > 0) y = y + Vf;
      const cards = traversed.map(({ key, stated, spacing, margin, card }, index): Card => {
        const { scope, ...rest } = card;
        const layout = layoutScope(
          elisions === undefined ? scope : withAxis(scope, elisions.viewOf(scope)),
          key,
          aligned.get(placeKeyText(key)),
        );
        const height =
          stated.height === undefined ? layout.height : Math.max(layout.height, stated.height);
        if (index > 0) y = y + Sf;
        y = y + (padding.get(placeKeyText(key)) ?? 0);
        const cardTop = y;
        y = y + height;
        return {
          ...rest,
          layout,
          stated,
          spacing,
          margin,
          top: cardTop,
          height,
          mode: null,
        };
      });
      if (members.length > 0) y = y + Vf;
      return { cards, height: y + Q, elisions, DG: elisions?.total ?? 0 };
    });
  });
  const loose = [...ungrouped, ...placed].map((member) => () => {
    const key: PlaceKey = { item: member.timeline.id };
    return place(key, null, (L, spacing, margin) => {
      const { scope, ...card } = cardOf(context, member, block, key, L, spacing, margin, null);
      // Its stored card elisions where its mode draws them (section 8.9).
      const mode = drawnMode(card.style, cardElisionsOf(scope).length > 0);
      const axis = ungroupedAxis(scope, mode);
      const layout = layoutScope(
        axis === undefined ? scope : withAxis(scope, axis),
        key,
        undefined,
      );
      const height = layout.height;
      return {
        cards: [{ ...card, layout, stated: {}, spacing, margin, top: 0, height, mode }],
        height,
        elisions: undefined,
        DG: 0,
      };
    });
  });
  // Each item is placed in turn, its default `y` below the items placed before it.
  const byId = new Map<string, () => Item>(
    [
      ...frames.map((drawn, index) => [drawn.group.id, framed[index]] as const),
      ...[...ungrouped, ...placed].map(
        (member, index) => [member.timeline.id, loose[index]] as const,
      ),
    ].flatMap(([id, thunk]) => (thunk === undefined ? [] : [[id, thunk] as const])),
  );
  const order = arranged.order ?? [...byId.keys()];
  return order.flatMap((id) => {
    const thunk = byId.get(id);
    return thunk === undefined ? [] : [thunk()];
  });
}
