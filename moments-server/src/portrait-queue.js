export function initPortraitQueue(db) {
  if (!db.prepare('PRAGMA table_info(portrait_jobs)').all().some(c => c.name === 'queue_order')) {
    db.exec('ALTER TABLE portrait_jobs ADD COLUMN queue_order INTEGER');
  }
  db.exec('UPDATE portrait_jobs SET queue_order=rowid WHERE queue_order IS NULL');
}
export function nextPortraitOrder(db) {
  return db.prepare('SELECT COALESCE(MAX(queue_order),0)+1 AS n FROM portrait_jobs').get().n;
}
export function portraitQueuePosition(db, job) {
  if (!job || !['queued','running'].includes(job.status)) return null;
  if (job.status === 'running') return 1;
  return db.prepare("SELECT count(*) AS n FROM portrait_jobs WHERE status='running' OR (status='queued' AND queue_order<=?)").get(job.queue_order).n;
}
export function claimNextPortrait(db) {
  return db.transaction(() => {
    if (db.prepare("SELECT 1 FROM portrait_jobs WHERE status='running' LIMIT 1").get()) return null;
    const job = db.prepare("SELECT * FROM portrait_jobs WHERE status='queued' ORDER BY queue_order, rowid LIMIT 1").get();
    if (job) db.prepare("UPDATE portrait_jobs SET status='running' WHERE id=? AND status='queued'").run(job.id);
    return job;
  }).immediate();
}
