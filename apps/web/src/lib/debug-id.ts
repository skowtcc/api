// per-browser stable identifier sent on every outbound request as `x-debug-id`
/*
 * purpose: when a user reports "this is taking forever" or "this errored", they
 * can copy their debug ID from settings and support can search Better Stack by
 * `debug_id = <value>` to find every log + trace from that browser. works for
 * both authenticated and anonymous users. for authed users `user_id` is also
 * stamped, but debug_id is the universal handle
 */
/*
 * persistence: localStorage. survives reloads, tab close, and re-auth. cleared
 * only by the browser's storage clear or explicit user action. new ID is minted
 * on first call when storage is empty
 */
/*
 * SSR-safe: returns undefined when window is unavailable (TanStack Start can
 * import this module during server render). the header injection points
 * downstream skip the header in that case, which is fine: the server side
 * generates its own request_id for those
 */

const STORAGE_KEY = "skowt:debug-id";

export function getDebugId(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    window.localStorage.setItem(STORAGE_KEY, fresh);
    return fresh;
  } catch {
    /*
     * localStorage can throw under Safari private mode or storage quota.
     * return undefined rather than crash. the user just loses correlation
     * ability for this session, not the app itself
     */
    return undefined;
  }
}
