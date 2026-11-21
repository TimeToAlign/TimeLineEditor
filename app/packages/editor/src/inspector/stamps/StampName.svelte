<script lang="ts">
/**
 * A stamp tab's name header, the first thing under the tabs: the field
 * "Name", its label bold, and under it the hints the tab gives (why the
 * controls below wait for a name). It stays at the top of the pane while
 * the pane scrolls. Enter or leaving the field commits the text typed
 * (`oncommit`, which reads it from `drafts` under `name`); Escape shows the
 * stored name again.
 */
import type { Snippet } from "svelte";
import type { StampDrafts } from "./drafts.svelte.ts";

interface Props {
  /** Which tab's header: its test ID is `<kind>-name`. */
  kind: "timestamp" | "matchstamp";
  /** The stored name; `null` while the stamp is unnamed. */
  name: string | null;
  /** The tab's drafts: the text typed under `name`, and its refusal. */
  drafts: StampDrafts<unknown>;
  /** The IDs of the hints that describe the field too, separated by spaces. */
  describedby?: string | undefined;
  /** Enter or leaving the field: the tab names, renames or keeps the name. */
  oncommit: () => void;
  /** The hints under the field. */
  children?: Snippet;
}

let { kind, name, drafts, describedby, oncommit, children }: Props = $props();

const uid = $props.id();
const PLACEHOLDER = "Type a name to keep it";

function onkeydown(event: KeyboardEvent): void {
  if (event.key === "Enter") {
    event.preventDefault();
    oncommit();
  } else if (event.key === "Escape") drafts.settled("name");
}
</script>

<section class="stamp-name" data-testid="{kind}-name">
  <div class="line">
    <label for="{uid}-name">Name</label>
    <input
      id="{uid}-name"
      class="name"
      type="text"
      size="16"
      placeholder={name === null ? PLACEHOLDER : undefined}
      value={drafts.drafts.name ?? name ?? ""}
      aria-invalid={drafts.problems.name !== undefined}
      aria-describedby={describedby === undefined
        ? `${uid}-problem`
        : `${uid}-problem ${describedby}`}
      oninput={(event) => drafts.draft("name", event.currentTarget.value)}
      {onkeydown}
      onblur={oncommit}
    />
  </div>
  <span class="problem" id="{uid}-problem" role="status">{drafts.problems.name ?? ""}</span>
  {@render children?.()}
</section>

<style>
  /* Kept in view under the tabs while the pane scrolls beneath it. */
  .stamp-name {
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.4rem 0;
    border-bottom: 1px solid #e4e4e4;
    background: #fff;
  }

  .line {
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
  }

  label {
    color: #1a1a1a;
    font-weight: 700;
  }

  input {
    flex: 1 1 auto;
    min-width: 0;
    font: inherit;
  }

  /* The placeholder gives way as soon as the field is entered. */
  input:focus::placeholder {
    color: transparent;
  }

  .problem {
    font-size: 0.75rem;
  }
</style>
