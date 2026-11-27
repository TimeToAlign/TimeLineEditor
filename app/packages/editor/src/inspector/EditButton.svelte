<script lang="ts">
/**
 * The Edit button: for a single selected address, it opens the editor a
 * double-click on it would open (the arranger's `openable`, read from the
 * block's drawing as Enter reads it, and `editorOf` for a root's flow
 * control band), so a touch, which selects with a tap, reaches every
 * editor. Absent where the selection opens none, and where the canvas
 * opens no editor (`opens`, its rules' `open`), so it never offers what a
 * double-click there would not do; a refusal of the store is posted to the
 * message bar. The opened editor shows chosen what it would for the
 * selected address, as Enter on the canvas has it (`openedFocus`): a
 * window's element selected in the virtual card's editor in place of the
 * edited element its opening selected.
 */
import type { Editing, Subject } from "@timetoalign/tilie-arranger";
import {
  drawingOf,
  editorOf,
  openable,
  openedFocus,
  selectionOf,
} from "@timetoalign/tilie-arranger";
import type { Address, Store, View } from "@timetoalign/tilie-core";
import { fontMetrics } from "@timetoalign/timetoshare";
import { postOf } from "../messages.svelte.ts";
import { paneOf } from "../pane.ts";
import { editorTitle } from "./words.ts";

let {
  view,
  store,
  subjects,
  editing,
  opens,
  onselect = () => {},
}: {
  view: View;
  store: Store;
  /** The selection, resolved. */
  subjects: readonly Subject[];
  /** The innermost open editor, `null` on the arranger. */
  editing: Editing | null;
  /** Whether the canvas opens editors (its rules' `open`; false on a read-only canvas). */
  opens: boolean;
  /** Select `addresses` on the canvas: what the opened editor shows chosen. */
  onselect?: (addresses: readonly Address[]) => void;
} = $props();

const post = postOf();
/** The canvas's pane, which every drawing read here is drawn at. */
const pane = paneOf();

/** The editor the selection opens, with its kind; `null` where it opens none. */
const opened = $derived.by(() => {
  if (!opens) return null;
  const selection = selectionOf(subjects.map((subject) => subject.address));
  const target = openable(
    view,
    selection,
    (id) => {
      const block = view.blocks[id];
      return block === undefined
        ? undefined
        : drawingOf(block, view.graphical, fontMetrics, undefined, pane);
    },
    editing,
  );
  return target === null ? null : editorOf(target);
});

/**
 * Open the editor, then select what it shows chosen for the sole selected
 * address (`openedFocus`); a refusal goes to the message bar.
 */
function open(): void {
  if (opened === null) return;
  const from = subjects.length === 1 ? (subjects[0]?.address ?? null) : null;
  const error = store.open(opened.target, opened.kind);
  if (error !== null) {
    post("error", error.message);
    return;
  }
  const focus = openedFocus(store.view, opened, from);
  if (focus?.kind === "select") onselect([focus.address]);
}
</script>

{#if opened !== null}
  <button
    type="button"
    class="edit"
    data-testid="edit-button"
    title="Open the editor of {editorTitle(view, opened)}"
    onclick={open}>Edit</button
  >
{/if}

<style>
  .edit {
    padding: 0.15rem 0.6rem;
    border: 1px solid #8a8a8a;
    border-radius: 4px;
    background: #fff;
    font: inherit;
    cursor: pointer;
  }

  .edit:hover {
    background: #f0f0f0;
  }

  .edit:focus-visible {
    outline: 2px solid #0a84ff;
    outline-offset: 1px;
  }
</style>
