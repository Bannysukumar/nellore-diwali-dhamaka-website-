/**
 * Every deploy replaces the hashed JS/CSS files. A tab opened before the deploy
 * still points at the old names, so its next lazy page load 404s. Reloading
 * fetches the new index.html and with it the current file names.
 */

const RELOADED_AT_KEY = "dd:stale-build-reload-at";
/** A second failure this soon after reloading is a real outage, not a stale tab. */
const RELOAD_GUARD_MS = 20_000;

const STALE_BUILD_PATTERN =
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|Loading (CSS )?chunk .* failed/i;

export function isStaleBuildError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  return STALE_BUILD_PATTERN.test(message);
}

/** Reloads the page once; returns false when it already tried moments ago. */
export function reloadForNewBuild(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOADED_AT_KEY) ?? 0);
    if (Date.now() - last < RELOAD_GUARD_MS) return false;
    sessionStorage.setItem(RELOADED_AT_KEY, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}
