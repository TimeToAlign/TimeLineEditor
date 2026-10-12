<script module lang="ts">
import type { Problem } from "@timetoalign/tilie-core";

/** One message: what failed, and the reader's problems when there are any. */
export interface Message {
  readonly id: number;
  readonly text: string;
  readonly problems: readonly Problem[];
}
</script>

<script lang="ts">
import { problemPointer } from "./inspector/edit.ts";

interface Props {
  messages: readonly Message[];
  ondismiss: (id: number) => void;
}

let { messages, ondismiss }: Props = $props();
</script>

<!-- Non-modal: editing goes on while messages are shown. -->
<section class="messages" aria-label="Messages" aria-live="polite">
  {#each messages as message (message.id)}
    <div class="message" data-testid="message">
      <p>{message.text}</p>
      {#if message.problems.length > 0}
        <ul>
          {#each message.problems as problem, index (index)}
            {@const at = problemPointer(problem)}
            <li>
              <code>{problem.code}</code> at {#if at === ""}the top level{:else}<code>{at}</code>{/if}: {problem.message}
            </li>
          {/each}
        </ul>
      {/if}
      <button type="button" aria-label="Dismiss" title="Dismiss" onclick={() => ondismiss(message.id)}
        >×</button
      >
    </div>
  {/each}
</section>

<style>
  .messages {
    position: absolute;
    top: 0.5rem;
    left: 50%;
    z-index: 20;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    width: min(36rem, calc(100% - 4rem));
    transform: translateX(-50%);
    pointer-events: none;
  }

  .message {
    position: relative;
    padding: 0.5rem 2rem 0.5rem 0.75rem;
    border: 1px solid #c9a227;
    border-radius: 4px;
    background: #fff8e1;
    font-size: 0.85rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
    pointer-events: auto;
  }

  p {
    margin: 0;
  }

  ul {
    margin: 0.3rem 0 0;
    padding-left: 1.2rem;
    max-height: 12rem;
    overflow: auto;
  }

  button {
    position: absolute;
    top: 0.25rem;
    right: 0.25rem;
    padding: 0 0.4rem;
    border: none;
    background: none;
    font: inherit;
    font-size: 1rem;
    color: inherit;
    cursor: pointer;
  }

  button:focus-visible {
    outline: 2px solid #0a84ff;
  }
</style>
