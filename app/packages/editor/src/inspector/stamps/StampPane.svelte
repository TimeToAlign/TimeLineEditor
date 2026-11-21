<script lang="ts">
/**
 * The pane of a stamp tab (Timestamp, Matchstamp): its sections one below
 * the other, and the look they share, held here once: an area's column and
 * heading, a hint, a refusal, an action button, a code text. Only the
 * classes below are styled, so that a component a section holds (the format
 * switch, the provenance details, a question) keeps its own look.
 */
import type { Snippet } from "svelte";

let { children }: { children: Snippet } = $props();
</script>

<div class="pane">
  {@render children()}
</div>

<style>
  .pane {
    display: flex;
    flex: 1 0 auto;
    flex-direction: column;
    gap: 0.75rem;
  }

  .pane :global {
    .area {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }

    .area > h3,
    .area h4 {
      margin: 0;
      color: #595959;
      font-size: 0.75rem;
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }

    .area h4 {
      margin-top: 0.3rem;
      font-size: 0.7rem;
    }

    p.hint,
    p.problem {
      margin: 0;
    }

    .hint {
      color: #595959;
    }

    .problem {
      color: #b00020;
    }

    .problem:empty {
      display: none;
    }

    .stamp-code {
      font-family: ui-monospace, "DejaVu Sans Mono", Menlo, Consolas, monospace;
    }

    button.action {
      padding: 0.1rem 0.4rem;
      border: 1px solid #c8c8c8;
      border-radius: 3px;
      background: #fff;
      font: inherit;
      font-size: 0.75rem;
      cursor: pointer;
    }

    button.action:hover:enabled {
      border-color: #0a84ff;
    }

    button.action:focus-visible {
      outline: 2px solid #0a84ff;
      outline-offset: 1px;
    }

    button.action:disabled {
      cursor: not-allowed;
      opacity: 0.6;
    }
  }
</style>
