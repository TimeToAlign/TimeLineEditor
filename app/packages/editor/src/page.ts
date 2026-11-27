/**
 * What the standalone page does with its document that an embedded editor
 * never does.
 */

/** The key under which the tab's session storage keeps the run's token across a reload. */
export const TOKEN_KEY = "tilie.token";

/**
 * Take the run's token from the fragment `tilie` opens the page with
 * (`/#token=…`), remove it from the address bar and the history entry and
 * keep it in the tab's session storage under `TOKEN_KEY`, so that a reload
 * of the tab, whose address no longer holds it, is still connected; without
 * a fragment token, the token kept there, else the empty string. The
 * fragment never reaches the server, so the token stays out of its logs;
 * session storage belongs to the tab alone and is cleared when the tab is
 * closed. A storage that throws keeps nothing: the token then lasts until
 * the page is left.
 */
export function takeToken(): string {
  const token = new URLSearchParams(location.hash.slice(1)).get("token");
  if (token === null) {
    try {
      return sessionStorage.getItem(TOKEN_KEY) ?? "";
    } catch {
      return "";
    }
  }
  history.replaceState(history.state, "", `${location.pathname}${location.search}`);
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    // The token is used for this page all the same.
  }
  return token;
}
