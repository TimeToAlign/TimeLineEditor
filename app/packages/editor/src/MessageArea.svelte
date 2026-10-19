<script lang="ts">
import ProblemList from "./inspector/ProblemList.svelte";
import type { Message } from "./messages.ts";

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
        <div class="problems"><ProblemList problems={message.problems} /></div>
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

  .problems {
    margin: 0.3rem 0 0;
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
