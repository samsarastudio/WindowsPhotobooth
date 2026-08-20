import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { nanoid } from 'nanoid';
import { config } from '../config.js';
import { getDb } from '../db.js';
import {
  ensureQrDirs,
  getActiveTemplateId,
  newQrCodeValue,
  previewUrlForCode,
  templateFilePath,
} from './store.js';

/** A3 / A4 portrait in points (72 dpi). */
const PAPER = {
  a3: { w: 841.89, h: 1190.55 },
  a4: { w: 595.28, h: 841.89 },
};

const INSTAGRAM_HANDLE = '@_in_moment_photography_';
const BRAND = 'inmoment';
const GREEN = '#2f5d3a';
const GREEN_SOFT = '#5a7a5e';
const GOLD = '#c4a35a';
const IVORY = '#f7f3ea';
const MUTED = '#6b7468';

function pickGrid(pageW, pageH, margin, gap, minCard) {
  let best = { cols: 2, rows: 2, cardW: minCard, cardH: minCard * 1.25 };
  for (let cols = 2; cols <= 6; cols++) {
    for (let rows = 2; rows <= 8; rows++) {
      const cardW = (pageW - margin * 2 - gap * (cols - 1)) / cols;
      const cardH = (pageH - margin * 2 - gap * (rows - 1)) / rows;
      if (cardW < minCard || cardH < minCard * 1.05) continue;
      const perPage = cols * rows;
      const curPer = best.cols * best.rows;
      if (perPage > curPer || (perPage === curPer && cardW > best.cardW)) {
        best = { cols, rows, cardW, cardH };
      }
    }
  }
  return best;
}

/** Same cols×rows as density pick, but laid out with tighter page padding (larger cards). */
function layoutGrid(pageW, pageH, cols, rows, margin, gap) {
  const cardW = (pageW - margin * 2 - gap * (cols - 1)) / cols;
  const cardH = (pageH - margin * 2 - gap * (rows - 1)) / rows;
  return { cols, rows, cardW, cardH };
}

/** Density params choose how many cards/page; layout params only resize them. */
function gridForPaper(paper, paperSize) {
  const densityMargin = 28;
  const densityGap = 10;
  const layoutMargin = 12;
  const layoutGap = 4;
  const minCard = paperSize === 'a3' ? 150 : 120;
  const picked = pickGrid(paper.w, paper.h, densityMargin, densityGap, minCard);
  return {
    ...layoutGrid(paper.w, paper.h, picked.cols, picked.rows, layoutMargin, layoutGap),
    margin: layoutMargin,
    gap: layoutGap,
  };
}

/** Simple Instagram glyph (rounded square + circle + dot). */
function drawInstagramIcon(doc, x, y, size) {
  const r = size * 0.22;
  doc.save();
  doc.lineWidth(Math.max(0.7, size * 0.08)).strokeColor(GREEN);
  doc.roundedRect(x, y, size, size, r).stroke();
  const cx = x + size / 2;
  const cy = y + size / 2;
  doc.circle(cx, cy, size * 0.22).stroke();
  doc.circle(x + size * 0.72, y + size * 0.28, size * 0.055).fill(GREEN);
  doc.restore();
}

/** Tiny leaf sprig (photobooth botanical accent). */
function drawLeafSprig(doc, cx, cy, scale, angleDeg, color) {
  doc.save();
  doc.translate(cx, cy);
  doc.rotate(angleDeg);
  doc.fillColor(color);
  const leaf = (ox, oy, w, h, rot) => {
    doc.save();
    doc.translate(ox, oy);
    doc.rotate(rot);
    doc.moveTo(0, 0);
    doc.bezierCurveTo(w * 0.35, -h, w, -h * 0.15, w * 1.05, 0);
    doc.bezierCurveTo(w, h * 0.15, w * 0.35, h, 0, 0);
    doc.fill();
    doc.restore();
  };
  leaf(0, 0, 7 * scale, 3.2 * scale, -18);
  leaf(2 * scale, -1.5 * scale, 5.5 * scale, 2.6 * scale, 28);
  leaf(1.5 * scale, 1.2 * scale, 5 * scale, 2.4 * scale, -50);
  doc
    .strokeColor(color)
    .lineWidth(0.6 * scale)
    .moveTo(0, 0)
    .lineTo(8 * scale, 0)
    .stroke();
  doc.restore();
}

