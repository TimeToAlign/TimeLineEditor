/**
 * The flow subeditor at work: the edited row (a new FlowMap's, Add +, or a
 * hand-made one's), its Done and Cancel, what each drop and key stores, a
 * row placed as a card, and the computed FlowMaps recomputed through the
 * server. Every change is a command dispatched through the store, so it is
 * journalled in the flow editor's session: Cancel of the editor undoes all
 * of it, Done keeps it.
 */

import type { BlockId, Command, Manifest, OpenEditor, Store } from "@timetoalign/tilie-core";
import { addressKey, isComputedFlowMap } from "@timetoalign/tilie-core";
import type { Drawing } from "@timetoalign/tilie-layout";
import { SvelteMap } from "svelte/reactivity";
import type { Dragged, FlowEntry, FlowFindings } from "./flowEditor.ts";
import {
  addedId,
  draftCommand,
  gapValue,
  inserted,
  landedEntry,
  moved,
  NO_FINDINGS,
  placeVirtualCommand,
  recomputeCommands,
  removedAt,
  sameEntries,
  virtualOf,
  writeFor,
} from "./flowEditor.ts";

/**
 * The flow routes of a server, as the flow editor asks them: the manifest
 * with the flows of a root written (`POST /api/flows/flow-maps`), and what
 * playing its flow control finds per convention (`POST /api/flows`).
 */
export interface FlowServer {
  withFlowMaps(manifest: Manifest, timeline: string): Promise<Manifest>;
  findings(manifest: Manifest, timeline: string): Promise<FlowFindings>;
}

/** What the flow editor reads from the canvas and does through it. */
export interface FlowEditorHost {
  store(): Store;
  /** Runs a command; reports a refusal and answers `false`. */
  dispatch(command: Command): boolean;
  /** Reports a refusal or a notice to the canvas's host. */
  refuse(message: string): void;
  /** The drawing of block `block` as the canvas shows it; `undefined` where it shows none. */
  drawing(block: BlockId): Drawing | undefined;
  /** The server's flow routes; `undefined` without a server. */
  server(): FlowServer | undefined;
}

/** The flow editor open: its session, block and root. */
export interface FlowTarget {
  readonly session: OpenEditor["session"];
  readonly block: BlockId;
  readonly root: string;
}

/**
 * The edited row of an open flow editor: its FlowMap (a new one's once its
 * first entry has been written, `null` before; a hand-made one's from the
 * start), and how many entries the editor's session held when Add + made
 * it or the hand-made row became the edited one, which its Cancel undoes
 * down to.
 */
export interface Draft extends FlowTarget {
  readonly flowMap: string | null;
  readonly mark: number;
}

/** Whether two targets are the same open flow editor. */
const sameTarget = (left: FlowTarget, right: FlowTarget): boolean =>
  left.session === right.session && left.block === right.block && left.root === right.root;

/** The key the findings of the target's root are kept by: that of its address. */
const rootKey = (target: FlowTarget): string =>
  addressKey({ block: target.block, id: target.root });

/** The flow editor of one canvas. Its state is the edited row, whether a recompute runs, and the findings known. */
export class FlowEditorSession {
  readonly #host: FlowEditorHost;
  #draft: Draft | null = $state.raw(null);
  #recomputing = $state(false);
  /** What the server last answered for a root, by the key of its address `{block, id: root}`. */
  readonly #findings = new SvelteMap<string, FlowFindings>();

  constructor(host: FlowEditorHost) {
    this.#host = host;
  }

  /** The edited row of the open flow editor `target`; `null` where it has none. */
  draftOf(target: FlowTarget | null): Draft | null {
    const draft = this.#draft;
    return target !== null && draft !== null && sameTarget(draft, target) ? draft : null;
  }

  /** Whether the computed FlowMaps are being recomputed. */
  get recomputing(): boolean {
    return this.#recomputing;
  }

  /**
   * What playing the flow control of the target's root found per
   * convention, as the server last answered (`askFindings`); none without
   * a server, before it answers, or where it failed. Reads the answers
   * kept; never asks.
   */
  findingsOf(target: FlowTarget): FlowFindings {
    return this.#findings.get(rootKey(target)) ?? NO_FINDINGS;
  }

  /**
   * Ask the server what playing the flow control of the target's root
   * finds per convention, in the manifest as stored now: when the flow
   * editor opens and after Recompute. Its answer replaces the one kept; a
   * failure keeps none. Nothing without a server.
   */
  async askFindings(target: FlowTarget): Promise<void> {
    const server = this.#host.server();
    const manifest = this.#manifest(target);
    if (server === undefined || manifest === undefined) return;
    const key = rootKey(target);
    try {
      this.#findings.set(key, await server.findings(manifest, target.root));
    } catch {
      this.#findings.delete(key);
    }
  }

