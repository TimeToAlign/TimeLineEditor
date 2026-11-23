<script lang="ts">
/**
 * The button heading a collapsible tile: a chevron, turned down while the
 * region it controls is shown, then the caller's words. A click (or Enter,
 * or Space) shows or hides the region; `expanded` is bindable, so the
 * caller decides where the state lives. The caller wraps it in its heading
 * and renders the region with `controls` as its ID, `hidden` while
 * collapsed. The Metadata tab's tiles, the Elisions tab's blocks and the
 * Matchstamp tab's MatchClaims share it.
 */
import type { Snippet } from "svelte";

let {
  expanded = $bindable(false),
  controls,
  testid,
  fill = true,
  children,
}: {
  /** Whether the region is shown. */
  expanded?: boolean;
  /** The ID of the region the button shows and hides. */
  controls: string;
  /** The button's `data-testid`, where tests read it. */
  testid?: string | undefined;
  /** Whether the button spans its container's width (a tile's heading); else as wide as its words. */
  fill?: boolean;
  /** The words after the chevron, which name the button. */
  children: Snippet;
} = $props();
</script>

<button
  type="button"
  class={["disclosure", { fill }]}
  data-testid={testid}
  aria-expanded={expanded}
  aria-controls={controls}
  onclick={() => (expanded = !expanded)}
>
  <svg class="chevron" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
    <path d="M6 3.5 10.5 8 6 12.5" />
  </svg>
  {@render children()}
</button>

<style>
  .disclosure {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.1rem 0;
    border: none;
    background: none;
    font: inherit;
    color: inherit;
    text-align: left;
    cursor: pointer;
  }

  .fill {
    width: 100%;
  }

  .disclosure:focus-visible {
    outline: 2px solid #0a84ff;
    outline-offset: 1px;
  }

  .chevron {
    flex: none;
    fill: none;
    stroke: #1d4f91;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
    transition: transform 120ms ease-out;
  }

  .disclosure[aria-expanded="true"] .chevron {
    transform: rotate(90deg);
  }

  @media (prefers-reduced-motion: reduce) {
    .chevron {
      transition: none;
    }
  }
</style>