/**
 * Photobooth-style card: ivory, green/gold border, corner sprigs, soft QR well.
 * Brand / IG / serial are drawn by the caller so custom uploads stay clean.
 */
function drawBrandedCard(doc, x, y, w, h) {
  doc.save();
  doc.roundedRect(x, y, w, h, 7).fill(IVORY);
  doc.roundedRect(x + 2.2, y + 2.2, w - 4.4, h - 4.4, 6).lineWidth(1.5).strokeColor(GREEN).stroke();
  doc.roundedRect(x + 5.2, y + 5.2, w - 10.4, h - 10.4, 4.5).lineWidth(0.65).strokeColor(GOLD).stroke();

  const s = Math.min(w, h) / 140;
  const inset = 11;
  drawLeafSprig(doc, x + inset + 2, y + inset + 2, s, 35, GREEN_SOFT);
  drawLeafSprig(doc, x + w - inset - 2, y + inset + 2, s, 145, GREEN_SOFT);
  drawLeafSprig(doc, x + inset + 2, y + h - inset - 2, s, -35, GREEN_SOFT);
  drawLeafSprig(doc, x + w - inset - 2, y + h - inset - 2, s, -145, GREEN_SOFT);
  doc.restore();
}

/**
 * @param {{ batchId: string, paperSize?: 'a3'|'a4' }} opts
 */
export async function generateBatchPdf(opts) {
  ensureQrDirs();
  const db = getDb();
  const batch = db.prepare('SELECT * FROM qr_batches WHERE id = ?').get(opts.batchId);
  if (!batch) throw new Error('Batch not found');

  const paperSize = (opts.paperSize || batch.paper_size || 'a4').toLowerCase();
  const paper = PAPER[paperSize] || PAPER.a4;
  const codes = db
    .prepare(`SELECT * FROM qr_codes WHERE batch_id = ? ORDER BY serial ASC`)
    .all(batch.id);
  if (!codes.length) throw new Error('No codes in batch');

  const templateId = batch.template_id || getActiveTemplateId();
  const template = templateId
    ? db.prepare('SELECT * FROM qr_templates WHERE id = ?').get(templateId)
    : null;
  const framePath = template ? templateFilePath(template) : null;
  // Custom uploads only — builtin is drawn in vector so brand/IG stay crisp and never double-print.
  const useCustomRaster =
    template?.source === 'upload' &&
    framePath &&
    fs.existsSync(framePath) &&
    /\.(png|jpe?g|webp)$/i.test(framePath);

  const grid = gridForPaper(paper, paperSize);
  const margin = grid.margin;
  const gap = grid.gap;
  const perPage = grid.cols * grid.rows;
  const pages = Math.ceil(codes.length / perPage);

  const pdfName = `${batch.id}-${paperSize}.pdf`;
  const outPath = path.join(config.qrPdfsDir, pdfName);

  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: [paper.w, paper.h],
      margin: 0,
      info: { Title: `${batch.name} QR cards`, Author: 'inmoment' },
    });
    const stream = fs.createWriteStream(outPath);
    doc.pipe(stream);
    stream.on('finish', resolve);
    stream.on('error', reject);
    doc.on('error', reject);

    (async () => {
      try {
        for (let page = 0; page < pages; page++) {
          if (page > 0) doc.addPage({ size: [paper.w, paper.h], margin: 0 });
          const slice = codes.slice(page * perPage, page * perPage + perPage);
          for (let i = 0; i < slice.length; i++) {
            const col = i % grid.cols;
            const row = Math.floor(i / grid.cols);
            const x = margin + col * (grid.cardW + gap);
            const y = margin + row * (grid.cardH + gap);
            const w = grid.cardW;
            const h = grid.cardH;
            const card = slice[i];
            const url = previewUrlForCode(card.code);

            if (useCustomRaster) {
              try {
                doc.image(framePath, x, y, { width: w, height: h });
              } catch {
                drawBrandedCard(doc, x, y, w, h);
              }
            } else {
              drawBrandedCard(doc, x, y, w, h);
            }

            // Brand once (skip when custom frame may already include brand art)
            if (!useCustomRaster) {
              doc
                .font('Times-Bold')
                .fontSize(Math.max(9, w * 0.078))
                .fillColor(GREEN)
                .text(BRAND, x + 8, y + h * 0.055, {
                  width: w - 16,
                  align: 'center',
                  characterSpacing: 2.4,
                });
            }

            // QR sits in a soft well (thin gold rim, not a heavy white box)
            const qrSize = Math.min(w, h) * (useCustomRaster ? 0.42 : 0.46);
            const qrX = x + (w - qrSize) / 2;
            const qrY = y + h * (useCustomRaster ? 0.28 : 0.24);
            const qrBuf = await QRCode.toBuffer(url, {
              type: 'png',
              width: Math.round(qrSize * 2.5),
              margin: 1,
              errorCorrectionLevel: 'M',
            });
            const pad = 4;
            doc
              .roundedRect(qrX - pad, qrY - pad, qrSize + pad * 2, qrSize + pad * 2, 3)
              .fill('#ffffff');
            doc
              .roundedRect(qrX - pad, qrY - pad, qrSize + pad * 2, qrSize + pad * 2, 3)
              .lineWidth(0.55)
              .strokeColor(GOLD)
              .stroke();
            doc.image(qrBuf, qrX, qrY, { width: qrSize, height: qrSize });

            if (!useCustomRaster) {
              const igSize = Math.max(8.5, w * 0.065);
              const handleSize = Math.max(6.2, w * 0.045);
              doc.font('Helvetica').fontSize(handleSize);
              const handleW = doc.widthOfString(INSTAGRAM_HANDLE);
              const rowW = igSize + 3.5 + handleW;
              const igX = x + (w - rowW) / 2;
              const igY = y + h * 0.775;
              drawInstagramIcon(doc, igX, igY, igSize);
              doc
                .fillColor(MUTED)
                .text(INSTAGRAM_HANDLE, igX + igSize + 3.5, igY + igSize * 0.18, {
                  lineBreak: false,
                });
            }

            const serial = `#${String(card.serial).padStart(3, '0')} / ${batch.quantity}`;
            doc
              .font('Helvetica')
              .fontSize(Math.max(6.2, w * 0.04))
              .fillColor(MUTED)
              .text(serial, x + 6, y + h - 15, {
                width: w - 12,
                align: 'center',
              });
          }
        }
        doc.end();
      } catch (e) {
        reject(e);
      }
    })();
  });

  db.prepare(
    `UPDATE qr_batches SET pdf_filename = ?, paper_size = ?, template_id = COALESCE(?, template_id) WHERE id = ?`,
  ).run(pdfName, paperSize, templateId, batch.id);

  return { pdfFilename: pdfName, pdfPath: outPath, pages, perPage, paperSize };
}

