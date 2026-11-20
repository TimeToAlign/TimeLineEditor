/**
 * The canvas's source of expanded MeasureMaps over a server: the server's
 * measure-maps route, where a server that cannot expand MeasureMaps (it
 * answers 501 Not Implemented) and a request no server answered are told
 * apart from a server that failed.
 */

import type { MeasureMapsAnswer } from "@timetoalign/tilie-arranger";
import type { Server } from "@timetoalign/tilie-client";
import { ServerError } from "@timetoalign/tilie-client";

/** HTTP 501: the server has no way to expand MeasureMaps. */
const NOT_IMPLEMENTED = 501;

/**
 * HTTP 502 Bad Gateway and 504 Gateway Timeout: a proxy in front of the
 * server reached no server behind it, as the development server's proxy
 * answers while no `tilie` runs on its port.
 */
const NO_SERVER_BEHIND = new Set([502, 504]);

/**
 * The expanded MeasureMaps of a manifest's text, asked of `server`;
 * `unsupported` when the server answers 501, `unreachable` when no server
 * answered (the request failed, or a proxy answered 502 or 504), a
 * rejection for every other failure.
 */
export function measureMapsOf(
  server: Pick<Server, "measureMaps">,
): (manifest: string) => Promise<MeasureMapsAnswer> {
  return (manifest) =>
    server.measureMaps(manifest).catch((error: unknown) => {
      if (!(error instanceof ServerError)) throw error;
      if (error.status === NOT_IMPLEMENTED) return "unsupported" as const;
      if (error.code === "unreachable" || NO_SERVER_BEHIND.has(error.status ?? 0)) {
        return "unreachable" as const;
      }
      throw error;
    });
}
