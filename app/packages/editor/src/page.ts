/**
 * What the standalone page does with its document that an embedded editor
 * never does.
 */

/**
 * Take the run's token from the fragment `tilie` opens the page with
 * (`/#token=…`) and remove it from the address bar and the history entry;
 * the empty string when the fragment holds none. The fragment never
 * reaches the server, so the token stays out of its logs.
 */
export function takeToken(): string {
  const token = new URLSearchParams(location.hash.slice(1)).get("token");
  if (token === null) {
    return "";
  }
  history.replaceState(history.state, "", `${location.pathname}${location.search}`);
  return token;
}
