/**
 * `style`: one statement embedded in the `graphical` block of each manifest
 * it names, or of every manifest holding an element its selector matches.
 */

import type { Declaration, Graphical, Selector, Statement } from "@timetoalign/timetoshare";
import type { CommandError } from "../errors.ts";
import { ErrorCode, problem } from "../errors.ts";
import { canonicalText } from "../json.ts";
import { selectorMatches } from "../manifest/elements.ts";
import { indexOf } from "../workspace/address.ts";
import type { Block } from "../workspace/blocks.ts";
import type { View } from "../workspace/view.ts";
import type { ChangeSet } from "./mutations.ts";
import { record, withBlock } from "./mutations.ts";
import type { StyleCommand } from "./types.ts";

type Properties = { readonly [property: string]: unknown };

/** `base` with the properties of `set`, a null one removed. */
function merged(base: object, set: Properties): Properties {
  const result: { [property: string]: unknown } = { ...base };
  for (const [property, value] of Object.entries(set)) {
    if (value === null) delete result[property];
    else result[property] = value;
  }
  return result;
}

const isEmpty = (value: object): boolean => Object.keys(value).length === 0;

/**
 * A `graphical` block with the statement embedded (see `StyleCommand`); its
 * other members, such as the display and band orders in `order`, are kept.
 */
export function embedStatement(
  graphical: Graphical | undefined,
  select: Selector,
  set: Properties,
  name?: string,
): Graphical {
  const styles: { [name: string]: Declaration } = { ...(graphical?.styles ?? {}) };
  let statements: Statement[] = [...(graphical?.statements ?? [])];
  const key = canonicalText(select);
  const index = statements.findIndex((statement) => canonicalText(statement.select) === key);
  const existing = statements[index];
  const place = (statement: Statement) => {
    if (index >= 0) statements[index] = statement;
    else statements.push(statement);
  };
  if (name !== undefined) {
    const style: Declaration = merged(styles[name] ?? {}, set);
    if (isEmpty(style)) {
      delete styles[name];
      statements = statements.filter((statement) => statement.set !== name);
    } else {
      styles[name] = style;
      place({ select: existing?.select ?? select, set: name });
    }
    return { ...graphical, styles, statements };
  }
  const base =
    existing === undefined
      ? {}
      : typeof existing.set === "string"
        ? (styles[existing.set] ?? {})
        : existing.set;
  const declaration: Declaration = merged(base, set);
  if (!isEmpty(declaration)) place({ select: existing?.select ?? select, set: declaration });
  else if (index >= 0) statements.splice(index, 1);
  return { ...graphical, styles, statements };
}

/** Whether an element of `block`'s manifest matches `select`. */
function holdsMatch(block: Block, select: Selector): boolean {
  const { elements, ancestry } = indexOf(block.manifest);
  return elements.some((key) => selectorMatches(select, key, ancestry));
}

export function applyStyle(
  view: View,
  command: StyleCommand,
  changes: ChangeSet,
): View | CommandError {
  const blocks: Block[] = [];
  for (const id of command.blocks ?? []) {
    const block = view.blocks[id];
    if (block === undefined) {
      return problem(ErrorCode.unknownTarget, `block ${id} does not exist`, [id]);
    }
    blocks.push(block);
  }
  if (command.blocks === undefined) {
    blocks.push(...Object.values(view.blocks).filter((block) => holdsMatch(block, command.select)));
  }
  let current = view;
  for (const block of blocks) {
    const { manifest } = block;
    const graphical = embedStatement(manifest.graphical, command.select, command.set, command.name);
    record(changes, [block.id, "manifest", "graphical"], block.id, true);
    current = withBlock(current, { ...block, manifest: { ...manifest, graphical } });
  }
  return current;
}
