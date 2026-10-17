/**
 * `draw(manifest, placement, layers, metrics)`: the drawing of one
 * TimeSkeleton manifest (`docs/drawing.md` in timeskeleton). Every manifest
 * is drawn as one box (section 8): each timeline drawn as a root lies in its
 * own card and is laid out by sections 3 to 6, and each item of the box, a
 * frame or an ungrouped root's card, lies at its own place.
 */

import {
  BLOCK_KEY,
  elementKey,
  type Manifest,
  type MemberDrawing,
  memberDrawings,
  type Place,
  TITLE_ADDRESS,
  timelineAncestry,
  unownedKey,
} from "@timetoalign/tilie-core";
import type { FontMetrics, Graphical } from "@timetoalign/timeskeleton";
import { canonicalOrder } from "@timetoalign/timeskeleton";
import { shifted } from "./canvas.ts";
import { Cascade, type Style } from "./cascade.ts";
import { F, G, K, MARKER_BASE, P, Q, SHADOW_OFFSET, TITLE_GAP } from "./constants.ts";
import type { Drawing, DrawnElement, DrawnItem, Placement, TextElement } from "./elements.ts";
import { layoutMember, type MemberLayout } from "./member.ts";
import { cleanText, TextMeasure } from "./metrics.ts";
import { cutText } from "./names.ts";
import { unscoped } from "./numbers.ts";
import { brace } from "./regions.ts";
import { bandOrderOf } from "./sides.ts";
import { type Holder, shown } from "./traversal.ts";

/** An item's place in place coordinates (section 8.6), with what `places` states for it. */
interface ItemPlace {
  readonly key: string;
  readonly stated: Place;
  readonly L: number;
  readonly x: number;
  readonly y: number;
  readonly height: number;
}

/**
 * The shared start `x0` of the members' lines (section 8.2): past the name
 * column starting at `xn`, so that no centred label crosses its left edge
 * and no chevron crosses the gap after the names.
 */
function sharedStart(xn: number, members: readonly MemberLayout[], L: number): number {
  const names = members.flatMap((member) => member.names);
  const N = names.length === 0 ? 0 : Math.max(...names);
  const gap = names.length === 0 ? 0 : G;
  let x0 = xn + N + gap;
  for (const item of members.flatMap((member) => member.centred)) {
    x0 = Math.max(x0, xn + item.width / 2 - L * item.u);
  }
  for (const wa of members.flatMap((member) => member.chevrons)) {
    x0 = Math.max(x0, xn + N + gap + 8 * wa);
  }
  return x0;
}

/** The right edge of an element (section 6.7): geometric, no stroke width counted. */
function rightEdge(element: DrawnElement, measure: TextMeasure): number | undefined {
  switch (element.type) {
    case "block":
    case "group":
    case "card":
      return undefined;
    case "timeline":
    case "child":
    case "ancestor": {
      const w = element.style["stroke-width"];
      const end = {
        arrowhead: element.xe + 3 * w,
        open: element.xe + 3 * w,
        circle: element.xe + w,
        diamond: element.xe + 1.5 * w,
        unknown: element.xe + 5.5 * w,
        chevrons: element.xe + 4 * w,
      }[element.end];
      return element.start === "circle" ? Math.max(element.xs + w, end) : end;
    }
    case "map":
      return element.xe;
    case "region":
      return Math.max(
        ...brace(element.x1, element.x2, element.xm, element.yb, element.ya).flatMap((command) =>
          command.points.map(([x]) => x),
        ),
      );
    case "jump":
      return Math.max(
        ...[
          element.start,
          element.c1,
          element.c2,
          element.base,
          element.tip,
          ...element.corners,
        ].map(([x]) => x),
      );
    case "break":
    case "boundary":
      return element.x;
    case "wedge":
      return element.x + MARKER_BASE / 2;
    case "name":
    case "label": {
      const width = measure.width(element.text, element.style["font-size"]);
      return element.anchor === "start" ? element.x + width : element.x + width / 2;
    }
  }
}

/** The largest right edge of some elements, or `undefined` when none has one. */
function largestRightEdge(
  elements: readonly DrawnElement[],
  measure: TextMeasure,
): number | undefined {
  const edges = elements
    .map((element) => rightEdge(element, measure))
    .filter((edge): edge is number => edge !== undefined);
  return edges.length === 0 ? undefined : Math.max(...edges);
}

/**
 * Draw one manifest as one box (section 8): its title, its groups as frames
 * and its ungrouped roots as cards, each item at its place (section 8.6).
 */