  /** Add +: the open flow editor `target` gets a new, empty FlowMap row; one edited row at a time. */
  add(target: FlowTarget): void {
    if (this.draftOf(target) !== null) return;
    this.#draft = { ...target, flowMap: null, mark: this.#host.store().entries.length };
  }

  /**
   * Edit the hand-made FlowMap `flowMap` of the target's root in its own
   * row, as the new row is edited, with its own Done and Cancel: one row at
   * a time, and never a computed FlowMap, which is read only. Whether it is
   * now the edited row.
   */
  edit(target: FlowTarget, flowMap: string): boolean {
    if (this.draftOf(target) !== null) return this.draftOf(target)?.flowMap === flowMap;
    const found = this.#manifest(target)?.flow_maps?.find((item) => item.id === flowMap);
    if (found === undefined || found.timeline !== target.root || isComputedFlowMap(found)) {
      return false;
    }
    this.#draft = { ...target, flowMap, mark: this.#host.store().entries.length };
    return true;
  }

  /** The edited row's Done: the FlowMap stays as written; the row becomes one of the others. */
  done(target: FlowTarget): void {
    if (this.draftOf(target) !== null) this.#draft = null;
  }

  /**
   * The edited row's Cancel: every step taken since Add + or since the row
   * became the edited one is undone (its entries, and the Regions and
   * virtual timelines written for them), and the new row goes.
   */
  cancel(target: FlowTarget): void {
    const draft = this.draftOf(target);
    if (draft === null) return;
    const store = this.#host.store();
    while (store.entries.length > draft.mark && store.canUndo) {
      const before = store.entries.length;
      store.undo();
      if (store.entries.length >= before) break;
    }
    this.#draft = null;
  }