export function createBatchRecord({ name, eventLabel, quantity, paperSize, notes, templateId }) {
  const db = getDb();
  const id = nanoid(12);
  const now = new Date().toISOString();
  const qty = Math.min(500, Math.max(1, Math.floor(Number(quantity) || 0)));
  if (!qty) throw new Error('quantity required');
  if (!String(name || '').trim()) throw new Error('name required');
  const paper = paperSize === 'a3' ? 'a3' : 'a4';
  const tpl = templateId || getActiveTemplateId();

  db.prepare(
    `INSERT INTO qr_batches (
      id, name, event_label, quantity, status, paper_size, template_id, notes,
      featured, created_at, activated_at, pdf_filename, session_epoch
    ) VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, 0, ?, NULL, NULL, 1)`,
  ).run(
    id,
    String(name).trim(),
    String(eventLabel || '').trim() || null,
    qty,
    paper,
    tpl,
    String(notes || '').trim() || null,
    now,
  );

  const insert = db.prepare(
    `INSERT INTO qr_codes (
      id, batch_id, code, serial, status, created_at, scanned_at, session_epoch,
      attached_photo_id, attached_at
    ) VALUES (?, ?, ?, ?, 'unused', ?, NULL, 1, NULL, NULL)`,
  );
  const tx = db.transaction(() => {
    for (let serial = 1; serial <= qty; serial++) {
      insert.run(nanoid(12), id, newQrCodeValue(), serial, now);
    }
  });
  tx();

  return db.prepare('SELECT * FROM qr_batches WHERE id = ?').get(id);
}

export function pagesEstimate(quantity, paperSize) {
  const paper = PAPER[paperSize === 'a3' ? 'a3' : 'a4'];
  const grid = gridForPaper(paper, paperSize === 'a3' ? 'a3' : 'a4');
  const perPage = grid.cols * grid.rows;
  const qty = Math.max(1, Number(quantity) || 1);
  return {
    pages: Math.ceil(qty / perPage),
    perPage,
    cols: grid.cols,
    rows: grid.rows,
  };
}
