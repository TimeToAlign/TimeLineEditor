/**
 * The flow subeditor at work: the new FlowMap's row (Add +, its Done and
 * Cancel), what each drop and key stores, a row placed as a card, and the
 * computed FlowMaps recomputed through the server. Every change is a
 * command dispatched through the store, so it is journalled in the flow
 * editor's session: Cancel of the editor undoes all of it, Done keeps it.
 */

import type { BlockId, Command, Manifest, OpenEditor, Store } from "@timetoalign/tilie-core";
import type { Drawing } from "@timetoalign/tilie-layout";
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
 * The new FlowMap's row of an open flow editor: its FlowMap once its first
 * entry has been written (`null` before), and how many entries the
 * editor's session held when Add + made it, which its Cancel undoes down to.
 */
export interface Draft extends FlowTarget {
  readonly flowMap: string | null;
  readonly mark: number;
}

/** Whether two targets are the same open flow editor. */
const sameTarget = (left: FlowTarget, right: FlowTarget): boolean =>
  left.session === right.session && left.block === right.block && left.root === right.root;

/** The findings asked of the server, by manifest and root. */
type Known = FlowFindings | "pending" | "failed";

/** The flow editor of one canvas. Its state is the new FlowMap's row and whether a recompute runs. */
export class FlowEditorSession {
  readonly #host: FlowEditorHost;
  #draft: Draft | null = $state.raw(null);
  #recomputing = $state(false);
  /** Bumped when findings arrive, so the rows read them. */
  #arrived = $state(0);
  /** What the server answered, by manifest and root: a cache, read again when `#arrived` moves. */
  readonly #findings = new WeakMap<Manifest, { [root: string]: Known }>();

  constructor(host: FlowEditorHost) {
    this.#host = host;
  }

  /** The new FlowMap's row of the open flow editor `target`; `null` where it has none. */
  draftOf(target: FlowTarget | null): Draft | null {
    const draft = this.#draft;
    return target !== null && draft !== null && sameTarget(draft, target) ? draft : null;
  }

  /** Whether the computed FlowMaps are being recomputed. */
  get recomputing(): boolean {
    return this.#recomputing;
  }

  /**
   * What playing the flow control of `root` in `manifest` finds per
   * convention, asked of the server once per manifest object and root and
   * kept as it arrives; none without a server, until it answers, or when
   * it fails.
   */
  findingsOf(manifest: Manifest, root: string): FlowFindings {
    void this.#arrived;
    const server = this.#host.server();
    if (server === undefined) return NO_FINDINGS;
    let byRoot = this.#findings.get(manifest);
    if (byRoot === undefined) {
      byRoot = {};
      this.#findings.set(manifest, byRoot);
    }
    const known = byRoot[root];
    if (known !== undefined) return typeof known === "string" ? NO_FINDINGS : known;
    const held = byRoot;
    held[root] = "pending";
    const settle = (answer: Known) => {
      held[root] = answer;
      this.#arrived += 1;
    };
    Promise.resolve()
      .then(() => server.findings(manifest, root))
      .then(settle, () => settle("failed"));
    return NO_FINDINGS;
  }

  /** Add +: the open flow editor `target` gets a new, empty FlowMap row; one at a time. */
  add(target: FlowTarget): void {
    if (this.draftOf(target) !== null) return;
    this.#draft = { ...target, flowMap: null, mark: this.#host.store().entries.length };
  }

  /** The new row's Done: the FlowMap stays as written; the row becomes one of the others. */
  done(target: FlowTarget): void {
    if (this.draftOf(target) !== null) this.#draft = null;
  }

  /**
   * The new row's Cancel: every step taken since Add + is undone (its
   * entries, and the Regions and virtual timelines written for them), and
   * the row goes.
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

  /** The new FlowMap's entries as stored: none before its first is written. */
  entriesOf(draft: Draft): readonly FlowEntry[] {
    if (draft.flowMap === null) return [];
    const found = this.#manifest(draft)?.flow_maps?.find((item) => item.id === draft.flowMap);
    return found?.chunks ?? [];
  }

  /** Store `entries` as the new FlowMap's: its `add`, then a `set` of its `chunks` per change. */
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
   * Land `dragged` in the new FlowMap of `target` before entry `index` (at
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

  /** Move the new FlowMap's entry `from` to land before `to`, or copy it there (`duplicate`). */
  move(target: FlowTarget, from: number, to: number, duplicate: boolean): boolean {
    const draft = this.draftOf(target);
    if (draft === null) return false;
    const entries = this.entriesOf(draft);
    const next = moved(entries, from, to, duplicate);
    if (JSON.stringify(next) === JSON.stringify(entries)) return false;
    return this.#write(draft, next);
  }

  /** Remove the new FlowMap's entry `index`. */
  remove(target: FlowTarget, index: number): boolean {
    const draft = this.draftOf(target);
    if (draft === null || draft.flowMap === null) return false;
    return this.#write(draft, removedAt(this.entriesOf(draft), index));
  }

  /**
   * "+ Gap": a gap of the length typed as `text` (exact, in the root's
   * number type) at the new FlowMap's end; the message saying why where
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
   * server's message where it fails.
   */
  async recompute(target: FlowTarget): Promise<void> {
    const server = this.#host.server();
    const manifest = this.#manifest(target);
    if (server === undefined || manifest === undefined || this.#recomputing) return;
    this.#recomputing = true;
    try {
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
    } finally {
      this.#recomputing = false;
    }
  }
}
