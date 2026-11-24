import express from "express";
import QRCode from "qrcode";
import { captureDate } from "./capture-date.js";
import { watermark, embedUrl } from "./media-tools.js";
import Database from "better-sqlite3";
import multer from "multer";
import sharp from "sharp";
import archiver from "archiver";
import nodemailer from "nodemailer";
import crypto from "node:crypto";
import fs from "node:fs";
import { Readable } from "node:stream";
import path from "node:path";
import { fileURLToPath } from "node:url";
sharp.cache(false);

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const uid = () => crypto.randomUUID();
const hash = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");
const same = (a, b) =>
  crypto.timingSafeEqual(Buffer.from(hash(a)), Buffer.from(hash(b)));
const clean = (s, n = 200) =>
  String(s ?? "")
    .trim()
    .slice(0, n);
const email = (s) => {
  s = clean(s, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))
    throw fail(400, "Enter a valid email address");
  return s;
};
const fail = (status, message, extra = {}) =>
  Object.assign(new Error(message), { status, ...extra });
const wrap = (fn) => (req, res, next) =>
  Promise.resolve()
    .then(() => fn(req, res))
    .catch(next);
const escape = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const defaults = {
  downloadEnabled: true,
  galleryDownloadEnabled: true,
  singleDownloadEnabled: true,
  videoDownloadEnabled: true,
  downloadSizes: ["original", "2048"],
  downloadEmailRequired: true,
  downloadLimit: 0,
  allowedEmails: [],
  downloadSetIds: [],
  favoritesEnabled: true,
  favoriteNotes: true,
  slideshow: true,
  socialSharing: true,
  emailRegistration: false,
  homepageVisible: true,
};
const designDefaults = {
  coverStyle: "outline",
  palette: "light",
  typography: "timeless",
  layout: "vertical",
  spacing: "regular",
  thumbnailSize: "regular",
  navigation: "icons",
  focalX: 50,
  focalY: 50,
};
function secretHash(value) {
  const salt = crypto.randomBytes(16).toString("hex");
  return salt + ":" + crypto.scryptSync(value, salt, 32).toString("hex");
}
function checkSecret(value, stored) {
  if (!stored) return false;
  const [salt, digest] = stored.split(":");
  return same(
    crypto.scryptSync(String(value), salt, 32).toString("hex"),
    digest,
  );
}
const parse = (s) => JSON.parse(s || "{}");

