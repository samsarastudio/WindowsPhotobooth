/** @typedef {{ write: Function, end: Function }} SseClient */

/** @type {Map<string, Set<SseClient>>} */
const clientsBySlug = new Map();

export function subscribeSession(slug, res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  res.write(`event: ready\ndata: ${JSON.stringify({ slug })}\n\n`);

  let set = clientsBySlug.get(slug);
  if (!set) {
    set = new Set();
    clientsBySlug.set(slug, set);
  }
  set.add(res);

  const heartbeat = setInterval(() => {
    try {
      res.write(`: ping\n\n`);
    } catch {
      /* closed */
    }
  }, 25000);

  const cleanup = () => {
    clearInterval(heartbeat);
    set.delete(res);
    if (set.size === 0) clientsBySlug.delete(slug);
  };
  res.on('close', cleanup);
  res.on('error', cleanup);
}

export function broadcastPhotoAdded(slug, photo) {
  const set = clientsBySlug.get(slug);
  if (!set || set.size === 0) return;
  const payload = `event: photo.added\ndata: ${JSON.stringify(photo)}\n\n`;
  for (const client of [...set]) {
    try {
      client.write(payload);
    } catch {
      set.delete(client);
    }
  }
}
