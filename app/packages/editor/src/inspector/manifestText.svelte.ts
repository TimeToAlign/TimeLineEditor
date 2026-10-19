/**
 * The Manifest tab's state: the format and options chosen, the text typed,
 * the manifest the shown text was written from, the problems listed and
 * whether the manifest changed under an unapplied edit. It lives as long as
 * the inspector, so an unapplied text survives while another tab is shown;
 * the panel calls `follow` while it is shown.
 */

import type { Block, BlockId, Json, Store } from "@timetoalign/tilie-core";
import { untrack } from "svelte";
import type { Format, Source } from "./formats.svelte.ts";
import { FORMAT_LABELS, isLoaded, loadCodec } from "./formats.svelte.ts";
import type { TextOptions } from "./manifestText.ts";
import { applyText, follow, manifestOf, manifestText } from "./manifestText.ts";
import type { InspectorProblem } from "./problems.ts";

/** What a text is written in: its format and its options. */
interface Choice extends TextOptions {
  readonly format: Format;
}

function sameChoice(left: Choice, right: Choice): boolean {
  return (
    left.format === right.format &&
    left.includeStyling === right.includeStyling &&
    left.minimal === right.minimal
  );
}

/** What the shown text was written from: the block, its manifest, the format and the options. */
interface Shown extends Choice {
  readonly block: BlockId;
  readonly manifest: Json;
}

export class ManifestText {
  format: Format = $state("json");
  includeStyling = $state(false);
  minimal = $state(false);
  /** The text in the text area. */
  text = $state("");
  /** The problems listed under the text: a refused Apply's, or writing the manifest's. */
  problems: readonly InspectorProblem[] = $state.raw([]);
  /** The manifest changed while the text held unapplied edits. */
  stale = $state(false);
  /** Why the chosen format's codec could not be loaded; empty while none failed. */
  loadFailure = $state("");

  /** The text as last written from the manifest. */
  #written = $state("");
  #shown: Shown | null = $state.raw(null);
  /** The parsed document behind the shown text, patched in place so its comments survive. */
  #source: Source | null = null;
  /** Whether the listed problems are a refused Apply's, which go with the text applied. */
  #refused = false;

  /** The format and options chosen. */
  get choice(): Choice {
    return { format: this.format, includeStyling: this.includeStyling, minimal: this.minimal };
  }

  /** Whether the text differs from the text last written from the manifest; Apply and Revert act only then. */
  get dirty(): boolean {
    return this.text !== this.#written;
  }

  /** Whether the chosen format can be written and read now (JSON always; YAML and TOML once loaded). */
  get ready(): boolean {
    return isLoaded(this.format);
  }

  /**
   * Follow the block selected, its manifest and the choice while the text
   * holds no unapplied edit: the text is written again, or patched when it
   * shows the same block in the same choice. Under an edit nothing is
   * replaced, and a change is noted as `stale`; a text typed back to the
   * shown text follows at once and drops a refused Apply's problems. A
   * codec not loaded yet is loaded first.
   */
  follow(block: Block | null): void {
    const id = block?.id ?? null;
    const manifest = block === null ? null : manifestOf(block);
    const wanted = this.choice;
    const ready = this.ready;
    const edited = this.dirty;
    untrack(() => {
      if (!ready) {
        this.#load(wanted.format);
        return;
      }
      const current = this.#shown;
      const followed =
        current !== null &&
        current.block === id &&
        current.manifest === manifest &&
        sameChoice(current, wanted);
      if (edited) {
        if (!followed) this.stale = true;
        return;
      }
      if (followed) {
        this.stale = false;
        if (this.#refused) {
          this.problems = [];
          this.#refused = false;
        }
        return;
      }
      if (id === null || manifest === null) this.#clear();
      else this.#show(id, manifest);
    });
  }

  /**
   * Apply the text to the block it was written for, one `set` replacing its
   * manifest (none when it stands for the stored manifest). A refused text
   * stays, with its problems listed.
   */
  apply(store: Store): void {
    const shown = this.#shown;
    if (shown === null) return;
    const result = applyText(store, shown.block, shown.format, this.text, shown);
    if (!result.ok) {
      this.problems = result.problems;
      this.#refused = true;
      return;
    }
    this.#source = result.value.source;
    this.text = this.#written = result.value.text;
    this.#shown = { ...shown, manifest: manifestOf(store.view.blocks[shown.block] as Block) };
    this.problems = [];
    this.#refused = false;
    this.stale = false;
  }

  /** Drop the unapplied text and show `block`'s stored manifest, or nothing without a block. */
  revert(block: Block | null): void {
    this.#source = null;
    this.#shown = null;
    if (block === null) this.#clear();
    else this.#show(block.id, manifestOf(block));
  }

  /** Show nothing. */
  #clear(): void {
    this.#shown = null;
    this.#source = null;
    this.text = this.#written = "";
    this.problems = [];
    this.#refused = false;
    this.stale = false;
  }

  /** Show the manifest of `id`, patching the current document when it shows that block in the same choice. */
  #show(id: BlockId, manifest: Json): void {
    const current = this.choice;
    const shown = this.#shown;
    const written =
      this.#source !== null && shown !== null && shown.block === id && sameChoice(shown, current)
        ? follow(this.#source, manifest, current)
        : manifestText(manifest, current.format, current);
    this.#shown = { ...current, block: id, manifest };
    this.stale = false;
    this.#refused = false;
    if (written.ok) {
      this.#source = written.value.source;
      this.text = this.#written = written.value.text;
      this.problems = [];
    } else {
      this.#source = null;
      this.text = this.#written = "";
      this.problems = written.problems;
    }
  }

  /** Start loading the codec of `format`; a failure is shown while that format is still chosen. */
  #load(format: Format): void {
    this.loadFailure = "";
    loadCodec(format).catch((error: unknown) => {
      if (this.format !== format) return;
      const reason = error instanceof Error ? error.message : String(error);
      this.loadFailure = `${FORMAT_LABELS[format]} could not be loaded (${reason}).`;
    });
  }
}
