/**
 * Where the dashboard gets the API base URL and admin key.
 *
 * This is a LOCAL admin tool for whoever already holds the project's admin key - the same trust model as the CLI
 * or `curl -H "authorization: Bearer $MATRIX_EYE_API_KEY"` - not a hosted, multi-tenant login system (that is
 * Phase 4 M3, not built yet; see memory.md). The key is kept in this browser's localStorage only, is never sent
 * anywhere but the API origin the person typed in, and this app must not be deployed publicly with a key baked in.
 */

const KEY_STORAGE = "matrix-eye-dashboard:api-key";
const URL_STORAGE = "matrix-eye-dashboard:base-url";

export interface Connection {
  baseUrl: string;
  apiKey: string;
}

export function loadConnection(): Connection | null {
  try {
    const baseUrl = localStorage.getItem(URL_STORAGE);
    const apiKey = localStorage.getItem(KEY_STORAGE);
    return baseUrl && apiKey ? { baseUrl, apiKey } : null;
  } catch {
    return null; // private browsing / storage blocked: the person just has to re-enter it each visit
  }
}

export function saveConnection(connection: Connection): void {
  try {
    localStorage.setItem(URL_STORAGE, connection.baseUrl);
    localStorage.setItem(KEY_STORAGE, connection.apiKey);
  } catch {
    /* nothing persists; the app still works for this tab */
  }
}

export function clearConnection(): void {
  try {
    localStorage.removeItem(URL_STORAGE);
    localStorage.removeItem(KEY_STORAGE);
  } catch {
    /* already gone as far as this tab is concerned */
  }
}
