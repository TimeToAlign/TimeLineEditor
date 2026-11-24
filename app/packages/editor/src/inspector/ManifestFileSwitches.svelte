<script lang="ts">
/**
 * How a block's manifest is written to a file: Include styling and
 * Minimal, kept per block in the workspace's settings
 * (`settings.manifests`) and changed there (`configure`), outside the
 * journal. The Manifest tab shows them above the text they shape, the
 * Bundle tab beside the bundle's other settings; both draw this one
 * component on the same stored values. Without a block they show the
 * defaults of a block no file wrote, disabled.
 */
import type { Block, Store, View } from "@timetoalign/tilie-core";
import { manifestFileOf, NEW_MANIFEST_FILE } from "@timetoalign/tilie-core";
import type { FileForm } from "@timetoalign/timetoshare";

let {
  block,
  view,
  store,
  disabled = false,
  describedby,
}: {
  /** The block whose manifest file the switches state; `null` for none. */
  block: Block | null;
  /** The workspace as shown, whose settings hold the block's manifest file. */
  view: View;
  store: Store;
  /** While disabled no switch is flipped: the Manifest tab's text holds an unapplied edit. */
  disabled?: boolean;
  /** The ID of what says why they are disabled. */
  describedby?: string | undefined;
} = $props();

/** How the block's manifest is written to a file. */
const file: FileForm = $derived(
  block === null ? NEW_MANIFEST_FILE : manifestFileOf(view.settings, block.id),
);

/** Write one member of the block's manifest file to the settings. */
function configure(change: Partial<FileForm>): void {
  if (block === null) return;
  const refused = store.configure({ manifests: { [block.id]: { ...file, ...change } } });
  if (refused !== null) throw new Error(`a manifest file is refused: ${refused.message}`);
}
</script>

<div class="toggles" role="group" aria-label="Manifest file">
  <label>
    <input
      type="checkbox"
      data-testid="manifest-file-styling"
      bind:checked={() => file.styling, (styling) => configure({ styling })}
      disabled={disabled || block === null}
      aria-describedby={describedby}
    />
    Include styling
  </label>
  <label>
    <input
      type="checkbox"
      data-testid="manifest-file-minimal"
      bind:checked={() => file.minimal, (minimal) => configure({ minimal })}
      disabled={disabled || block === null}
      aria-describedby={describedby}
    />
    Minimal
  </label>
</div>

<style>
  .toggles {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  /* Disabled while the text holds an edit: the label greys with its box. */
  label:has(input:disabled),
  input:disabled {
    color: #595959;
    cursor: not-allowed;
  }
</style>
