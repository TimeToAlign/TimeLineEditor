<script lang="ts">
/**
 * The standalone page `tilie` serves: one editor filling the window. The
 * page owns what belongs to the document: its title, the `html` and `body`
 * styles, its one heading (the editor's header shows it), the token taken
 * from the fragment, the window-wide shortcuts and the test hook of test
 * builds.
 */
import { NOTICES_FILE } from "./attributions.ts";
import Editor from "./Editor.svelte";
import { UNTITLED } from "./files.ts";
import type { Status } from "./options.ts";
import { takeToken } from "./page.ts";

const token = takeToken();
let status: Status = $state.raw({ fileName: UNTITLED, dirty: false });
</script>

<svelte:head>
  <title>{status.dirty ? "• " : ""}{status.fileName} – TimeLineEditor</title>
</svelte:head>

<Editor
  server={{ url: "api/", token }}
  storage={{ slot: "current", inspectorKey: "tilie.inspector.open" }}
  shortcuts="window"
  autofocus
  testHook
  noticesUrl={NOTICES_FILE}
  onchange={(next) => (status = next)}
>
  {#snippet title()}
    <h1>TimeLineEditor</h1>
  {/snippet}
</Editor>

<style>
  :global(html, body, #app) {
    margin: 0;
    height: 100%;
  }

  h1 {
    margin: 0;
    font-size: 0.95rem;
  }
</style>
