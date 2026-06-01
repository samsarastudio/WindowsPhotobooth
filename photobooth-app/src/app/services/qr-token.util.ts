/** Normalize scanned QR payload to uppercase token string. */
export function normalizeQrToken(raw: string): string {
  return raw.trim().toUpperCase();
}

/** Offline format check: prefix + alphanumeric suffix (e.g. KIA-PHOTO-X82JKD91). */
export function matchesQrTokenFormat(token: string, prefix: string): boolean {
  const p = prefix.trim().toUpperCase();
  if (!p || !token.startsWith(p)) return false;
  const suffix = token.slice(p.length);
  return /^[A-Z0-9-]{4,40}$/.test(suffix);
}
