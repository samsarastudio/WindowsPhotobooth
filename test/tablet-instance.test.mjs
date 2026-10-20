import test from 'node:test';
import assert from 'node:assert/strict';
import { latestTabletInstance } from '../src/tablet-instance.js';
const now = new Date(2026, 9, 19, 12);
const row = (slug, activity, extra = {}) => ({slug, title: slug, created_at: '2026-10-19T08:00:00', last_activity: activity, expires_at: '2026-10-21T00:00:00', ...extra});
test('latest activity selects today’s event, ignoring expired and past albums', () => {
 const selected = latestTabletInstance([
  row('older-2026-10-18', '2026-10-19T11:59:00'),
  row('expired-2026-10-19', '2026-10-19T11:58:00', {expires_at:'2026-10-19T09:00:00'}),
  row('event-a-2026-10-19', '2026-10-19T10:00:00'),
  row('event-b-2026-10-19', '2026-10-19T11:00:00'),
 ], 'https://moments.inmomentservices.com/', now);
 assert.equal(selected.url, 'https://moments.inmomentservices.com/tablet/event-b');
});
test('no eligible album produces an empty state', () => {
 assert.equal(latestTabletInstance([], 'https://example.com', now), null);
 assert.equal(latestTabletInstance([row('old-2026-10-18', '')], 'https://example.com', now), null);
});
test('new daily album can be opened before its first photo', () => {
 assert.equal(latestTabletInstance([row('new-2026-10-19', null)], 'https://example.com', now).eventPrefix, 'new');
});
