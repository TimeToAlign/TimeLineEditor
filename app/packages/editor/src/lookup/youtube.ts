/**
 * YouTube, asked from the browser through its oEmbed endpoint: a video's
 * title, channel and thumbnail. YouTube offers no search without a key, so
 * a video is only resolved, and a video oEmbed does not describe (private,
 * removed) resolves to nothing.
 */

import { recognize } from "@timetoalign/timetoshare";
import {
  answerOf,
  type Candidate,
  type LookupContext,
  LookupError,
  textOf,
  urlWith,
} from "./kinds.ts";

/** The oEmbed endpoint, also the `service` of every YouTube candidate. */
export const YOUTUBE_SERVICE = "https://www.youtube.com/oembed";

/** The oEmbed URL of a video. */
export function oembedUrl(video: string): string {
  return urlWith(YOUTUBE_SERVICE, [
    ["url", video],
    ["format", "json"],
  ]);
}

/**
 * The video an IRI names: its title as the label, its channel as the
 * description, its thumbnail. `null` for an IRI of no YouTube video and
 * for any failed oEmbed request.
 */
export async function resolveYoutube(
  context: LookupContext,
  iri: string,
  signal?: AbortSignal,
): Promise<Candidate | null> {
  const recognition = recognize(context.catalogue, iri);
  if (recognition?.system !== "youtube" || recognition.iri === null) return null;
  let body: unknown;
  try {
    body = await answerOf(
      "youtube",
      context.fetch,
      oembedUrl(recognition.iri),
      signal === undefined ? {} : { signal },
    );
  } catch (cause) {
    if (cause instanceof LookupError) return null;
    throw cause;
  }
  const label = textOf(body, "title");
  if (label === undefined) return null;
  return {
    system: "youtube",
    iri: recognition.iri,
    label,
    description: textOf(body, "author_name") ?? null,
    image: textOf(body, "thumbnail_url") ?? null,
    crossReferences: [],
    service: YOUTUBE_SERVICE,
    match: false,
  };
}