export function draw(
  manifest: Manifest,
  placement: Placement,
  layers: readonly (Graphical | undefined)[],
  metrics: FontMetrics,
): Drawing {
  const ordered = canonicalOrder(manifest as never) as unknown as Manifest;
  const measure = new TextMeasure(metrics);
  const cascade = new Cascade(layers, timelineAncestry(ordered));
  const block: Holder = { key: BLOCK_KEY, style: cascade.resolve(BLOCK_KEY, undefined) };
  const { frames, ungrouped } = memberDrawings(ordered);

  /** A title (section 8.1): a name element at `address` with its group's or manifest's name, or its id. */
  const title = (address: string, id: string, name: string | null, holder: Holder) => {
    const style = cascade.resolve(unownedKey("name", address, holder.key), holder.style);
    const size = style["font-size"];
    const source = style.content === "none" ? (name ?? unscoped(id)) : style.content;
    const text = cutText(measure, cleanText(source), size, style["max-width"]);
    return { address, style, size, text, drawn: shown(style) };
  };
  type Title = ReturnType<typeof title>;
  const titleElement = (item: Title, x: number, baseline: number): TextElement => ({
    type: "name",
    address: item.address,
    style: item.style,
    x,
    baseline,
    anchor: "start",
    text: item.text,
  });
  const card = (member: MemberDrawing, holder: Holder) => {
    const timeline = member.timeline;
    const key = elementKey("card", `${timeline.id}/card`, timeline, holder.key);
    return { address: key.address as string, style: cascade.resolve(key, holder.style) };
  };
  /** A member drawing at its item's graphical length `L`, in its root's band order (section 6.4). */
  const layout = (member: MemberDrawing, holder: Holder, group: string | null, L: number) => {
    const order = bandOrderOf(placement, member.timeline.id, group);
    return layoutMember(
      { placement: { ...placement, length: L, order }, cascade, measure },
      member,
      holder,
    );
  };
  /** What `places` states for an item, `{}` when it states nothing. */
  const statedOf = (key: string): Place =>
    Object.hasOwn(placement.places, key) ? (placement.places[key] as Place) : {};

  // The manifest's title: its name, else its id; a manifest with neither has none.
  const heading =
    ordered.name === null && ordered.id === undefined
      ? undefined
      : title(TITLE_ADDRESS, ordered.id ?? "", ordered.name, block);
  const headingDrawn = heading?.drawn === true ? heading : undefined;

  // Each item's place (section 8.6), in place coordinates: what `places` states, else the
  // defaults, the first item below the title and every further one F below the largest bottom
  // edge of the items before it. Heights do not depend on the place.
  const first = headingDrawn === undefined ? P : P + measure.lineHeight(headingDrawn.size) + F;
  const itemBottoms: number[] = [];
  const nextTop = () => (itemBottoms.length === 0 ? first : Math.max(...itemBottoms) + F);
  /**
   * The place of the item `key`, its content laid out at the item's length `L`: its height the
   * larger of the content's and the requested one, its bottom edge recorded for the next default top.
   */
  const placeItem = <T extends { readonly height: number }>(
    key: string,
    content: (L: number) => T,
  ) => {
    const stated = statedOf(key);
    const L = stated.length ?? placement.length;
    const laid = content(L);
    const height = stated.height === undefined ? laid.height : Math.max(laid.height, stated.height);
    const x = stated.x ?? P;
    const y = stated.y ?? nextTop();
    itemBottoms.push(y + height);
    return { ...laid, key, stated, L, x, y, height };
  };
  const framed = frames.map((frame) => {
    const id = frame.group.id;
    const key = unownedKey("group", id, BLOCK_KEY);
    const holder: Holder = { key, style: cascade.resolve(key, block.style) };
    return placeItem(id, (L) => {
      const members = frame.members.map((member) => ({
        card: card(member, holder),
        layout: layout(member, holder, id, L),
      }));
      const frameTitle = title(`${id}/name`, id, frame.group.name, holder);
      // The frame's height (section 8.4): the title's slot, then the cards F apart.
      let height = Q;
      if (frameTitle.drawn) height = height + measure.lineHeight(frameTitle.size) + TITLE_GAP;
      members.forEach((item, index) => {
        if (index > 0) height = height + F;
        height = height + item.layout.height;
      });
      height = height + Q;
      return { holder, members, frameTitle, height };
    });
  });
  const loose = ungrouped.map((member) =>
    placeItem(member.timeline.id, (L) => {
      const memberLayout = layout(member, block, null, L);
      return { member, memberLayout, height: memberLayout.height };
    }),
  );

  // The box grows left and up to hold every frame and card with the padding P (section 8.4):
  // the place origin lies at (Ox, Oy) in the box. A frame's cards lie inside it.
  const positioned = [...framed, ...loose];
  const Xl =
    positioned.length === 0 ? 0 : Math.min(0, Math.min(...positioned.map((item) => item.x)) - P);
  const Yt =
    positioned.length === 0 ? 0 : Math.min(0, Math.min(...positioned.map((item) => item.y)) - P);
  const Ox = 0 - Xl;
  const Oy = 0 - Yt;

  // Every position below is computed in place coordinates as sections 6 and 8 sum it; the
  // place origin is added to each finished position last.
  interface Placed {
    readonly card: { readonly address: string; readonly style: Style };
    readonly top: number;
    readonly height: number;
    readonly elements: DrawnElement[];
  }
  const elements: DrawnElement[] = [];
  const items: DrawnItem[] = [];
  const rights: number[] = [];
  const bottoms: number[] = [];
  /**
   * An item's `R`, the larger of its content's and what its `width` request asks (section 8.6),
   * and its right edge `R + K + margin`, `margin` the inset of the cards it holds: Q for a frame,
   * 0 for an ungrouped card. Lists the item with its place and drawn size.
   */
  const finish = (
    item: ItemPlace,
    kind: DrawnItem["kind"],
    address: string,
    content: number,
    margin: number,
  ) => {
    const { key, stated, L, x, y, height } = item;
    const R =
      stated.width === undefined ? content : Math.max(content, x + stated.width - K - margin);
    const right = R + K + margin;
    items.push({
      key,
      kind,
      address,
      place: { x, y, length: L, width: right - x, height },
      stated,
    });
    return { R, right };
  };
  // The manifest's displayed title takes room in the box, its slot ending at P + h(s).
  if (headingDrawn !== undefined) {
    const headingTitle = titleElement(headingDrawn, P, P + measure.ascent(headingDrawn.size));
    elements.push(headingTitle);
    rights.push(P + measure.width(headingTitle.text, headingDrawn.size));
    bottoms.push(P + measure.lineHeight(headingDrawn.size));
  }
  // A frame or card takes room in the box whether displayed or not; a card's shadow only when drawn.
  const pushCard = (item: Placed, left: number, right: number) => {
    const bottom = item.top + item.height;
    rights.push(right);
    bottoms.push(bottom);
    if (shown(item.card.style)) {
      if (item.card.style.shadow !== "none") {
        rights.push(right + SHADOW_OFFSET);
        bottoms.push(bottom + SHADOW_OFFSET);
      }
      elements.push({
        type: "card",
        address: item.card.address,
        style: item.card.style,
        x: left,
        y: item.top,
        width: right - left,
        height: bottom - item.top,
      });
    }
    elements.push(...item.elements);
  };

  for (const frame of framed) {
    const { key: id, holder, L, members, frameTitle, height, x } = frame;
    const top = frame.y;
    const xn = x + Q + K;
    const x0 = sharedStart(
      xn,
      members.map((item) => item.layout),
      L,
    );
    // Vertical (section 8.4): the title, then the cards F apart.
    let memberTop = top + Q;
    let titleText: TextElement | undefined;
    if (frameTitle.drawn) {
      titleText = titleElement(frameTitle, x + Q, top + Q + measure.ascent(frameTitle.size));
      memberTop = top + Q + measure.lineHeight(frameTitle.size) + TITLE_GAP;
    }
    const placed: Placed[] = members.map((item) => {
      const memberPlaced = {
        card: item.card,
        top: memberTop,
        height: item.layout.height,
        elements: item.layout.elements(x0, xn, memberTop),
      };
      memberTop = memberTop + item.layout.height + F;
      return memberPlaced;
    });
    const content =
      largestRightEdge(
        [
          ...placed.flatMap((item) => item.elements),
          ...(titleText === undefined ? [] : [titleText]),
        ],
        measure,
      ) ?? x0;
    const { R, right } = finish(frame, "group", id, content, Q);
    const bottom = top + height;
    rights.push(right);
    bottoms.push(bottom);
    if (shown(holder.style)) {
      elements.push({
        type: "group",
        address: id,
        style: holder.style,
        x,
        y: top,
        width: right - x,
        height: bottom - top,
      });
    }
    if (titleText !== undefined) elements.push(titleText);
    for (const item of placed) pushCard(item, x + Q, R + K);
  }
  for (const item of loose) {
    const { member, L, memberLayout, height, x } = item;
    const top = item.y;
    const xn = x + K;
    const x0 = sharedStart(xn, [memberLayout], L);
    const drawn = memberLayout.elements(x0, xn, top);
    const placed: Placed = { card: card(member, block), top, height, elements: drawn };
    const content = largestRightEdge(drawn, measure) ?? x0;
    const { right } = finish(item, "card", placed.card.address, content, 0);
    pushCard(placed, x, right);
  }

  // The content runs from Xl to Xr and from Yt to Yb in place coordinates (section 8.4).
  const Xr = rights.length === 0 ? 2 * P + K : P + Math.max(...rights);
  const Yb = bottoms.length === 0 ? P : P + Math.max(...bottoms);
  const Wb = Xr - Xl;
  const Hb = Yb - Yt;
  const W = placement.width === null ? Wb : Math.max(Wb, placement.width);
  const H = placement.height === null ? Hb : Math.max(Hb, placement.height);
  const inBox = elements.map((item) => shifted(item, Ox, Oy));
  inBox.unshift({ type: "block", address: null, style: block.style, width: W, height: H });
  return {
    width: W,
    height: H,
    origin: { x: Ox, y: Oy },
    items,
    elements: inBox,
    unmapped: [...measure.unmapped].sort((left, right) => left - right),
  };
}
