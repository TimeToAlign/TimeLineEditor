/**
 * The flow editor's server: the server's flow routes over a manifest held
 * by the canvas, its text sent as Save writes it, the answer read back as a
 * manifest or as each convention's findings.
 */

import type { FlowFindings, FlowServer } from "@timetoalign/tilie-arranger";
import type { Server } from "@timetoalign/tilie-client";
import { isLoadError, readManifestFile, saveManifest } from "@timetoalign/tilie-core";

/** The message of a flow-maps answer that is no manifest TiLiE reads. */
export const UNREAD_FLOW_MAPS = "the server's manifest with its flows written could not be read";

/**
 * The flow routes of `server` as the flow editor asks them: `withFlowMaps`
 * the manifest the server answers with the root's flows written,
 * `findings` the sentences each convention's flow found, by convention.
 */
export function flowServerOf(server: Pick<Server, "flows" | "withFlowMaps">): FlowServer {
  return {
    async withFlowMaps(manifest, timeline) {
      const text = await server.withFlowMaps(saveManifest(manifest), timeline);
      const read = readManifestFile(text);
      if (isLoadError(read)) {
        const [first] = read.problems;
        throw new Error(
          first === undefined ? UNREAD_FLOW_MAPS : `${UNREAD_FLOW_MAPS}: ${first.message}`,
        );
      }
      return read.manifest;
    },
    async findings(manifest, timeline): Promise<FlowFindings> {
      const flows = await server.flows(saveManifest(manifest), timeline);
      return new Map(
        Object.entries(flows.conventions).map(([convention, flow]) => [
          convention,
          (flow?.findings ?? []).map((finding) => finding.message),
        ]),
      );
    },
  };
}
