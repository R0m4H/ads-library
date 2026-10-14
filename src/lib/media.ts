/**
 * Facebook/Meta image and video links are signed and time-limited: the `oe=` part of the address is the
 * moment (a hex Unix timestamp, in seconds) after which Facebook stops serving the file. We save the link,
 * not the file, so older ads end up pointing at a dead address.
 */
export function isExpiredSignedUrl(url: string | null | undefined, nowMs: number = Date.now()): boolean {
  if (!url) return false;
  const match = url.match(/[?&]oe=([0-9A-Fa-f]+)/);
  if (!match) return false;
  const expiresAtSeconds = parseInt(match[1], 16);
  return Number.isFinite(expiresAtSeconds) && expiresAtSeconds * 1000 < nowMs;
}
