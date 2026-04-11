/**
 * Browser session identifier for same-user multi-browser sync.
 *
 * Each browser tab/session generates its own UUID on first access.
 * The ID is sent on every API request via the X-Client-Id header and
 * echoed back in realtime broadcast payloads. The realtime manager
 * uses it to distinguish self-echoes (same tab) from remote updates
 * by the same user on a different tab/device.
 *
 * In-memory only — a page reload generates a fresh ID. This keeps
 * things simple and avoids stale-ID issues.
 */

let clientId: string | null = null;

export function getClientId(): string {
  if (!clientId) {
    clientId = crypto.randomUUID();
  }
  return clientId;
}
