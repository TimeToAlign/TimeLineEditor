<script lang="ts">
/**
 * A list of problems, one way wherever they are shown: each item its code,
 * its message and where it lies, "at line L, column C" for a syntax error,
 * else "at" the JSON pointer of its member or "at the top level". The
 * host sets the colour with `--problem-color`.
 */
import type { InspectorProblem } from "./problems.ts";
import { problemPlace } from "./problems.ts";

let {
  problems,
  id,
  label,
  live = false,
}: {
  problems: readonly Pick<InspectorProblem, "code" | "message" | "path" | "line" | "column">[];
  /** The list's id, for a field described by it. */
  id?: string;
  /** The list's accessible name. */
  label?: string;
  /** Whether a change of the list is announced (`aria-live="polite"`). */
  live?: boolean;
} = $props();
</script>

<ul class="problems" {id} aria-label={label} aria-live={live ? "polite" : undefined}>
  {#each problems as problem, index (index)}
    {@const place = problemPlace(problem)}
    <li>
      <code>{problem.code}</code>
      {problem.message}
      <span class="where"
        >at {#if "position" in place}{place.position}{:else if place.pointer === null}the top level{:else}<code
            >{place.pointer}</code
          >{/if}</span
      >
    </li>
  {/each}
</ul>

<style>
  .problems {
    margin: 0;
    padding: 0;
    list-style: none;
    color: var(--problem-color, inherit);
  }

  li + li {
    margin-top: 0.25rem;
  }

  code {
    font-family: ui-monospace, "DejaVu Sans Mono", Menlo, Consolas, monospace;
  }
</style>
