/**
 * The canvas's source of expanded MeasureMaps over a server: the server's
 * measure-maps route, where a server that cannot expand MeasureMaps (it
 * answers 501 Not Implemented) is told apart from one that failed.
 */

import type { Server } from "@timetoalign/tilie-client";
import { ServerError } from "@timetoalign/tilie-client";
import type { MeasureKnots } from "@timetoalign/tilie-core";

/** HTTP 501: the server has no way to expand MeasureMaps. */
const NOT_IMPLEMENTED = 501;

/**
 * The expanded MeasureMaps of a manifest's text, asked of `server`;
 * `unsupported` when the server answers 501, a rejection for every other
 * failure.
 */
export function measureMapsOf(
  server: Pick<Server, "measureMaps">,
): (manifest: string) => Promise<readonly MeasureKnots[] | "unsupported"> {
  return (manifest) =>
    server.measureMaps(manifest).catch((error: unknown) => {
      if (error instanceof ServerError && error.status === NOT_IMPLEMENTED) {
        return "unsupported" as const;
      }
      throw error;
    });
}
