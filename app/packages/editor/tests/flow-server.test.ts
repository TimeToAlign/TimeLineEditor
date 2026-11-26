/**
 * The flow editor's server over the client's flow routes; the expected
 * values are derived in `README.md` ("Editing", the flow editor's server).
 */

import type { Server } from "@timetoalign/tilie-client";
import { readManifestFile, saveManifest } from "@timetoalign/tilie-core";
import { describe, expect, it } from "vitest";
import { flowServerOf, UNREAD_FLOW_MAPS } from "../src/flowServer.ts";
import { storeOf } from "./support.ts";

const A = "0000000000";

/** The manifest of `flow/virtual_cards`, as a store reads it. */
function manifest() {
  const found = storeOf("flow/virtual_cards").view.blocks[A]?.manifest;
  if (found === undefined) throw new Error("no block");
  return found;
}

/** A server answering the two flow routes with `answers`, recording what it was asked. */
function serverOf(answers: {
  readonly flows?: Awaited<ReturnType<Server["flows"]>>;
  readonly text?: string;
}): { server: Pick<Server, "flows" | "withFlowMaps">; asked: [string, string, string][] } {
  const asked: [string, string, string][] = [];
  return {
    asked,
    server: {
      async flows(text, timeline) {
        asked.push(["flows", text, timeline]);
        if (answers.flows === undefined) throw new Error("no flows");
        return answers.flows;
      },
      async withFlowMaps(text, timeline) {
        asked.push(["flow-maps", text, timeline]);
        return answers.text ?? "";
      },
    },
  };
}

describe("flowServerOf", () => {
  it("sends the manifest as Save writes it, and reads the flow-maps answer back", async () => {
    const held = manifest();
    const text = saveManifest(held);
    const { server, asked } = serverOf({ text });
    const answer = await flowServerOf(server).withFlowMaps(held, "allegro");
    expect(asked).toEqual([["flow-maps", text, "allegro"]]);
    const read = readManifestFile(text);
    if ("problems" in read) throw new Error("unread");
    expect(answer).toEqual(read.manifest);
  });

  it("reads each convention's findings, their messages in order", async () => {
    const held = manifest();
    const flow = (messages: string[]) => ({
      runs: [],
      sections: [],
      findings: messages.map((message) => ({
        kind: "never_played" as const,
        coordinate: 0,
        message,
      })),
    });
    const { server, asked } = serverOf({
      flows: {
        timeline: "allegro",
        number_type: "fraction",
        atomic_sections: [],
        conventions: { default: flow(["first", "second"]), single: flow([]) },
      },
    });
    const findings = await flowServerOf(server).findings(held, "allegro");
    expect(asked).toEqual([["flows", saveManifest(held), "allegro"]]);
    expect([...findings]).toEqual([
      ["default", ["first", "second"]],
      ["single", []],
    ]);
  });

  it("rejects a flow-maps answer it cannot read", async () => {
    const { server } = serverOf({ text: "{}" });
    await expect(flowServerOf(server).withFlowMaps(manifest(), "allegro")).rejects.toThrow(
      UNREAD_FLOW_MAPS,
    );
  });
});
