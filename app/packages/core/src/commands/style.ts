/**
 * `style`: one rule embedded in the `graphical` object of each manifest
 * it names, or of every manifest holding an element its selector matches.
 */

import type { Declaration, Rule, Selector } from "@timetoalign/timetoshare";
import type { CommandError } from "../errors.ts";
import { ErrorCode, problem } from "../errors.ts";
import { canonicalText } from "../json.ts";
import { addressKey } from "../manifest/address.ts";
import { selectorMatches } from "../manifest/elements.ts";
import type { ManifestGraphical } from "../manifest/types.ts";
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
 * A `graphical` block with the rule embedded (see `StyleCommand`); its
 * other members, such as the display and band orders in `order` and the
 * named timestamps, are kept.
 */
export function embedRule(
  graphical: ManifestGraphical | undefined,
  select: Selector,
  set: Properties,
  name?: string,
): ManifestGraphical {
  const styles: { [name: string]: Declaration } = { ...(graphical?.styles ?? {}) };
  let rules: Rule[] = [...(graphical?.rules ?? [])];
  const key = canonicalText(select);
  const index = rules.findIndex((rule) => canonicalText(rule.select) === key);
  const existing = rules[index];
  const place = (rule: Rule) => {
    if (index >= 0) rules[index] = rule;
    else rules.push(rule);
  };
  if (name !== undefined) {
    const style: Declaration = merged(styles[name] ?? {}, set);
    if (isEmpty(style)) {
      delete styles[name];
      rules = rules.filter((rule) => rule.set !== name);
    } else {
      styles[name] = style;
      place({ select: existing?.select ?? select, set: name });
    }
    return { ...graphical, styles, rules };
  }
  const base =
    existing === undefined
      ? {}
      : typeof existing.set === "string"
        ? (styles[existing.set] ?? {})
        : existing.set;
  const declaration: Declaration = merged(base, set);
  if (!isEmpty(declaration)) place({ select: existing?.select ?? select, set: declaration });
  else if (index >= 0) rules.splice(index, 1);
  return { ...graphical, styles, rules };
}

/** Whether an element of `block`'s manifest matches `select`. */
function holdsMatch(block: Block, select: Selector): boolean {
  const { elements, ancestry } = indexOf(block.manifest);
  return elements.some((key) => selectorMatches(select, key, ancestry));
}

/**
 * Apply a `style`: embed its rule in each block it names, or, naming none,
 * in every block whose manifest holds an element its selector matches,
 * recording each changed manifest in `changes`. A named block that does not
 * exist is `unknown_target`.
 */
export function applyStyle(
  view: View,
  command: StyleCommand,
  changes: ChangeSet,
): View | CommandError {
  const blocks: Block[] = [];
  for (const id of command.blocks ?? []) {
    const block = view.blocks[id];
    if (block === undefined) {
      return problem(ErrorCode.unknownTarget, `block '${id}' does not exist`, [
        addressKey({ block: id }),
      ]);
    }
    blocks.push(block);
  }
  if (command.blocks === undefined) {
    blocks.push(...Object.values(view.blocks).filter((block) => holdsMatch(block, command.select)));
  }
  let current = view;
  for (const block of blocks) {
    const { manifest } = block;
    const graphical = embedRule(manifest.graphical, command.select, command.set, command.name);
    record(changes, [block.id, "manifest", "graphical"], block.id, true);
    current = withBlock(current, { ...block, manifest: { ...manifest, graphical } });
  }
  return current;
}
