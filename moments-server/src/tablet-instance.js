// Match the tablet feed's server-local daily album convention.
export function latestTabletInstance(rows, baseUrl, date = new Date()) {
  const today = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const suffix = `-${today}`;
  const candidates = rows.filter((row) => row.slug?.endsWith(suffix) &&
    row.slug.length > suffix.length && (!row.expires_at || new Date(row.expires_at) > date));
  candidates.sort((a, b) => String(b.last_activity || b.created_at).localeCompare(String(a.last_activity || a.created_at)) || a.slug.localeCompare(b.slug));
  const row = candidates[0];
  if (!row) return null;
  const prefix = row.slug.slice(0, -suffix.length);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(prefix)) return null;
  return { title: row.title, slug: row.slug, eventPrefix: prefix,
    lastActivity: row.last_activity || row.created_at,
    url: `${baseUrl.replace(/\/$/, '')}/tablet/${encodeURIComponent(prefix)}` };
}
