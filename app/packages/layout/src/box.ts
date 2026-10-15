/**
 * `draw(manifest, placement, layers, metrics)`: the drawing of one
 * TimeSkeleton manifest (`docs/drawing.md` in timeskeleton). Every manifest
 * is drawn as one box (section 8): each timeline drawn as a root lies in its
 * own card and is laid out by sections 3 to 6.
 */

import {
  BLOCK_KEY,
  elementKey,
  type Manifest,
  type MemberDrawing,
  memberDrawings,
  TITLE_ADDRESS,
  timelineAncestry,
  unownedKey,
} from "@timetoalign/tilie-core";
import type { FontMetrics, Graphical } from "@timetoalign/timeskeleton";
import { canonicalOrder } from "@timetoalign/timeskeleton";
import { Cascade, type Style } from "./cascade.ts";
import { F, G, K, MARKER_BASE, P, Q, SHADOW_OFFSET, TITLE_GAP } from "./constants.ts";
import type { Drawing, DrawnElement, Placement, TextElement } from "./elements.ts";
import { layoutMember, type MemberLayout } from "./member.ts";
import { cleanText, TextMeasure } from "./metrics.ts";
import { cutText } from "./names.ts";
import { unscoped } from "./numbers.ts";
import { brace } from "./regions.ts";
import { type Context, type Holder, shown } from "./traversal.ts";

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
 * and its ungrouped roots as cards.
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
  const context: Context = { placement, cascade, measure };
  const block: Holder = { key: BLOCK_KEY, style: cascade.resolve(BLOCK_KEY, undefined) };
  const { frames, ungrouped } = memberDrawings(ordered);
  const hasFrame = frames.length > 0;
  const xn = hasFrame ? P + Q + K : P + K;

  /** A title (section 8.1): a name element at `address` with its group's or manifest's name, or its id. */
  const title = (address: string, id: string, name: string | null, holder: Holder, x: number) => {
    const style = cascade.resolve(unownedKey("name", address, holder.key), holder.style);
    const size = style["font-size"];
    const source = style.content === "none" ? (name ?? unscoped(id)) : style.content;
    const text = cutText(measure, cleanText(source), size, style["max-width"]);
    return { address, style, size, text, x, drawn: shown(style) };
  };
  type Title = ReturnType<typeof title>;
  const titleElement = (item: Title, baseline: number): TextElement => ({
    type: "name",
    address: item.address,
    style: item.style,
    x: item.x,
    baseline,
    anchor: "start",
    text: item.text,
  });
  const card = (member: MemberDrawing, holder: Holder) => {
    const timeline = member.timeline;
    const key = elementKey("card", `${timeline.id}/card`, timeline, holder.key);
    return { address: key.address as string, style: cascade.resolve(key, holder.style) };
  };
  const boxes = frames.map((frame) => {
    const key = unownedKey("group", frame.group.id, BLOCK_KEY);
    const frameHolder: Holder = { key, style: cascade.resolve(key, block.style) };
    return {
      address: frame.group.id,
      style: frameHolder.style,
      title: title(`${frame.group.id}/name`, frame.group.id, frame.group.name, frameHolder, P + Q),
      members: frame.members.map((member) => ({
        card: card(member, frameHolder),
        layout: layoutMember(context, member, frameHolder),
      })),
    };
  });
  const loose = ungrouped.map((member) => ({
    card: card(member, block),
    layout: layoutMember(context, member, block),
  }));
  const x0 = sharedStart(
    xn,
    [...boxes.flatMap((box) => box.members), ...loose].map((item) => item.layout),
    placement.length,
  );
  // The manifest's title: its name, else its id; a manifest with neither has none.
  const heading =
    ordered.name === null && ordered.id === undefined
      ? undefined
      : title(TITLE_ADDRESS, ordered.id ?? "", ordered.name, block, P);

  // Vertical (section 8.4): the manifest's title, then the frames and ungrouped cards F apart.
  interface Placed {
    readonly card: { readonly address: string; readonly style: Style };
    readonly top: number;
    readonly height: number;
    readonly elements: DrawnElement[];
  }
  const titles: TextElement[] = [];
  let next = P;
  let headingTitle: TextElement | undefined;
  if (heading?.drawn === true) {
    headingTitle = titleElement(heading, P + measure.ascent(heading.size));
    titles.push(headingTitle);
    next = P + measure.lineHeight(heading.size) + F;
  }
  const place = (item: (typeof loose)[number], top: number): Placed => ({
    card: item.card,
    top,
    height: item.layout.height,
    elements: item.layout.elements(x0, xn, top),
  });
  const drawnFrames = boxes.map((box) => {
    const top = next;
    let height = Q;
    let memberTop = top + Q;
    let titleText: TextElement | undefined;
    if (box.title.drawn) {
      titleText = titleElement(box.title, top + Q + measure.ascent(box.title.size));
      height = height + measure.lineHeight(box.title.size) + TITLE_GAP;
      memberTop = top + Q + measure.lineHeight(box.title.size) + TITLE_GAP;
    }
    const placed: Placed[] = [];
    box.members.forEach((item, index) => {
      if (index > 0) height = height + F;
      height = height + item.layout.height;
      placed.push(place(item, memberTop));
      memberTop = memberTop + item.layout.height + F;
    });
    height = height + Q;
    next = top + height + F;
    if (titleText !== undefined) titles.push(titleText);
    return { box, top, height, title: titleText, placed };
  });
  const placedLoose = loose.map((item) => {
    const placed = place(item, next);
    next = placed.top + placed.height + F;
    return placed;
  });

  const allPlaced = [...drawnFrames.flatMap((frame) => frame.placed), ...placedLoose];
  const R =
    largestRightEdge([...allPlaced.flatMap((item) => item.elements), ...titles], measure) ?? x0;
  const elements: DrawnElement[] = [];
  const rights: number[] = [];
  const bottoms: number[] = [];
  // The manifest's displayed title takes room in the box, its slot ending at P + h(s).
  if (heading !== undefined && headingTitle !== undefined) {
    elements.push(headingTitle);
    rights.push(P + measure.width(headingTitle.text, heading.size));
    bottoms.push(P + measure.lineHeight(heading.size));
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
  for (const frame of drawnFrames) {
    const right = R + K + Q;
    const bottom = frame.top + frame.height;
    rights.push(right);
    bottoms.push(bottom);
    if (shown(frame.box.style)) {
      elements.push({
        type: "group",
        address: frame.box.address,
        style: frame.box.style,
        x: P,
        y: frame.top,
        width: right - P,
        height: bottom - frame.top,
      });
    }
    if (frame.title !== undefined) elements.push(frame.title);
    for (const item of frame.placed) pushCard(item, P + Q, R + K);
  }
  for (const item of placedLoose) pushCard(item, P, hasFrame ? R + K + Q : R + K);

  const Wb = rights.length === 0 ? P + x0 : P + Math.max(...rights);
  const Hb = bottoms.length === 0 ? P : P + Math.max(...bottoms);
  const W = placement.width === null ? Wb : Math.max(Wb, placement.width);
  const H = placement.height === null ? Hb : Math.max(Hb, placement.height);
  elements.unshift({ type: "block", address: null, style: block.style, width: W, height: H });
  return {
    width: W,
    height: H,
    elements,
    unmapped: [...measure.unmapped].sort((left, right) => left - right),
  };
}