export function createClientApp(options = {}) {
  const data = path.resolve(
    options.dataDir ||
      process.env.CLIENT_DATA_DIR ||
      path.join(root, "client-data"),
  );
  const password =
    options.adminPassword || process.env.CLIENT_ADMIN_PASSWORD || "";
  const secret =
    options.sessionSecret || process.env.CLIENT_SESSION_SECRET || "";
  if (password.length < 12 || secret.length < 32)
    throw Error(
      "CLIENT_ADMIN_PASSWORD (12+ characters) and CLIENT_SESSION_SECRET (32+) are required",
    );
  const base = (
    options.baseUrl ||
    process.env.CLIENT_PUBLIC_URL ||
    "https://client.inmomentservices.com"
  ).replace(/\/$/, "");
  const secure =
    options.secureCookies ??
    (process.env.CLIENT_SECURE_COOKIES !== "false" &&
      base.startsWith("https:"));
  for (const dir of ["originals", "previews", "tmp", "assets"])
    fs.mkdirSync(path.join(data, dir), { recursive: true });
  const db = new Database(path.join(data, "client.sqlite"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`CREATE TABLE IF NOT EXISTS collections(id TEXT PRIMARY KEY,slug TEXT UNIQUE NOT NULL,title TEXT NOT NULL,date TEXT,description TEXT DEFAULT '',status TEXT DEFAULT 'draft',tags TEXT DEFAULT '[]',starred INTEGER DEFAULT 0,deletedAt INTEGER,coverId TEXT,settings TEXT NOT NULL,design TEXT NOT NULL,createdAt INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS sets(id TEXT PRIMARY KEY,collectionId TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,name TEXT NOT NULL,description TEXT DEFAULT '',position REAL DEFAULT 0,private INTEGER DEFAULT 0);
 CREATE TABLE IF NOT EXISTS photos(id TEXT PRIMARY KEY,collectionId TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,setId TEXT REFERENCES sets(id) ON DELETE SET NULL,filename TEXT NOT NULL,storage TEXT NOT NULL,width INTEGER,height INTEGER,caption TEXT DEFAULT '',starred INTEGER DEFAULT 0,private INTEGER DEFAULT 0,position REAL DEFAULT 0,type TEXT DEFAULT 'image',createdAt INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY CHECK(id=1),value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS objects(id TEXT PRIMARY KEY,kind TEXT NOT NULL,value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,kind TEXT NOT NULL,subject TEXT NOT NULL,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS activity(id TEXT PRIMARY KEY,collectionId TEXT,type TEXT NOT NULL,email TEXT,detail TEXT,createdAt INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS favorites(id TEXT PRIMARY KEY,collectionId TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,owner TEXT NOT NULL,email TEXT NOT NULL,name TEXT NOT NULL,photoIds TEXT DEFAULT '[]',notes TEXT DEFAULT '{}',completed INTEGER DEFAULT 0,selectionLimit INTEGER DEFAULT 0,createdAt INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS subscriptions(collectionId TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,email TEXT NOT NULL,createdAt INTEGER NOT NULL,PRIMARY KEY(collectionId,email));
 CREATE TABLE IF NOT EXISTS download_tokens(token TEXT PRIMARY KEY,collectionId TEXT NOT NULL,payload TEXT NOT NULL,expires INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS photos_collection ON photos(collectionId,position);
 CREATE INDEX IF NOT EXISTS activity_collection ON activity(collectionId,createdAt);`);
  db.prepare("INSERT OR IGNORE INTO settings VALUES(1,?)").run(
    JSON.stringify({
      brandName: "In Moment",
      homepageEnabled: true,
      homepageTitle: "Stories worth keeping.",
      homepageDescription: "Your photographs, beautifully delivered.",
      homepageSort: "newest",
      defaultLanguage: "en",
      showFilenames: false,
      searchEngineVisible: false,
      watermarks: [],
    }),
  );
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", "loopback");
  app.use((req, res, next) => {
    res.set({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin",
      "X-Frame-Options": "DENY",
      "Content-Security-Policy":
        "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; media-src 'self' blob:; frame-src 'self' https://www.youtube-nocookie.com https://player.vimeo.com; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
    });
    if (req.path.startsWith("/api/") || req.path.startsWith("/media/"))
      res.set("Cache-Control", "no-store");
    next();
  });
  app.use(express.json({ limit: "2mb" }));
  app.use((req, res, next) => {
    req.cookies = Object.fromEntries(
      (req.headers.cookie || "")
        .split(";")
        .map((x) => x.trim().split("="))
        .filter((x) => x.length === 2),
    );
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const origin = req.headers.origin;
      if (
        req.headers["sec-fetch-site"] === "cross-site" ||
        (origin &&
          origin !== base &&
          origin !== `${req.protocol}://${req.get("host")}`)
      )
        return res.status(403).json({ error: "Cross-origin request blocked" });
    }
    next();
  });
  const cfg = () =>
    parse(db.prepare("SELECT value FROM settings WHERE id=1").get().value);
  const audit = (collectionId, type, mail = "", detail = "") =>
    db
      .prepare("INSERT INTO activity VALUES(?,?,?,?,?,?)")
      .run(
        uid(),
        collectionId || null,
        type,
        mail,
        clean(detail, 2000),
        Date.now(),
      );
  function cookie(res, name, value, maxAge = 7 * 86400000) {
    res.cookie(name, value, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge,
    });
  }
  function session(req, kind, subject) {
    const token = req.cookies["mc_" + kind];
    if (!token) return false;
    return (
      db
        .prepare(
          "SELECT subject FROM sessions WHERE token=? AND kind=? AND expires>?",
        )
        .get(hash(token + secret), kind, Date.now())?.subject ===
      (subject ?? "admin")
    );
  }
  function issue(res, kind, subject, ttl = 7 * 86400000) {
    const token = crypto.randomBytes(32).toString("base64url");
    db.prepare("INSERT INTO sessions VALUES(?,?,?,?)").run(
      hash(token + secret),
      kind,
      subject,
      Date.now() + ttl,
    );
    cookie(res, "mc_" + kind, token, ttl);
    return token;
  }
  const admin = (req, res, next) =>
    session(req, "admin")
      ? next()
      : res.status(401).json({ error: "Sign in to continue" });
  const attempts = new Map();
  function rate(req, key, limit = 10) {
    const k = (req.ip || "") + key;
    let a = attempts.get(k);
    if (!a || a.until < Date.now())
      a = { count: 0, until: Date.now() + 600000 };
    a.count++;
    attempts.set(k, a);
    if (a.count > limit)
      throw fail(429, "Too many attempts. Please try again later.");
    if (attempts.size > 10000)
      for (const [k, v] of attempts)
        if (v.until < Date.now()) attempts.delete(k);
  }
  function collection(id, bySlug = false) {
    const c = db
      .prepare(`SELECT * FROM collections WHERE ${bySlug ? "slug" : "id"}=?`)
      .get(id);
    if (!c) throw fail(404, "Collection not found");
    return {
      ...c,
      tags: parse(c.tags),
      settings: parse(c.settings),
      design: parse(c.design),
      starred: !!c.starred,
    };
  }
  function active(c) {
    return (
      !c.deletedAt &&
      c.status === "published" &&
      (!c.settings.expiry ||
        Date.parse(c.settings.expiry + "T23:59:59Z") > Date.now())
    );
  }
  function canView(req, c) {
    if (session(req, "admin")) return true;
    return (
      active(c) &&
      (!c.settings.passwordHash || session(req, "gate_" + c.id, c.id)) &&
      (!c.settings.emailRegistration ||
        session(req, "registration_" + c.id, c.id))
    );
  }
  function guard(req, c) {
    if (!active(c) && !session(req, "admin"))
      throw fail(404, "This collection is not available");
    if (
      c.settings.passwordHash &&
      !session(req, "gate_" + c.id, c.id) &&
      !session(req, "admin")
    )
      throw fail(401, "Enter the gallery password", {
        locked: true,
        title: c.title,
      });
    if (
      c.settings.emailRegistration &&
      !session(req, "registration_" + c.id, c.id) &&
      !session(req, "admin")
    )
      throw fail(403, "Register to view this gallery", {
        registrationRequired: true,
        title: c.title,
        brand: brandOut(),
      });
  }
  function photoOut(p) {
    if (p.type === "embed")
      return { ...p, storage: undefined, url: p.storage, thumbnailUrl: "" };
    return {
      ...p,
      storage: undefined,
      starred: !!p.starred,
      private: !!p.private,
      url: `/media/${p.id}`,
      thumbnailUrl: `/media/${p.id}?preview=1`,
    };
  }
  function visiblePhoto(req, p, c) {
    return (
      session(req, "admin") ||
      (!p.private &&
        (!p.setId ||
          !db.prepare("SELECT private FROM sets WHERE id=?").get(p.setId)
            ?.private)) ||
      session(req, "client_" + c.id, c.id)
    );
  }
  function safeSettings(s, publicView) {
    const out = {
      ...s,
      passwordSet: !!s.passwordHash,
      clientPasswordSet: !!s.clientPasswordHash,
      downloadPinRequired: !!s.downloadPinHash,
    };
    delete out.passwordHash;
    delete out.clientPasswordHash;
    delete out.downloadPinHash;
    if (publicView) {
      delete out.allowedEmails;
      delete out.downloadLimit;
      delete out.clientEmail;
    }
    return out;
  }
  function brandOut() {
    const b = { ...cfg() };
    delete b.homepagePasswordHash;
    delete b.smtp;
    return b;
  }
  function full(c, req, publicView = false) {
    const photos = db
      .prepare(
        "SELECT * FROM photos WHERE collectionId=? ORDER BY position,createdAt",
      )
      .all(c.id)
      .filter((p) => !publicView || visiblePhoto(req, p, c))
      .map(photoOut);
    const sets = db
      .prepare("SELECT * FROM sets WHERE collectionId=? ORDER BY position")
      .all(c.id)
      .filter(
        (s) =>
          !publicView || !s.private || session(req, "client_" + c.id, c.id),
      );
    return {
      ...c,
      settings: safeSettings(c.settings, publicView),
      photos,
      sets,
      photoCount: photos.length,
      coverId: photos.some((p) => p.id === c.coverId)
        ? c.coverId
        : photos[0]?.id,
      coverUrl:
        photos.find((p) => p.id === c.coverId)?.thumbnailUrl ||
        photos[0]?.thumbnailUrl ||
        "",
      brand: brandOut(),
    };
  }
  function saveCollection(c) {
    db.prepare(
      "UPDATE collections SET slug=?,title=?,date=?,description=?,status=?,tags=?,starred=?,deletedAt=?,coverId=?,settings=?,design=? WHERE id=?",
    ).run(
      c.slug,
      c.title,
      c.date || "",
      c.description,
      c.status,
      JSON.stringify(c.tags),
      +!!c.starred,
      c.deletedAt || null,
      c.coverId || null,
      JSON.stringify(c.settings),
      JSON.stringify(c.design),
      c.id,
    );
  }
  function sanitizeSettings(incoming, old = {}) {
    const out = { ...old };
    for (const k of [
      "downloadEnabled",
      "downloadEmailRequired",
      "favoritesEnabled",
      "favoriteNotes",
      "slideshow",
      "socialSharing",
      "emailRegistration",
      "homepageVisible",
      "watermarkDownloads",
      "galleryAssist",
      "galleryDownloadEnabled",
      "singleDownloadEnabled",
      "videoDownloadEnabled",
      "downloadLimitPerEmail",
      "autoExpiryReminder",
    ])
      if (k in incoming) out[k] = !!incoming[k];
    for (const k of ["expiry", "language", "clientEmail", "watermarkId"])
      if (k in incoming) out[k] = clean(incoming[k]);
    for (const k of ["downloadSizes", "downloadSetIds", "allowedEmails"])
      if (Array.isArray(incoming[k]))
        out[k] = incoming[k].slice(0, 200).map((x) => clean(x));
    if ("downloadLimit" in incoming)
      out.downloadLimit = Math.max(
        0,
        Math.min(100000, Number(incoming.downloadLimit) || 0),
      );
    for (const [key, stored] of [
      ["password", "passwordHash"],
      ["clientPassword", "clientPasswordHash"],
      ["downloadPin", "downloadPinHash"],
    ])
      if (key in incoming) {
        const v = clean(incoming[key]);
        out[stored] = v ? secretHash(v) : "";
      }
    return out;
  }
  function create(body) {
    const id = uid(),
      title = clean(body.title || "Untitled collection");
    let slug =
      clean(
        body.slug ||
          title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, ""),
        100,
      ) || "collection";
    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug))
      throw fail(
        400,
        "Use lowercase letters, numbers and hyphens for the link",
      );
    if (db.prepare("SELECT 1 FROM collections WHERE slug=?").get(slug))
      slug += "-" + id.slice(0, 6);
    const c = {
      id,
      slug,
      title,
      date: clean(body.date),
      description: clean(body.description, 5000),
      status: "draft",
      tags: [],
      starred: false,
      settings: sanitizeSettings(body.settings || {}, defaults),
      design: { ...designDefaults, ...body.design },
      createdAt: Date.now(),
    };
    db.prepare(
      "INSERT INTO collections(id,slug,title,date,description,status,settings,design,createdAt) VALUES(?,?,?,?,?,?,?,?,?)",
    ).run(
      id,
      slug,
      title,
      c.date,
      c.description,
      c.status,
      JSON.stringify(c.settings),
      JSON.stringify(c.design),
      c.createdAt,
    );
    db.prepare("INSERT INTO sets(id,collectionId,name) VALUES(?,?,?)").run(
      uid(),
      id,
      "Highlights",
    );
    return c;
  }
  const smtpHost = process.env.CLIENT_SMTP_HOST;
  const mailer =
    options.mailer ||
    (smtpHost
      ? nodemailer.createTransport({
          host: smtpHost,
          port: Number(process.env.CLIENT_SMTP_PORT || 587),
          secure: process.env.CLIENT_SMTP_PORT === "465",
          auth: process.env.CLIENT_SMTP_USER
            ? {
                user: process.env.CLIENT_SMTP_USER,
                pass: process.env.CLIENT_SMTP_PASS,
              }
            : undefined,
        })
      : null);
  app.get("/api/health", (req, res) =>
    res.json({ ok: true, service: "moments-client", version: 1 }),
  );
  app.post(
    "/api/admin/login",
    wrap(async (req, res) => {
      rate(req, "login");
      if (!same(req.body.password || "", password))
        throw fail(401, "Incorrect password");
      issue(res, "admin", "admin", 12 * 3600000);
      res.json({ ok: true });
    }),
  );
  app.post("/api/admin/logout", (req, res) => {
    db.prepare("DELETE FROM sessions WHERE token=?").run(
      hash((req.cookies.mc_admin || "") + secret),
    );
    cookie(res, "mc_admin", "", 0);
    res.json({ ok: true });
  });
  app.get("/api/admin/me", admin, (req, res) =>
    res.json({ ok: true, emailEnabled: !!mailer, baseUrl: base }),
  );
  app.use("/api/admin", admin);
  app.get("/api/admin/collections", (req, res) =>
    res.json(
      db
        .prepare("SELECT id FROM collections ORDER BY createdAt DESC")
        .all()
        .map((x) => {
          const c = collection(x.id);
          const photoCount = db
            .prepare("SELECT COUNT(*) AS n FROM photos WHERE collectionId=?")
            .get(c.id).n;
          const cover =
            c.coverId ||
            db
              .prepare(
                "SELECT id FROM photos WHERE collectionId=? AND type='image' ORDER BY position LIMIT 1",
              )
              .get(c.id)?.id;
          return {
            ...c,
            settings: safeSettings(c.settings, false),
            photoCount,
            coverUrl: cover ? "/media/" + cover + "?preview=1" : "",
          };
        }),
    ),
  );
  app.post(
    "/api/admin/collections",
    wrap(async (req, res) => res.status(201).json(full(create(req.body), req))),
  );
  app.get(
    "/api/admin/collections/:id",
    wrap(async (req, res) => res.json(full(collection(req.params.id), req))),
  );
  app.patch(
    "/api/admin/collections/:id",
    wrap(async (req, res) => {
      const c = collection(req.params.id),
        b = req.body;
      for (const k of ["title", "date", "description"])
        if (k in b) c[k] = clean(b[k], k === "description" ? 5000 : 200);
      if ("slug" in b) {
        if (!/^[a-z0-9][a-z0-9-]{0,99}$/.test(b.slug))
          throw fail(400, "Invalid gallery link");
        c.slug = b.slug;
      }
      if ("status" in b) {
        if (!["draft", "published", "hidden", "pre-release"].includes(b.status))
          throw fail(400, "Invalid status");
        c.status = b.status;
      }
      if (Array.isArray(b.tags))
        c.tags = b.tags.slice(0, 40).map((x) => clean(x, 80));
      if ("starred" in b) c.starred = !!b.starred;
      if ("coverId" in b) {
        if (
          b.coverId &&
          !db
            .prepare("SELECT 1 FROM photos WHERE id=? AND collectionId=?")
            .get(b.coverId, c.id)
        )
          throw fail(400, "Cover must belong to this collection");
        c.coverId = b.coverId;
      }
      if (b.settings) c.settings = sanitizeSettings(b.settings, c.settings);
      if (b.design) c.design = { ...c.design, ...b.design };
      saveCollection(c);
      if (
        b.settings &&
        ["password", "clientPassword", "emailRegistration"].some(
          (k) => k in b.settings,
        )
      )
        db.prepare("DELETE FROM sessions WHERE kind IN (?,?,?)").run(
          "gate_" + c.id,
          "client_" + c.id,
          "registration_" + c.id,
        );
      audit(c.id, "collection.updated");
      res.json(full(c, req));
    }),
  );
  app.delete(
    "/api/admin/collections/:id",
    wrap(async (req, res) => {
      const c = collection(req.params.id);
      c.deletedAt = Date.now();
      saveCollection(c);
      audit(c.id, "collection.trashed");
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/admin/collections/:id/restore",
    wrap(async (req, res) => {
      const c = collection(req.params.id);
      c.deletedAt = null;
      c.status = "draft";
      saveCollection(c);
      res.json(full(c, req));
    }),
  );
  app.post(
    "/api/admin/collections/:id/duplicate",
    wrap(async (req, res) => {
      const source = collection(req.params.id),
        c = create({
          title: source.title + " copy",
          date: source.date,
          description: source.description,
          design: source.design,
        });
      c.settings = { ...source.settings };
      c.settings.passwordHash = "";
      c.settings.clientPasswordHash = "";
      saveCollection(c);
      const sets = new Map();
      db.prepare("DELETE FROM sets WHERE collectionId=?").run(c.id);
      for (const s of db
        .prepare("SELECT * FROM sets WHERE collectionId=?")
        .all(source.id)) {
        const id = uid();
        sets.set(s.id, id);
        db.prepare("INSERT INTO sets VALUES(?,?,?,?,?,?)").run(
          id,
          c.id,
          s.name,
          s.description,
          s.position,
          s.private,
        );
      }
      for (const p of db
        .prepare("SELECT * FROM photos WHERE collectionId=?")
        .all(source.id)) {
        const id = uid();
        db.prepare("INSERT INTO photos VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)").run(
          id,
          c.id,
          sets.get(p.setId) || null,
          p.filename,
          p.storage,
          p.width,
          p.height,
          p.caption,
          p.starred,
          p.private,
          p.position,
          p.type,
          Date.now(),
        );
        if (p.id === source.coverId) c.coverId = id;
      }
      saveCollection(c);
      res.status(201).json(full(c, req));
    }),
  );
  app.post(
    "/api/admin/collections/:id/sets",
    wrap(async (req, res) => {
      collection(req.params.id);
      const id = uid();
      db.prepare(
        "INSERT INTO sets(id,collectionId,name,description,position,private) VALUES(?,?,?,?,?,?)",
      ).run(
        id,
        req.params.id,
        clean(req.body.name || "New set"),
        clean(req.body.description, 500),
        Number(req.body.position) || Date.now(),
        +!!req.body.private,
      );
      res.status(201).json(db.prepare("SELECT * FROM sets WHERE id=?").get(id));
    }),
  );
  app.patch(
    "/api/admin/sets/:id",
    wrap(async (req, res) => {
      const s = db.prepare("SELECT * FROM sets WHERE id=?").get(req.params.id);
      if (!s) throw fail(404, "Set not found");
      db.prepare(
        "UPDATE sets SET name=?,description=?,position=?,private=? WHERE id=?",
      ).run(
        clean(req.body.name ?? s.name),
        clean(req.body.description ?? s.description, 500),
        Number(req.body.position ?? s.position),
        +(req.body.private ?? !!s.private),
        s.id,
      );
      res.json(db.prepare("SELECT * FROM sets WHERE id=?").get(s.id));
    }),
  );
  app.delete("/api/admin/sets/:id", (req, res) => {
    db.prepare("DELETE FROM sets WHERE id=?").run(req.params.id);
    res.json({ ok: true });
  });
  const upload = multer({
    dest: path.join(data, "tmp"),
    limits: { fileSize: 100 * 1024 * 1024, files: 100, fields: 20 },
  });
  app.post(
    "/api/admin/collections/:id/photos",
    upload.array("files", 100),
    wrap(async (req, res) => {
      const accepted = [];
      try {
        const c = collection(req.params.id);
        if (c.deletedAt)
          throw fail(400, "Restore the collection before uploading");
        const set =
          req.body.setId ||
          db
            .prepare(
              "SELECT id FROM sets WHERE collectionId=? ORDER BY position LIMIT 1",
            )
            .get(c.id)?.id;
        if (
          set &&
          !db
            .prepare("SELECT 1 FROM sets WHERE id=? AND collectionId=?")
            .get(set, c.id)
        )
          throw fail(400, "Invalid set");
        for (const file of req.files || []) {
          const id = uid();
          const head = Buffer.alloc(16);
          const fd = fs.openSync(file.path, "r");
          fs.readSync(fd, head, 0, 16, 0);
          fs.closeSync(fd);
          if (
            (head.toString("ascii", 4, 8) === "ftyp" &&
              ["isom", "iso2", "mp41", "mp42", "avc1", "qt  "].includes(
                head.toString("ascii", 8, 12),
              )) ||
            head.subarray(0, 4).toString("hex") === "1a45dfa3"
          ) {
            const storage =
              id + (head.toString("ascii", 4, 8) === "ftyp" ? ".mp4" : ".webm");
            fs.copyFileSync(file.path, path.join(data, "originals", storage));
            db.prepare(
              "INSERT INTO photos(id,collectionId,setId,filename,storage,width,height,position,type,createdAt) VALUES(?,?,?,?,?,?,?,?,?,?)",
            ).run(
              id,
              c.id,
              set || null,
              clean(file.originalname, 250),
              storage,
              0,
              0,
              Date.now() + accepted.length,
              "video",
              Date.now(),
            );
            accepted.push(
              photoOut(db.prepare("SELECT * FROM photos WHERE id=?").get(id)),
            );
            continue;
          }
          const m = await sharp(file.path, { limitInputPixels: 80000000 })
            .rotate()
            .metadata();
          if (
            !["jpeg", "png", "webp", "heif", "tiff", "avif"].includes(m.format)
          )
            throw fail(400, "Upload JPEG, PNG, WebP, AVIF or TIFF images");
          const storage = id + ".jpg";
          fs.copyFileSync(
            file.path,
            path.join(data, "originals", storage + ".source"),
          );
          await sharp(file.path, { limitInputPixels: 80000000 })
            .rotate()
            .flatten({ background: "#fff" })
            .jpeg({ quality: 96 })
            .toFile(path.join(data, "originals", storage));
          await sharp(path.join(data, "originals", storage))
            .resize({
              width: 1600,
              height: 1600,
              fit: "inside",
              withoutEnlargement: true,
            })
            .jpeg({ quality: 86 })
            .toFile(path.join(data, "previews", storage));
          const actual = await sharp(
            path.join(data, "originals", storage),
          ).metadata();
          db.prepare(
            "INSERT INTO photos(id,collectionId,setId,filename,storage,width,height,position,createdAt) VALUES(?,?,?,?,?,?,?,?,?)",
          ).run(
            id,
            c.id,
            set || null,
            clean(file.originalname, 250),
            storage,
            actual.width,
            actual.height,
            Date.now() + accepted.length,
            Date.now(),
          );
          accepted.push(
            photoOut(db.prepare("SELECT * FROM photos WHERE id=?").get(id)),
          );
        }
        audit(c.id, "photos.uploaded", "", String(accepted.length));
        res.status(201).json({ photos: accepted, collection: full(c, req) });
      } finally {
        for (const f of req.files || []) fs.rmSync(f.path, { force: true });
      }
    }),
  );
  app.patch(
    "/api/admin/photos/:id",
    wrap(async (req, res) => {
      const p = db
        .prepare("SELECT * FROM photos WHERE id=?")
        .get(req.params.id);
      if (!p) throw fail(404, "Photo not found");
      const b = req.body;
      if (
        b.setId &&
        !db
          .prepare("SELECT 1 FROM sets WHERE id=? AND collectionId=?")
          .get(b.setId, p.collectionId)
      )
        throw fail(400, "Set belongs to another collection");
      db.prepare(
        "UPDATE photos SET filename=?,caption=?,starred=?,private=?,position=?,setId=? WHERE id=?",
      ).run(
        clean(b.filename ?? p.filename, 250),
        clean(b.caption ?? p.caption, 2000),
        +(b.starred ?? !!p.starred),
        +(b.private ?? !!p.private),
        Number(b.position ?? p.position),
        b.setId ?? p.setId,
        p.id,
      );
      res.json(
        photoOut(db.prepare("SELECT * FROM photos WHERE id=?").get(p.id)),
      );
    }),
  );
  app.delete("/api/admin/photos/:id", (req, res) => {
    db.prepare("DELETE FROM photos WHERE id=?").run(req.params.id);
    res.json({ ok: true });
  });

  app.post(
    "/api/admin/photos/:id/share",
    wrap(async (req, res) => {
      const p = db
        .prepare("SELECT * FROM photos WHERE id=?")
        .get(req.params.id);
      if (!p) throw fail(404, "Photo not found");
      const c = collection(p.collectionId);
      if (!active(c) || p.private)
        throw fail(
          400,
          "Publish the collection and make this photo visible before sharing",
        );
      audit(c.id, "photo.shared", "", p.id);
      res.json({ url: base + "/g/" + c.slug + "?photo=" + p.id });
    }),
  );
  app.post(
    "/api/admin/collections/bulk-share",
    wrap(async (req, res) => {
      if (!mailer) throw fail(503, "Configure SMTP before sending");
      const items = req.body.items;
      if (!Array.isArray(items) || items.length < 1 || items.length > 100)
        throw fail(
          400,
          "Select 1ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œ100 collections",
        );
      const jobs = items.map((item) => {
        const c = collection(item.id);
        if (!active(c) && !(c.status === "pre-release" && !c.deletedAt))
          throw fail(
            400,
            "All selected collections must be published or pre-release",
          );
        const emails = (
          Array.isArray(item.emails)
            ? item.emails
            : String(item.emails || "").split(/[;,\n]/)
        ).map(email);
        if (emails.length > 20)
          throw fail(400, "Use at most 20 recipients per collection");
        return { c, emails };
      });
      let sent = 0;
      for (const { c, emails } of jobs)
        for (const to of emails) {
          await mailer.sendMail({
            from:
              process.env.CLIENT_SMTP_FROM ||
              "In Moment <photos@inmomentservices.com>",
            to,
            subject: clean(req.body.subject || c.title),
            text:
              clean(req.body.message, 10000) + "\n\n" + base + "/g/" + c.slug,
          });
          audit(c.id, "email.sent", to);
          sent++;
        }
      res.json({ sent });
    }),
  );
  app.post(
    "/api/admin/photos/:id/replace",
    upload.single("file"),
    wrap(async (req, res) => {
      const p = db
        .prepare("SELECT * FROM photos WHERE id=?")
        .get(req.params.id);
      if (!p || !req.file) throw fail(400, "Choose a photo to replace");
      try {
        const storage = uid() + ".jpg";
        const input = await fs.promises.readFile(req.file.path);
        const converted = await sharp(input, { limitInputPixels: 80000000 })
          .rotate()
          .flatten({ background: "#fff" })
          .jpeg({ quality: 96 })
          .toBuffer();
        const m = await sharp(converted).metadata();
        fs.writeFileSync(
          path.join(data, "originals", storage + ".source"),
          input,
        );
        fs.writeFileSync(path.join(data, "originals", storage), converted);
        await sharp(converted)
          .resize({
            width: 1600,
            height: 1600,
            fit: "inside",
            withoutEnlargement: true,
          })
          .jpeg({ quality: 86 })
          .toFile(path.join(data, "previews", storage));
        db.prepare(
          "UPDATE photos SET storage=?,filename=?,width=?,height=?,type=? WHERE id=?",
        ).run(
          storage,
          clean(req.file.originalname, 250),
          m.width,
          m.height,
          "image",
          p.id,
        );
        audit(p.collectionId, "photo.replaced", "", p.filename);
        res.json(
          photoOut(db.prepare("SELECT * FROM photos WHERE id=?").get(p.id)),
        );
      } finally {
        fs.rmSync(req.file.path, { force: true });
      }
    }),
  );
  app.post(
    "/api/admin/photos/:id/copy",
    wrap(async (req, res) => {
      const p = db
        .prepare("SELECT * FROM photos WHERE id=?")
        .get(req.params.id);
      if (!p) throw fail(404, "Photo not found");
      const target = collection(req.body.collectionId);
      if (target.deletedAt) throw fail(400, "Restore target collection first");
      const set = req.body.setId || null;
      if (
        set &&
        !db
          .prepare("SELECT 1 FROM sets WHERE id=? AND collectionId=?")
          .get(set, target.id)
      )
        throw fail(400, "Invalid target set");
      if (req.body.move) {
        db.prepare("UPDATE photos SET collectionId=?,setId=? WHERE id=?").run(
          target.id,
          set,
          p.id,
        );
        db.prepare("UPDATE collections SET coverId=NULL WHERE coverId=?").run(
          p.id,
        );
        res.json(
          photoOut(db.prepare("SELECT * FROM photos WHERE id=?").get(p.id)),
        );
      } else {
        const id = uid();
        db.prepare("INSERT INTO photos VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)").run(
          id,
          target.id,
          set,
          p.filename,
          p.storage,
          p.width,
          p.height,
          p.caption,
          p.starred,
          p.private,
          p.position,
          p.type,
          Date.now(),
        );
        res
          .status(201)
          .json(
            photoOut(db.prepare("SELECT * FROM photos WHERE id=?").get(id)),
          );
      }
    }),
  );
  app.post(
    "/api/admin/collections/:id/embed",
    wrap(async (req, res) => {
      const c = collection(req.params.id),
        url = embedUrl(req.body.url);
      if (!url) throw fail(400, "Use a full YouTube or Vimeo video URL");
      const set = req.body.setId || null;
      if (
        set &&
        !db
          .prepare("SELECT 1 FROM sets WHERE id=? AND collectionId=?")
          .get(set, c.id)
      )
        throw fail(400, "Invalid set");
      const id = uid();
      db.prepare(
        "INSERT INTO photos(id,collectionId,setId,filename,storage,width,height,position,type,createdAt) VALUES(?,?,?,?,?,?,?,?,?,?)",
      ).run(
        id,
        c.id,
        set,
        clean(req.body.title || "Video"),
        url,
        1920,
        1080,
        Date.now(),
        "embed",
        Date.now(),
      );
      res
        .status(201)
        .json(photoOut(db.prepare("SELECT * FROM photos WHERE id=?").get(id)));
    }),
  );
  app.post(
    "/api/admin/collections/bulk",
    wrap(async (req, res) => {
      if (
        !Array.isArray(req.body.collections) ||
        !req.body.collections.length ||
        req.body.collections.length > 200
      )
        throw fail(
          400,
          "Supply 1ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œ200 collections",
        );
      const output = db.transaction(() =>
        req.body.collections.map((b) => full(create(b), req)),
      )();
      res.status(201).json(output);
    }),
  );
  app.get(
    "/api/admin/photos/:id/original",
    wrap(async (req, res) => {
      const p = db
        .prepare("SELECT * FROM photos WHERE id=?")
        .get(req.params.id);
      if (!p || p.type === "embed") throw fail(404, "Original not available");
      const file = path.join(
        data,
        "originals",
        p.storage +
          (fs.existsSync(path.join(data, "originals", p.storage + ".source"))
            ? ".source"
            : ""),
      );
      res.download(file, path.basename(p.filename));
    }),
  );
  app.get("/api/admin/library", (req, res) =>
    res.json(
      db
        .prepare(
          "SELECT p.*,c.title AS collectionTitle FROM photos p JOIN collections c ON c.id=p.collectionId WHERE c.deletedAt IS NULL ORDER BY p.createdAt DESC",
        )
        .all()
        .map(photoOut),
    ),
  );
  app.get("/api/admin/settings", (req, res) =>
    res.json({
      ...brandOut(),
      homepagePasswordSet: !!cfg().homepagePasswordHash,
      emailEnabled: !!mailer,
    }),
  );
  app.patch(
    "/api/admin/settings",
    wrap(async (req, res) => {
      const b = { ...cfg() };
      const allowed = [
        "brandName",
        "logoUrl",
        "coverLogoUrl",
        "faviconUrl",
        "domain",
        "homepageEnabled",
        "homepageTitle",
        "homepageDescription",
        "homepageSort",
        "defaultLanguage",
        "showFilenames",
        "searchEngineVisible",
        "sharpening",
        "terms",
        "privacy",
        "cookieBanner",
        "analyticsId",
        "watermarks",
        "marketingOptIns",
        "galleryPopup",
      ];
      for (const k of allowed) if (k in req.body) b[k] = req.body[k];
      for (const k of ["logoUrl", "coverLogoUrl", "faviconUrl"])
        if (
          b[k] &&
          !/^\/assets\/[a-zA-Z0-9.-]+$/.test(b[k]) &&
          !/^https:\/\//.test(b[k])
        )
          throw fail(400, "Brand image must use HTTPS or an uploaded asset");
      if (!Array.isArray(b.watermarks))
        throw fail(400, "Watermarks must be a list");
      if (b.watermarks.length > 50)
        throw fail(400, "Use at most 50 watermarks");
      if ("homepagePassword" in req.body)
        b.homepagePasswordHash = req.body.homepagePassword
          ? secretHash(clean(req.body.homepagePassword))
          : "";
      db.prepare("UPDATE settings SET value=? WHERE id=1").run(
        JSON.stringify(b),
      );
      if ("homepagePassword" in req.body)
        db.prepare("DELETE FROM sessions WHERE kind='homepage'").run();
      res.json({
        ...brandOut(),
        homepagePasswordSet: !!b.homepagePasswordHash,
      });
    }),
  );
  app.post(
    "/api/admin/assets",
    upload.single("file"),
    wrap(async (req, res) => {
      if (!req.file) throw fail(400, "Choose an image");
      try {
        const name = uid() + ".png";
        await sharp(req.file.path, { limitInputPixels: 40000000 })
          .rotate()
          .resize({
            width: 1600,
            height: 1600,
            fit: "inside",
            withoutEnlargement: true,
          })
          .png()
          .toFile(path.join(data, "assets", name));
        res.json({ url: "/assets/" + name });
      } finally {
        fs.rmSync(req.file.path, { force: true });
      }
    }),
  );
  for (const kind of ["presets", "templates", "campaigns"]) {
    app.get("/api/admin/" + kind, (req, res) =>
      res.json(
        db
          .prepare("SELECT * FROM objects WHERE kind=?")
          .all(kind)
          .map((r) => ({ id: r.id, ...parse(r.value) })),
      ),
    );
    app.post("/api/admin/" + kind, (req, res) => {
      const id = uid();
      const value = { ...req.body };
      delete value.id;
      db.prepare("INSERT INTO objects VALUES(?,?,?)").run(
        id,
        kind,
        JSON.stringify(value),
      );
      res.status(201).json({ id, ...value });
    });
    app.patch(
      "/api/admin/" + kind + "/:id",
      wrap(async (req, res) => {
        const row = db
          .prepare("SELECT * FROM objects WHERE id=? AND kind=?")
          .get(req.params.id, kind);
        if (!row) throw fail(404, "Not found");
        const value = { ...parse(row.value), ...req.body };
        delete value.id;
        db.prepare("UPDATE objects SET value=? WHERE id=?").run(
          JSON.stringify(value),
          row.id,
        );
        res.json({ id: row.id, ...value });
      }),
    );
    app.delete("/api/admin/" + kind + "/:id", (req, res) => {
      db.prepare("DELETE FROM objects WHERE id=? AND kind=?").run(
        req.params.id,
        kind,
      );
      res.json({ ok: true });
    });
  }
  app.get("/api/admin/activity", (req, res) =>
    res.json(
      req.query.collectionId
        ? db
            .prepare(
              "SELECT * FROM activity WHERE collectionId=? ORDER BY createdAt DESC LIMIT 2000",
            )
            .all(String(req.query.collectionId))
        : db
            .prepare(
              "SELECT * FROM activity ORDER BY createdAt DESC LIMIT 2000",
            )
            .all(),
    ),
  );
  app.delete("/api/admin/activity", (req, res) => {
    if (req.query.collectionId)
      db.prepare("DELETE FROM activity WHERE collectionId=?").run(
        String(req.query.collectionId),
      );
    else db.prepare("DELETE FROM activity").run();
    res.json({ ok: true });
  });
  app.post(
    "/api/admin/collections/:id/share",
    wrap(async (req, res) => {
      const c = collection(req.params.id);
      if (!active(c) && c.status !== "pre-release")
        throw fail(400, "Publish or pre-release the collection before sharing");
      if (!mailer)
        throw fail(
          503,
          "Configure CLIENT_SMTP settings to send email. You can still copy the gallery link.",
        );
      const emails = (
        Array.isArray(req.body.emails)
          ? req.body.emails
          : String(req.body.emails || "").split(/[;,\n]/)
      ).map(email);
      if (!emails.length || emails.length > 100)
        throw fail(
          400,
          "Enter 1ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“100 recipients",
        );
      for (const to of emails) {
        await mailer.sendMail({
          from:
            process.env.CLIENT_SMTP_FROM ||
            "In Moment <photos@inmomentservices.com>",
          to,
          subject: clean(req.body.subject || c.title),
          text: clean(req.body.message, 10000) + "\n\n" + base + "/g/" + c.slug,
          html: `<div style="font-family:Georgia,serif;padding:40px;background:#faf9f6;color:#283c32"><h1>${escape(c.title)}</h1><p>${escape(clean(req.body.message, 10000)).replace(/\n/g, "<br>")}</p><p><a href="${base}/g/${c.slug}">View gallery</a></p><p>${escape(cfg().brandName)}</p></div>`,
        });
        audit(c.id, "email.sent", to);
      }
      res.json({ sent: emails.length });
    }),
  );
  app.get("/api/admin/collections/:id/favorite-lists", (req, res) =>
    res.json(
      db
        .prepare("SELECT * FROM favorites WHERE collectionId=?")
        .all(req.params.id)
        .map((r) => ({
          ...r,
          photoIds: parse(r.photoIds),
          notes: parse(r.notes),
        })),
    ),
  );
  app.post(
    "/api/admin/collections/:id/favorite-lists",
    wrap(async (req, res) => {
      collection(req.params.id);
      const id = uid();
      db.prepare(
        "INSERT INTO favorites(id,collectionId,owner,email,name,selectionLimit,createdAt) VALUES(?,?,?,?,?,?,?)",
      ).run(
        id,
        req.params.id,
        "preset",
        "",
        clean(req.body.name || "Select your favorites"),
        Math.max(0, Number(req.body.selectionLimit) || 0),
        Date.now(),
      );
      res.status(201).json({ id });
    }),
  );

  app.get("/api/admin/contacts", (req, res) =>
    res.json(
      req.query.collectionId
        ? db
            .prepare(
              "SELECT s.*,c.title AS collectionTitle FROM subscriptions s JOIN collections c ON c.id=s.collectionId WHERE s.collectionId=?",
            )
            .all(String(req.query.collectionId))
        : db
            .prepare(
              "SELECT s.*,c.title AS collectionTitle FROM subscriptions s JOIN collections c ON c.id=s.collectionId",
            )
            .all(),
    ),
  );
  app.delete(
    "/api/admin/contacts",
    wrap(async (req, res) => {
      const mail = email(req.body.email);
      if (req.body.collectionId)
        db.prepare(
          "DELETE FROM subscriptions WHERE collectionId=? AND email=?",
        ).run(req.body.collectionId, mail);
      else db.prepare("DELETE FROM subscriptions WHERE email=?").run(mail);
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/admin/campaigns/:id/send",
    wrap(async (req, res) => {
      const row = db
        .prepare("SELECT * FROM objects WHERE id=? AND kind='campaigns'")
        .get(req.params.id);
      if (!row) throw fail(404, "Campaign not found");
      const campaign = parse(row.value);
      if (campaign.sentAt)
        throw fail(
          409,
          "This campaign was already sent. Create another for a new message.",
        );
      if (!mailer) throw fail(503, "Configure SMTP before sending campaigns");
      const c = collection(req.body.collectionId || campaign.collectionId);
      if (!active(c))
        throw fail(400, "Publish the collection before notifying subscribers");
      const recipients = db
        .prepare("SELECT email FROM subscriptions WHERE collectionId=?")
        .all(c.id);
      const delivered = new Set(campaign.delivered || []);
      for (const { email: to } of recipients) {
        if (delivered.has(to)) continue;
        const token = Buffer.from(
          JSON.stringify({ collectionId: c.id, email: to }),
        ).toString("base64url");
        const sig = crypto
          .createHmac("sha256", secret)
          .update(token)
          .digest("hex");
        const unsubscribe = base + "/unsubscribe/" + token + "." + sig;
        await mailer.sendMail({
          from:
            process.env.CLIENT_SMTP_FROM ||
            "In Moment <photos@inmomentservices.com>",
          to,
          subject: clean(req.body.subject || campaign.subject || c.title),
          text:
            clean(req.body.message || campaign.message, 10000) +
            "\n\n" +
            base +
            "/g/" +
            c.slug +
            "\n\nUnsubscribe: " +
            unsubscribe,
          headers: { "List-Unsubscribe": "<" + unsubscribe + ">" },
        });
        delivered.add(to);
        campaign.delivered = [...delivered];
        db.prepare("UPDATE objects SET value=? WHERE id=?").run(
          JSON.stringify(campaign),
          row.id,
        );
        audit(c.id, "campaign.sent", to, row.id);
      }
      campaign.sentAt = Date.now();
      campaign.collectionId = c.id;
      db.prepare("UPDATE objects SET value=? WHERE id=?").run(
        JSON.stringify(campaign),
        row.id,
      );
      res.json({ sent: delivered.size });
    }),
  );
  function unsubscribePayload(raw) {
    const [token, sig] = raw.split(".");
    if (
      !sig ||
      !same(
        sig,
        crypto.createHmac("sha256", secret).update(token).digest("hex"),
      )
    )
      throw fail(404, "Invalid unsubscribe link");
    return JSON.parse(Buffer.from(token, "base64url").toString());
  }
  app.get(
    "/unsubscribe/:token",
    wrap(async (req, res) => {
      unsubscribePayload(req.params.token);
      res
        .type("html")
        .send(
          '<!doctype html><meta name="viewport" content="width=device-width"><title>Unsubscribe</title><main style="max-width:500px;margin:10vh auto;font:18px system-ui"><h1>Email preferences</h1><p>Stop collection announcements from In Moment.</p><form method="post"><button>Unsubscribe</button></form></main>',
        );
    }),
  );
  app.post(
    "/unsubscribe/:token",
    wrap(async (req, res) => {
      const value = unsubscribePayload(req.params.token);
      db.prepare(
        "DELETE FROM subscriptions WHERE collectionId=? AND email=?",
      ).run(value.collectionId, value.email);
      res
        .type("html")
        .send(
          "<!doctype html><title>Unsubscribed</title><h1>You have been unsubscribed.</h1>",
        );
    }),
  );
  app.delete(
    "/api/gallery/:slug/favorites/:id",
    wrap(async (req, res) => {
      const c = collection(req.params.slug, true);
      guard(req, c);
      const owner = favoriteOwner(req, c);
      db.prepare(
        "DELETE FROM favorites WHERE id=? AND collectionId=? AND owner=?",
      ).run(req.params.id, c.id, owner.id);
      res.json({ ok: true });
    }),
  );
  app.get(
    "/api/homepage",
    wrap(async (req, res) => {
      const b = cfg();
      if (!b.homepageEnabled)
        throw fail(404, "Gallery homepage is not enabled");
      if (
        b.homepagePasswordHash &&
        !session(req, "homepage", "homepage") &&
        !session(req, "admin")
      )
        throw fail(401, "Enter the homepage password", { locked: true });
      const list = db
        .prepare("SELECT id FROM collections ORDER BY createdAt DESC")
        .all()
        .map((x) => collection(x.id))
        .filter((c) => active(c) && c.settings.homepageVisible)
        .map((c) => ({
          id: c.id,
          title: c.title,
          slug: c.slug,
          date: c.date,
          tags: c.tags,
          coverUrl: `/cover/${c.id}`,
          passwordProtected: !!c.settings.passwordHash,
        }));
      if (b.homepageSort === "oldest") list.reverse();
      if (b.homepageSort === "name")
        list.sort((a, b) => a.title.localeCompare(b.title));
      if (b.homepageSort === "event-date")
        list.sort((a, b) => String(b.date).localeCompare(String(a.date)));
      res.json({ brand: brandOut(), collections: list });
    }),
  );
  app.post(
    "/api/homepage/unlock",
    wrap(async (req, res) => {
      rate(req, "home");
      if (!checkSecret(req.body.password, cfg().homepagePasswordHash))
        throw fail(401, "Incorrect password");
      issue(res, "homepage", "homepage");
      res.json({ ok: true });
    }),
  );
  // Social crawlers have no guest session. Never expose protected or private media.
  function socialCover(c) {
    if (!active(c) || c.settings.passwordHash || c.settings.emailRegistration)
      return null;
    return db
      .prepare(
        `SELECT p.* FROM photos p LEFT JOIN sets s ON s.id=p.setId
      WHERE p.collectionId=? AND p.type='image' AND p.private=0 AND COALESCE(s.private,0)=0
      ${c.coverId ? "AND p.id=?" : ""} ORDER BY p.position,p.createdAt LIMIT 1`,
      )
      .get(...(c.coverId ? [c.id, c.coverId] : [c.id]));
  }
  app.get(
    "/social-cover/:slug/:photo",
    wrap(async (req, res) => {
      const c = collection(req.params.slug, true),
        p = socialCover(c);
      if (!p || p.id !== req.params.photo) throw fail(404, "Not available");
      res.set("Cache-Control", "no-store");
      res.type("jpeg").send(
        await sharp(path.join(data, "previews", p.storage))
          .resize(1200, 630, { fit: "contain", background: "#f4f2ec" })
          .jpeg({ quality: 88 })
          .toBuffer(),
      );
    }),
  );
  app.get(
    "/api/admin/collections/:id/qr",
    wrap(async (req, res) => {
      const c = collection(req.params.id);
      if (!active(c))
        throw fail(409, "Publish this collection before sharing it");
      res.type("png").send(
        await QRCode.toBuffer(base + "/g/" + encodeURIComponent(c.slug), {
          width: 1000,
          margin: 2,
        }),
      );
    }),
  );
  app.get(
    "/api/admin/collections/:id/capture-dates",
    wrap(async (req, res) => {
      const c = collection(req.params.id),
        dates = {};
      for (const p of db
        .prepare("SELECT * FROM photos WHERE collectionId=? AND type='image'")
        .all(c.id)) {
        try {
          dates[p.id] = captureDate(
            (
              await sharp(
                path.join(data, "originals", p.storage + ".source"),
              ).metadata()
            ).exif,
          );
        } catch {
          dates[p.id] = null;
        }
      }
      res.json({ dates });
    }),
  );
  app.put(
    "/api/admin/collections/:id/order",
    wrap(async (req, res) => {
      const c = collection(req.params.id),
        ids = req.body.photoIds;
      const rows = db
        .prepare(
          "SELECT id FROM photos WHERE collectionId=? ORDER BY position,createdAt",
        )
        .all(c.id);
      if (
        !Array.isArray(ids) ||
        ids.length !== rows.length ||
        new Set(ids).size !== ids.length ||
        ids.some((id) => !rows.some((p) => p.id === id))
      )
        throw fail(400, "Supply every collection photo exactly once");
      if (
        req.body.expectedIds &&
        JSON.stringify(req.body.expectedIds) !==
          JSON.stringify(rows.map((p) => p.id))
      )
        throw fail(
          409,
          "Photo order changed in another window. Refresh before reordering.",
        );
      const update = db.prepare(
        "UPDATE photos SET position=? WHERE id=? AND collectionId=?",
      );
      db.transaction(() => ids.forEach((id, i) => update.run(i, id, c.id)))();
      audit(c.id, "photos.reordered", "", String(ids.length));
      res.json(full(c, req));
    }),
  );
  app.get(
    "/cover/:id",
    wrap(async (req, res) => {
      const c = collection(req.params.id),
        b = cfg();
      if (
        !active(c) ||
        !b.homepageEnabled ||
        !c.settings.homepageVisible ||
        c.settings.passwordHash ||
        (b.homepagePasswordHash && !session(req, "homepage", "homepage"))
      )
        throw fail(404, "Not available");
      const p = c.coverId
        ? db
            .prepare(
              "SELECT * FROM photos WHERE id=? AND collectionId=? AND private=0",
            )
            .get(c.coverId, c.id)
        : db
            .prepare(
              "SELECT * FROM photos WHERE collectionId=? AND private=0 ORDER BY position LIMIT 1",
            )
            .get(c.id);
      if (!p || !visiblePhoto(req, p, c)) throw fail(404, "Not available");
      res.sendFile(path.join(data, "previews", p.storage));
    }),
  );
  app.get(
    "/api/gallery/:slug",
    wrap(async (req, res) => {
      const c = collection(req.params.slug, true);
      if (c.status === "pre-release" && !c.deletedAt && !session(req, "admin"))
        return res.json({
          id: c.id,
          title: c.title,
          slug: c.slug,
          status: c.status,
          description: c.description,
          design: c.design,
          brand: brandOut(),
          photos: [],
          sets: [],
        });
      guard(req, c);
      res.json(full(c, req, true));
    }),
  );
  app.post(
    "/api/gallery/:slug/unlock",
    wrap(async (req, res) => {
      rate(req, "unlock");
      const c = collection(req.params.slug, true);
      if (!active(c)) throw fail(404, "Not available");
      if (checkSecret(req.body.password, c.settings.clientPasswordHash)) {
        issue(res, "client_" + c.id, c.id);
        issue(res, "gate_" + c.id, c.id);
      } else if (checkSecret(req.body.password, c.settings.passwordHash))
        issue(res, "gate_" + c.id, c.id);
      else throw fail(401, "Incorrect gallery password");
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/gallery/:slug/register",
    wrap(async (req, res) => {
      rate(req, "register", 100);
      const c = collection(req.params.slug, true);
      if (
        !active(c) ||
        (c.settings.passwordHash && !session(req, "gate_" + c.id, c.id))
      )
        throw fail(403, "Unlock this gallery first");
      const mail = email(req.body.email);
      audit(c.id, "registration", mail);
      issue(res, "registration_" + c.id, c.id);
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/gallery/:slug/subscribe",
    wrap(async (req, res) => {
      rate(req, "subscribe", 30);
      const c = collection(req.params.slug, true);
      if (c.deletedAt || !["published", "pre-release"].includes(c.status))
        throw fail(404, "Not available");
      if (req.body.consent !== true)
        throw fail(400, "Consent is required for release notifications");
      const mail = email(req.body.email);
      db.prepare("INSERT OR IGNORE INTO subscriptions VALUES(?,?,?)").run(
        c.id,
        mail,
        Date.now(),
      );
      audit(c.id, "subscription", mail);
      res.json({ ok: true });
    }),
  );
  app.get(
    "/media/:id",
    wrap(async (req, res) => {
      const p = db
        .prepare("SELECT * FROM photos WHERE id=?")
        .get(req.params.id);
      if (!p) throw fail(404, "Photo not found");
      const c = collection(p.collectionId);
      guard(req, c);
      if (!visiblePhoto(req, p, c)) throw fail(404, "Photo not found");
      if (p.type === "video")
        return res.sendFile(path.join(data, "originals", p.storage));
      if (p.type === "embed") return res.redirect(p.storage);
      const mark = cfg().watermarks?.find(
        (w) => w.id === c.settings.watermarkId,
      );
      if (mark || cfg().sharpening) {
        let input = await fs.promises.readFile(
          path.join(data, "previews", p.storage),
        );
        if (cfg().sharpening) input = await sharp(input).sharpen().toBuffer();
        return res.type("jpg").send(await watermark(input, mark, data));
      }
      res.sendFile(path.join(data, "previews", p.storage));
    }),
  );
  app.post(
    "/api/gallery/:slug/download",
    wrap(async (req, res) => {
      rate(req, "download", 100);
      const c = collection(req.params.slug, true);
      guard(req, c);
      if (!c.settings.downloadEnabled)
        throw fail(403, "Downloads are disabled");
      if (
        c.settings.downloadPinHash &&
        !checkSecret(req.body.pin || "", c.settings.downloadPinHash)
      )
        throw fail(403, "Enter the download PIN");
      const mail =
        c.settings.downloadEmailRequired ||
        c.settings.downloadLimitPerEmail ||
        c.settings.allowedEmails?.length
          ? email(req.body.email)
          : clean(req.body.email, 254);
      if (
        c.settings.allowedEmails?.length &&
        !c.settings.allowedEmails.map((x) => x.toLowerCase()).includes(mail)
      )
        throw fail(403, "This email is not on the download list");
      const size = String(req.body.size || "original");
      if (
        !(c.settings.downloadSizes || []).includes(size) ||
        !["original", "3600", "2048", "1024", "640"].includes(size)
      )
        throw fail(400, "Choose an available download size");
      if (!req.body.photoIds && c.settings.galleryDownloadEnabled === false)
        throw fail(403, "Full-gallery downloads are disabled");
      if (req.body.photoIds && c.settings.singleDownloadEnabled === false)
        throw fail(403, "Selected-photo downloads are disabled");
      let photos = db
        .prepare("SELECT * FROM photos WHERE collectionId=?")
        .all(c.id)
        .filter(
          (p) =>
            p.type !== "embed" &&
            (p.type !== "video" || c.settings.videoDownloadEnabled !== false) &&
            visiblePhoto(req, p, c),
        );
      if (c.settings.downloadSetIds?.length)
        photos = photos.filter((p) =>
          c.settings.downloadSetIds.includes(p.setId),
        );
      if (req.body.photoIds) {
        if (!Array.isArray(req.body.photoIds))
          throw fail(400, "Invalid selection");
        photos = photos.filter((p) => req.body.photoIds.includes(p.id));
      }
      if (!photos.length) throw fail(400, "No downloadable photos selected");
      const used = db
        .prepare(
          "SELECT COALESCE(SUM(CAST(detail AS INTEGER)),0) AS n FROM activity WHERE collectionId=? AND type='download.created' AND (?=0 OR email=?)",
        )
        .get(c.id, +!!c.settings.downloadLimitPerEmail, mail).n;
      if (
        c.settings.downloadLimit &&
        used + photos.length > c.settings.downloadLimit
      )
        throw fail(403, "This collection has reached its download allowance");
      const token = crypto.randomBytes(32).toString("base64url");
      db.transaction(() => {
        db.prepare("INSERT INTO download_tokens VALUES(?,?,?,?)").run(
          hash(token),
          c.id,
          JSON.stringify({ ids: photos.map((p) => p.id), size, email: mail }),
          Date.now() + 15 * 60000,
        );
        audit(c.id, "download.created", mail, String(photos.length));
      })();
      res.json({ url: "/download/" + token });
    }),
  );
  app.get(
    "/download/:token",
    wrap(async (req, res) => {
      const record = db
        .prepare("SELECT * FROM download_tokens WHERE token=? AND expires>?")
        .get(hash(req.params.token), Date.now());
      if (!record)
        throw fail(
          404,
          "Download expired. Please request it again from the gallery.",
        );
      const c = collection(record.collectionId);
      if (!active(c) && !session(req, "admin"))
        throw fail(404, "Collection no longer available");
      guard(req, c);
      if (!c.settings.downloadEnabled) throw fail(403, "Downloads disabled");
      const payload = parse(record.payload);
      if (!c.settings.downloadSizes.includes(payload.size))
        throw fail(403, "Download size no longer available");
      const photos = payload.ids
        .map((id) =>
          db
            .prepare("SELECT * FROM photos WHERE id=? AND collectionId=?")
            .get(id, c.id),
        )
        .filter(
          (p) =>
            p &&
            p.type !== "embed" &&
            (p.type !== "video" || c.settings.videoDownloadEnabled !== false) &&
            visiblePhoto(req, p, c) &&
            (!c.settings.downloadSetIds?.length ||
              c.settings.downloadSetIds.includes(p.setId)),
        );
      if (!photos.length) throw fail(404, "Photos no longer available");
      const source = (p) =>
        fs.existsSync(path.join(data, "originals", p.storage + ".source"))
          ? path.join(data, "originals", p.storage + ".source")
          : path.join(data, "originals", p.storage);
      const stream = async (p) => {
        if (payload.size === "original" || p.type === "video")
          return fs.createReadStream(source(p));
        const transform = sharp(path.join(data, "originals", p.storage))
          .resize({
            width: +payload.size,
            height: +payload.size,
            fit: "inside",
            withoutEnlargement: true,
          })
          .jpeg({ quality: 94 });
        const mark =
          c.settings.watermarkDownloads &&
          cfg().watermarks?.find((w) => w.id === c.settings.watermarkId);
        return mark
          ? Readable.from([
              await watermark(await transform.toBuffer(), mark, data),
            ])
          : transform;
      };
      if (photos.length === 1) {
        res.attachment(
          payload.size === "original" || photos[0].type === "video"
            ? path.basename(photos[0].filename)
            : path.parse(photos[0].filename).name + ".jpg",
        );
        res.type("application/octet-stream");
        const input = await stream(photos[0]);
        input.on("error", () => res.destroy());
        input.pipe(res);
      } else {
        res.attachment(c.slug + ".zip");
        const zip = archiver("zip", { zlib: { level: 1 } });
        zip.on("error", () => res.destroy());
        zip.pipe(res);
        req.on("close", () => {
          if (!res.writableEnded) zip.abort();
        });
        for (const [i, p] of photos.entries()) {
          if (res.destroyed) break;
          const input = await stream(p);
          await new Promise((resolve, reject) => {
            const done = () => {
              zip.off("error", bad);
              resolve();
            };
            const bad = (err) => {
              zip.off("entry", done);
              reject(err);
            };
            zip.once("entry", done);
            zip.once("error", bad);
            zip.append(input, {
              name:
                String(i + 1).padStart(4, "0") +
                "-" +
                (payload.size === "original" || p.type === "video"
                  ? path.basename(p.filename)
                  : path.parse(p.filename).name + ".jpg"
                ).replace(/[^a-zA-Z0-9_.-]/g, "_"),
            });
          });
        }
        await zip.finalize();
      }
    }),
  );
  function favoriteOwner(req, c) {
    const token = req.cookies["mc_favorite_" + c.id];
    const row =
      token &&
      db
        .prepare(
          "SELECT subject FROM sessions WHERE token=? AND kind=? AND expires>?",
        )
        .get(hash(token + secret), "favorite_" + c.id, Date.now());
    if (!row) throw fail(401, "Enter your email to start a favorites list");
    return parse(row.subject);
  }
  app.post(
    "/api/gallery/:slug/favorites/session",
    wrap(async (req, res) => {
      rate(req, "favorites", 50);
      const c = collection(req.params.slug, true);
      guard(req, c);
      if (!c.settings.favoritesEnabled)
        throw fail(403, "Favorites are disabled");
      const mail = email(req.body.email);
      try {
        const owner = favoriteOwner(req, c);
        if (owner.email === mail) return res.json({ ok: true });
      } catch {}
      const owner = { id: uid(), email: mail };
      issue(res, "favorite_" + c.id, JSON.stringify(owner), 90 * 86400000);
      for (const preset of db
        .prepare(
          "SELECT * FROM favorites WHERE collectionId=? AND owner='preset'",
        )
        .all(c.id))
        db.prepare(
          "INSERT INTO favorites(id,collectionId,owner,email,name,selectionLimit,createdAt) VALUES(?,?,?,?,?,?,?)",
        ).run(
          uid(),
          c.id,
          owner.id,
          mail,
          preset.name,
          preset.selectionLimit,
          Date.now(),
        );
      audit(c.id, "favorites.started", mail);
      res.json({ ok: true });
    }),
  );

  app.post(
    "/api/gallery/:slug/favorites/recover",
    wrap(async (req, res) => {
      rate(req, "favorite-recovery", 5);
      const c = collection(req.params.slug, true);
      guard(req, c);
      const mail = email(req.body.email);
      if (!mailer)
        throw fail(
          503,
          "Email recovery is not configured yet. Your lists remain saved on this browser.",
        );
      const existing = db
        .prepare(
          "SELECT owner FROM favorites WHERE collectionId=? AND email=? AND owner!='preset' LIMIT 1",
        )
        .get(c.id, mail);
      if (existing) {
        const token = crypto.randomBytes(32).toString("base64url");
        db.prepare("INSERT INTO objects VALUES(?,?,?)").run(
          hash(token),
          "favorite-recovery",
          JSON.stringify({
            collectionId: c.id,
            email: mail,
            owner: existing.owner,
            expires: Date.now() + 1800000,
          }),
        );
        await mailer.sendMail({
          from:
            process.env.CLIENT_SMTP_FROM ||
            "In Moment <photos@inmomentservices.com>",
          to: mail,
          subject: "Your saved selections ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â· " + c.title,
          text:
            "Open your saved selections (valid for 30 minutes):\n" +
            base +
            "/g/" +
            c.slug +
            "?recover=" +
            token,
        });
      }
      res.json({
        message:
          "If saved lists exist for this email, a secure access link has been sent.",
      });
    }),
  );
  app.post(
    "/api/gallery/:slug/favorites/verify",
    wrap(async (req, res) => {
      rate(req, "favorite-verify", 20);
      const c = collection(req.params.slug, true);
      guard(req, c);
      const record = db
        .prepare(
          "SELECT * FROM objects WHERE id=? AND kind='favorite-recovery'",
        )
        .get(hash(req.body.token || ""));
      if (!record)
        throw fail(400, "This access link is invalid or has already been used");
      const value = parse(record.value);
      if (value.collectionId !== c.id || value.expires < Date.now())
        throw fail(400, "This access link has expired");
      db.transaction(() => {
        db.prepare("DELETE FROM objects WHERE id=?").run(record.id);
        db.prepare(
          "UPDATE favorites SET owner=? WHERE collectionId=? AND email=? AND owner!='preset'",
        ).run(value.owner, c.id, value.email);
      })();
      issue(
        res,
        "favorite_" + c.id,
        JSON.stringify({ id: value.owner, email: value.email }),
        90 * 86400000,
      );
      res.json({ ok: true });
    }),
  );
  app.get(
    "/api/gallery/:slug/favorites",
    wrap(async (req, res) => {
      const c = collection(req.params.slug, true);
      guard(req, c);
      const owner = favoriteOwner(req, c);
      res.json(
        db
          .prepare("SELECT * FROM favorites WHERE collectionId=? AND owner=?")
          .all(c.id, owner.id)
          .map((r) => ({
            ...r,
            photoIds: parse(r.photoIds),
            notes: parse(r.notes),
          })),
      );
    }),
  );
  const saveFavorite = wrap(async (req, res) => {
    const c = collection(req.params.slug, true);
    guard(req, c);
    if (!c.settings.favoritesEnabled) throw fail(403, "Favorites disabled");
    const owner = favoriteOwner(req, c);
    let old;
    if (req.params.id) {
      old = db
        .prepare(
          "SELECT * FROM favorites WHERE id=? AND collectionId=? AND owner=?",
        )
        .get(req.params.id, c.id, owner.id);
      if (!old) throw fail(404, "List not found");
    }
    const id = old?.id || uid();
    const ids = Array.from(
      new Set(req.body.photoIds || parse(old?.photoIds || "[]")),
    ).filter((id) => {
      const p = db
        .prepare("SELECT * FROM photos WHERE id=? AND collectionId=?")
        .get(id, c.id);
      return p && p.type === "image" && visiblePhoto(req, p, c);
    });
    if (old?.selectionLimit && ids.length > old.selectionLimit)
      throw fail(
        400,
        `Choose at most ${old.selectionLimit} photos for this list`,
      );
    const notes = c.settings.favoriteNotes
      ? req.body.notes || parse(old?.notes || "{}")
      : {};
    const name = clean(req.body.name || old?.name || "My favorites");
    db.prepare(
      "INSERT INTO favorites(id,collectionId,owner,email,name,photoIds,notes,completed,createdAt) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,photoIds=excluded.photoIds,notes=excluded.notes,completed=excluded.completed",
    ).run(
      id,
      c.id,
      owner.id,
      owner.email,
      name,
      JSON.stringify(ids),
      JSON.stringify(notes),
      +!!req.body.completed,
      Date.now(),
    );
    audit(
      c.id,
      req.body.completed ? "favorites.completed" : "favorites.updated",
      owner.email,
      name,
    );
    res.json({
      id,
      name,
      photoIds: ids,
      notes,
      completed: !!req.body.completed,
    });
  });
  app.post("/api/gallery/:slug/favorites", saveFavorite);
  app.patch("/api/gallery/:slug/favorites/:id", saveFavorite);
  app.use(
    "/assets",
    express.static(path.join(data, "assets"), {
      maxAge: "1h",
      dotfiles: "deny",
    }),
  );
  app.use(
    "/client-assets",
    express.static(path.join(root, "client-public"), {
      setHeaders: (res) => res.set("Cache-Control", "no-store"),
    }),
  );
  function versionClientAssets(html) {
    return html.replace(
      /(src|href)="(\/client-assets\/[^"?]+\.(?:js|css)|\/gallery\.(?:js|css))"/g,
      (match, attr, url) => {
        const file = path.join(root, "client-public", path.basename(url));
        const version = hash(fs.readFileSync(file, "utf8")).slice(0, 16);
        return `${attr}="${url}?v=${version}"`;
      },
    );
  }
  for (const name of ["gallery.js", "gallery.css"])
    app.get("/" + name, (req, res) =>
      res.sendFile(path.join(root, "client-public", name)),
    );
  app.get(["/admin", "/admin/*"], (req, res) => {
    res.set("Cache-Control", "no-store");
    res
      .type("html")
      .send(
        versionClientAssets(
          fs.readFileSync(path.join(root, "client-public/admin.html"), "utf8"),
        ),
      );
  });
  app.get(["/", "/g/:slug"], (req, res) => {
    res.set("X-Frame-Options", "SAMEORIGIN");
    res.set(
      "Content-Security-Policy",
      res
        .get("Content-Security-Policy")
        .replace("frame-ancestors 'none'", "frame-ancestors 'self'"),
    );
    res.set("Cache-Control", "no-store");
    res.set(
      "X-Robots-Tag",
      cfg().searchEngineVisible ? "index, follow" : "noindex, nofollow",
    );
    let html = fs.readFileSync(
      path.join(root, "client-public/gallery.html"),
      "utf8",
    );
    const escapeMeta = (value) =>
      String(value || "").replace(
        /[&<>"']/g,
        (ch) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[ch],
      );
    if (req.params.slug) {
      let c;
      try {
        c = collection(req.params.slug, true);
      } catch {}
      if (c && active(c)) {
        const p = socialCover(c),
          url = base + "/g/" + encodeURIComponent(c.slug);
        const title = escapeMeta(c.title),
          description = escapeMeta(
            c.description || "View your photographs from " + c.title,
          );
        const image = p
          ? base + "/social-cover/" + encodeURIComponent(c.slug) + "/" + p.id
          : "";
        html = html.replace(
          "<title>In Moment · Client Gallery</title>",
          `<title>${title} · In Moment</title>
          <meta property="og:type" content="website"><meta property="og:title" content="${title}">
          <meta property="og:description" content="${description}"><meta property="og:url" content="${escapeMeta(url)}">
          <meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}">
          ${image ? `<meta property="og:image" content="${escapeMeta(image)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:image" content="${escapeMeta(image)}">` : ""}`,
        );
      } else if (
        (!c || !session(req, "admin")) &&
        !(c?.status === "pre-release" && !c.deletedAt)
      ) {
        res.status(404);
      }
    }
    res.type("html").send(versionClientAssets(html));
  });
  app.use((error, req, res, next) => {
    for (const f of req.files || []) fs.rmSync(f.path, { force: true });
    if (req.file) fs.rmSync(req.file.path, { force: true });
    if (res.headersSent) return next(error);
    const status =
      error.status ||
      (/unsupported image|Input buffer|Input file|corrupt|Invalid image/i.test(
        error.message,
      )
        ? 400
        : undefined) ||
      (error.code?.startsWith("SQLITE_CONSTRAINT")
        ? 409
        : error instanceof multer.MulterError
          ? 400
          : 500);
    if (status === 500) console.error("Client Gallery:", error.message);
    res.status(status).json({
      error:
        status === 500
          ? "Something went wrong. Please try again."
          : error.message,
      ...(error.locked ? { locked: true, title: error.title } : {}),
      ...(error.registrationRequired
        ? {
            registrationRequired: true,
            title: error.title,
            brand: error.brand,
          }
        : {}),
    });
  });
  let maintaining = false;
  async function maintenance() {
    if (maintaining) return;
    maintaining = true;
    try {
      db.prepare("DELETE FROM sessions WHERE expires<?").run(Date.now());
      db.prepare("DELETE FROM download_tokens WHERE expires<?").run(Date.now());
      db.prepare(
        "DELETE FROM collections WHERE deletedAt IS NOT NULL AND deletedAt<?",
      ).run(Date.now() - 30 * 86400000);
      const used = new Set(
        db
          .prepare("SELECT storage FROM photos WHERE type!='embed'")
          .all()
          .map((p) => p.storage),
      );
      for (const folder of ["originals", "previews"])
        for (const name of fs.readdirSync(path.join(data, folder))) {
          const file = path.join(data, folder, name),
            key = name.replace(/\.source$/, "");
          if (
            !used.has(key) &&
            Date.now() - fs.statSync(file).mtimeMs > 86400000
          )
            fs.rmSync(file, { force: true });
        }
      for (const name of fs.readdirSync(path.join(data, "tmp"))) {
        const file = path.join(data, "tmp", name);
        if (Date.now() - fs.statSync(file).mtimeMs > 86400000)
          fs.rmSync(file, { force: true });
      }
      for (const row of db
        .prepare("SELECT * FROM objects WHERE kind='favorite-recovery'")
        .all())
        if (parse(row.value).expires < Date.now())
          db.prepare("DELETE FROM objects WHERE id=?").run(row.id);
      if (mailer)
        for (const row of db
          .prepare("SELECT id FROM collections WHERE deletedAt IS NULL")
          .all()) {
          const c = collection(row.id);
          const remaining =
            Date.parse(c.settings.expiry + "T23:59:59Z") - Date.now();
          if (
            !c.settings.autoExpiryReminder ||
            !active(c) ||
            remaining <= 0 ||
            remaining > 3 * 86400000
          )
            continue;
          const recipients = db
            .prepare(
              "SELECT DISTINCT email FROM activity WHERE collectionId=? AND email!='' AND type IN ('registration','email.sent','download.created') UNION SELECT email FROM subscriptions WHERE collectionId=?",
            )
            .all(c.id, c.id);
          for (const { email: to } of recipients) {
            if (
              db
                .prepare(
                  "SELECT 1 FROM activity WHERE collectionId=? AND email=? AND type='expiry.reminder' AND detail=?",
                )
                .get(c.id, to, c.settings.expiry)
            )
              continue;
            await mailer.sendMail({
              from:
                process.env.CLIENT_SMTP_FROM ||
                "In Moment <photos@inmomentservices.com>",
              to,
              subject: c.title + " ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â· gallery expires soon",
              text:
                "Your collection expires on " +
                c.settings.expiry +
                ". View or save your photographs before then:\n" +
                base +
                "/g/" +
                c.slug,
            });
            audit(c.id, "expiry.reminder", to, c.settings.expiry);
          }
        }
    } finally {
      maintaining = false;
    }
  }
  const cleanup = setInterval(() => {
    maintenance().catch((e) => console.error("Client maintenance:", e.message));
  }, 3600000);
  cleanup.unref();
  return {
    app,
    db,
    maintenance,
    close() {
      clearInterval(cleanup);
      db.close();
    },
  };
}
