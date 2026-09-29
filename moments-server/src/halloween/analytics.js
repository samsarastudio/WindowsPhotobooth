import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

const MAX_EVENTS = 8000;
const SESSION_MS = 30 * 60 * 1000;

function analyticsPath() {
  return path.join(config.dataDir, 'halloween-analytics.json');
}

function emptyStore() {
  return { version: 1, events: [] };
}

function loadStore() {
  try {
    const raw = fs.readFileSync(analyticsPath(), 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.events)) return emptyStore();
    return { version: 1, events: parsed.events };
  } catch {
    return emptyStore();
  }
}

function saveStore(store) {
  fs.mkdirSync(config.dataDir, { recursive: true });
  const events = store.events.slice(-MAX_EVENTS);
  fs.writeFileSync(
    analyticsPath(),
    JSON.stringify({ version: 1, events }, null, 2),
    'utf8',
  );
}

function sanitizeToken(value, max = 64) {
  return String(value || '')
    .trim()
    .slice(0, max)
    .replace(/[^\w.\-:/@+ ]+/g, '')
    .trim();
}

function hostFromReferrer(referrer, publicHost) {
  try {
    const u = new URL(String(referrer));
    const host = u.hostname.replace(/^www\./i, '').toLowerCase();
    if (!host) return '';
    if (publicHost && host === publicHost) return '';
    return host;
  } catch {
    return '';
  }
}

export function resolveVisitSource({ utmSource, utmMedium, referrer, publicBaseUrl }) {
  const source = sanitizeToken(utmSource, 48);
  if (source) return source.toLowerCase();

  let publicHost = '';
  try {
    publicHost = new URL(String(publicBaseUrl || '')).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    publicHost = '';
  }
  const refHost = hostFromReferrer(referrer, publicHost);
  if (refHost) return refHost;
  if (sanitizeToken(utmMedium, 32)) return sanitizeToken(utmMedium, 32).toLowerCase();
  return 'direct';
}

/**
 * Record a page visit. Dedupes rapid reloads from the same visitor (30 min).
 * Returns { ok, recorded, summary }.
 */
export function recordHalloweenVisit(payload = {}) {
  const visitorId = sanitizeToken(payload.visitorId, 80) || `anon-${Date.now()}`;
  const utmSource = sanitizeToken(payload.utmSource, 48);
  const utmMedium = sanitizeToken(payload.utmMedium, 32);
  const utmCampaign = sanitizeToken(payload.utmCampaign, 64);
  const referrer = String(payload.referrer || '').trim().slice(0, 300);
  const landing = String(payload.landing || '/halloween').trim().slice(0, 300);
  const source = resolveVisitSource({
    utmSource,
    utmMedium,
    referrer,
    publicBaseUrl: config.publicBaseUrl,
  });

  const now = Date.now();
  const store = loadStore();
  const recent = store.events
    .filter((e) => e.type === 'visit' && e.visitorId === visitorId)
    .sort((a, b) => (a.ts < b.ts ? 1 : -1))[0];
  if (recent && now - Date.parse(recent.ts) < SESSION_MS) {
    return { ok: true, recorded: false, summary: summarizeHalloweenAnalytics(store) };
  }

  store.events.push({
    type: 'visit',
    ts: new Date(now).toISOString(),
    visitorId,
    source,
    utmSource: utmSource || null,
    utmMedium: utmMedium || null,
    utmCampaign: utmCampaign || null,
    referrer: referrer || null,
    landing: landing || '/halloween',
  });
  saveStore(store);
  return { ok: true, recorded: true, summary: summarizeHalloweenAnalytics(store) };
}

export function summarizeHalloweenAnalytics(storeInput) {
  const store = storeInput || loadStore();
  const visits = store.events.filter((e) => e.type === 'visit');
  const visitors = new Set(visits.map((e) => e.visitorId));
  /** @type {Record<string, { visits: number, uniqueVisitors: number, _ids: Set<string> }>} */
  const bySourceMap = {};
  for (const e of visits) {
    const key = e.source || 'direct';
    if (!bySourceMap[key]) {
      bySourceMap[key] = { visits: 0, uniqueVisitors: 0, _ids: new Set() };
    }
    bySourceMap[key].visits += 1;
    bySourceMap[key]._ids.add(e.visitorId);
  }
  const bySource = Object.entries(bySourceMap)
    .map(([source, row]) => ({
      source,
      visits: row.visits,
      uniqueVisitors: row._ids.size,
    }))
    .sort((a, b) => b.visits - a.visits || a.source.localeCompare(b.source));

  const recent = [...visits]
    .sort((a, b) => (a.ts < b.ts ? 1 : -1))
    .slice(0, 25)
    .map((e) => ({
      ts: e.ts,
      source: e.source,
      utmSource: e.utmSource,
      utmCampaign: e.utmCampaign,
      referrer: e.referrer,
      visitorId: `${String(e.visitorId).slice(0, 8)}…`,
    }));

  return {
    totalVisits: visits.length,
    uniqueVisitors: visitors.size,
    bySource,
    recent,
  };
}

export function getHalloweenAnalytics() {
  return summarizeHalloweenAnalytics();
}

export function resetHalloweenAnalytics() {
  saveStore(emptyStore());
  return summarizeHalloweenAnalytics();
}
