/**
 * Poll Moments for approved tablet print jobs and run local print:photo.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

function galleryBaseUrl(raw) {
  return String(raw || '')
    .trim()
    .replace(/\/$/, '');
}

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, opts);
  let data = null;
  try {
    data = await res.json();
  } catch (_) {}
  return { res, data };
}

async function downloadToTemp(mediaUrl, tmpDir) {
  fs.mkdirSync(tmpDir, { recursive: true });
  const ext = path.extname(new URL(mediaUrl).pathname) || '.jpg';
  const dest = path.join(tmpDir, `print-job-${Date.now()}${ext}`);
  const res = await fetch(mediaUrl);
  if (!res.ok) throw new Error(`Download HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  return dest;
}

function createPrintJobPoller({
  loadMergedConfig,
  printPhotoFn,
  appendAppLog,
  getPortableRoot,
}) {
  let timer = null;
  let running = false;

  async function pollOnce() {
    if (running) return;
    const cfg = loadMergedConfig();
    const g = cfg.gallery || {};
    const flow = cfg.guestFlow || {};
    const printCfg = cfg.print || {};
    const base = galleryBaseUrl(g.apiBaseUrl);
    const token = String(g.uploadToken || '').trim();
    if (!base || !token) return;
    if (!(printCfg.enabled === true || printCfg.enabled === 'true')) return;
    // Only poll when gallery is enabled (Moments linked).
    if (g.enabled !== true && g.enabled !== 'true') return;

    running = true;
    try {
      const boothId = String(flow.boothId || cfg.boothId || 'booth-1').trim() || 'booth-1';
      const listUrl = `${base}/api/booth/print-jobs?boothId=${encodeURIComponent(boothId)}&limit=2`;
      const { res, data } = await fetchJson(listUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok || !data?.ok || !Array.isArray(data.jobs) || !data.jobs.length) return;

      const tmpDir = path.join(getPortableRoot(), 'data', 'print-jobs');
      for (const job of data.jobs) {
        let tmpPath = null;
        try {
          if (!job.mediaUrl) throw new Error('Job missing mediaUrl');
          tmpPath = await downloadToTemp(job.mediaUrl, tmpDir);
          const printRes = await printPhotoFn({
            filePath: tmpPath,
            layoutMode: job.layoutMode || undefined,
          });
          await fetchJson(`${base}/api/booth/print-jobs/${encodeURIComponent(job.id)}/ack`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              status: printRes?.ok ? 'done' : 'error',
              error: printRes?.ok ? undefined : printRes?.error || 'Print failed',
            }),
          });
          appendAppLog('info', 'print-jobs', printRes?.ok ? 'remote print ok' : 'remote print failed', {
            jobId: job.id,
            error: printRes?.error,
          });
        } catch (e) {
          appendAppLog('error', 'print-jobs', 'job failed', { jobId: job?.id, error: String(e) });
          try {
            await fetchJson(`${base}/api/booth/print-jobs/${encodeURIComponent(job.id)}/ack`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ status: 'error', error: String(e) }),
            });
          } catch (_) {}
        } finally {
          if (tmpPath) {
            try {
              fs.unlinkSync(tmpPath);
            } catch (_) {}
          }
        }
      }
    } finally {
      running = false;
    }
  }

  function start() {
    if (timer) return;
    timer = setInterval(() => {
      void pollOnce();
    }, 5000);
    void pollOnce();
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { start, stop, pollOnce };
}

module.exports = { createPrintJobPoller };