  /** The manifest of the target's block as stored now. */
  #manifest(target: FlowTarget): Manifest | undefined {
    return this.#host.store().view.blocks[target.block]?.manifest;
  }

  /** The edited FlowMap's entries as stored: none before a new one's first is written. */
  entriesOf(draft: Draft): readonly FlowEntry[] {
    if (draft.flowMap === null) return [];
    const found = this.#manifest(draft)?.flow_maps?.find((item) => item.id === draft.flowMap);
    return found?.chunks ?? [];
  }

  /** Store `entries` as the edited FlowMap's: a new one's `add`, then a `set` of its `chunks` per change. */
  #write(draft: Draft, entries: readonly FlowEntry[]): boolean {
    const before = this.#manifest(draft)?.flow_maps ?? [];
    if (!this.#host.dispatch(draftCommand(draft.block, draft.root, draft.flowMap, entries))) {
      return false;
    }
    if (draft.flowMap === null) {
      const id = addedId(before, this.#manifest(draft)?.flow_maps ?? []);
      this.#draft = { ...draft, flowMap: id };
    }
    return true;
  }

  /**
   * Land `dragged` in the edited FlowMap of `target` before entry `index` (at
   * its end without one): what it needs written first is written (a Region
   * over the whole root or swept, a row's virtual timeline), then the
   * entries are stored. A swept stretch opens the new row where none is
   * open. Whether it landed.
   */
  land(target: FlowTarget, dragged: Dragged, index?: number): boolean {
    if (dragged.kind === "sweep") this.add(target);
    const draft = this.draftOf(target);
    if (draft === null) {
      this.#host.refuse("Add a new FlowMap (Add +) to drop into it");
      return false;
    }
    if (dragged.kind === "row" && dragged.flowMap === draft.flowMap) {
      this.#host.refuse("A FlowMap cannot play its own virtual timeline");
      return false;
    }
    const store = this.#host.store();
    const block = store.view.blocks[draft.block];
    if (block === undefined) return false;
    const write = writeFor(block, draft.root, dragged);
    if (write !== null && !this.#host.dispatch(write)) return false;
    const after = this.#manifest(draft);
    const entry =
      after === undefined ? null : landedEntry(block.manifest, after, draft.root, dragged);
    if (entry === null) {
      this.#host.refuse("A timeline of unknown length has no Region over it to play");
      return false;
    }
    const entries = this.entriesOf(this.draftOf(target) ?? draft);
    return this.#write(
      this.draftOf(target) ?? draft,
      inserted(entries, index ?? entries.length, entry),
    );
  }

  /** Move the edited FlowMap's entry `from` to land before `to`, or copy it there (`duplicate`). */
  move(target: FlowTarget, from: number, to: number, duplicate: boolean): boolean {
    const draft = this.draftOf(target);
    const root = this.#manifest(target)?.timelines.find((item) => item.id === target.root);
    if (draft === null || root === undefined) return false;
    const entries = this.entriesOf(draft);
    const next = moved(entries, from, to, duplicate);
    if (sameEntries(next, entries, root.number_type)) return false;
    return this.#write(draft, next);
  }

  /** Remove the edited FlowMap's entry `index`. */
  remove(target: FlowTarget, index: number): boolean {
    const draft = this.draftOf(target);
    if (draft === null || draft.flowMap === null) return false;
    return this.#write(draft, removedAt(this.entriesOf(draft), index));
  }

  /**
   * "+ Gap": a gap of the length typed as `text` (exact, in the root's
   * number type) at the edited FlowMap's end; the message saying why where
   * the text is no such length, else `null`.
   */
  gap(target: FlowTarget, text: string): string | null {
    const root = this.#manifest(target)?.timelines.find((item) => item.id === target.root);
    if (root === undefined) return `'${target.root}' is no root of the block`;
    const value = gapValue(text, root);
    if (typeof value === "string") return value;
    this.land(target, { kind: "entry", entry: { gap: value }, from: null });
    return null;
  }

  /**
   * A gap's length changed: the edited FlowMap's entry `index`, a gap,
   * given the length typed as `text` (exact, in the root's number type),
   * in one `set` of its chunks; the message saying why where the entry is
   * no gap or the text no such length, else `null`.
   */
  regap(target: FlowTarget, index: number, text: string): string | null {
    const draft = this.draftOf(target);
    const root = this.#manifest(target)?.timelines.find((item) => item.id === target.root);
    if (draft === null || root === undefined) return "No FlowMap is edited";
    const entries = this.entriesOf(draft);
    const entry = entries[index];
    if (entry === undefined || typeof entry === "string") return `entry ${index + 1} is no gap`;
    const value = gapValue(text, root);
    if (typeof value === "string") return value;
    const next = entries.map((item, at) =>
      at === index && typeof item !== "string" ? { ...item, gap: value } : item,
    );
    if (sameEntries(next, entries, root.number_type)) return null;
    this.#write(draft, next);
    return null;
  }

  /**
   * Place the row of the FlowMap `flowMap` as a card of its own: its
   * virtual timeline written where none gives its axis, then its card
   * placed at `(x, y)` of the block's places, held by the block. Whether
   * it was placed.
   */
  place(target: FlowTarget, flowMap: string, x: number, y: number): boolean {
    const written = this.#manifest(target);
    const block0 = this.#host.store().view.blocks[target.block];
    if (written === undefined || block0 === undefined) return false;
    const write = writeFor(block0, target.root, { kind: "row", flowMap });
    if (write !== null && !this.#host.dispatch(write)) return false;
    const block = this.#host.store().view.blocks[target.block];
    const virtual = block === undefined ? null : virtualOf(block.manifest, target.root, flowMap);
    const drawing = this.#host.drawing(target.block);
    if (block === undefined || virtual === null || drawing === undefined) return false;
    return this.#host.dispatch(placeVirtualCommand(block, drawing, virtual, x, y));
  }

  /**
   * Recompute: the server writes the flows of the root into the manifest,
   * and what changed is stored (`recomputeCommands`), command by command,
   * stopping at the first refusal; a notice where nothing changed, the
   * server's message where it fails. Then the findings are asked again
   * (`askFindings`).
   */
  async recompute(target: FlowTarget): Promise<void> {
    const server = this.#host.server();
    if (server === undefined || this.#manifest(target) === undefined || this.#recomputing) return;
    this.#recomputing = true;
    try {
      await this.#recompute(server, target);
    } finally {
      this.#recomputing = false;
    }
    await this.askFindings(target);
  }

  /** Recompute's request and the commands storing its answer. */
  async #recompute(server: FlowServer, target: FlowTarget): Promise<void> {
    const manifest = this.#manifest(target);
    if (manifest === undefined) return;
    let answer: Manifest;
    try {
      answer = await server.withFlowMaps(manifest, target.root);
    } catch (error) {
      this.#host.refuse(
        `The flows could not be recomputed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }
    const now = this.#manifest(target);
    if (now === undefined) return;
    const commands = recomputeCommands(now, target.block, target.root, answer);
    if (commands.length === 0) {
      this.#host.refuse("The computed FlowMaps are up to date");
      return;
    }
    for (const command of commands) if (!this.#host.dispatch(command)) return;
  }
}
