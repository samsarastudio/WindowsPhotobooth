import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { createClientApp } from "../src/client/server.js";

async function fixture(t, overrides = {}) {
  const dataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "inmoment-client-test-"),
  );
  const password = "client-test-password-long";
  const client = createClientApp({
    dataDir,
    adminPassword: password,
    sessionSecret: "test-secret-with-at-least-thirty-two-characters",
    baseUrl: "http://127.0.0.1",
    secureCookies: false,
    ...overrides,
  });
  const server = client.app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
    client.close?.();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
  async function call(route, method = "GET", body, cookie = "", headers = {}) {
    const res = await fetch(base + route, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        cookie,
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const contentType = res.headers.get("content-type") || "";
    return {
      status: res.status,
      headers: res.headers,
      cookie: res.headers.get("set-cookie")?.split(";")[0] || "",
      body: contentType.includes("json") ? await res.json() : await res.text(),
    };
  }
  const login = await call("/api/admin/login", "POST", { password });
  assert.equal(login.status, 200);
  const admin = login.cookie;
  assert.ok(admin);
  async function create(overrides = {}) {
    const r = await call(
      "/api/admin/collections",
      "POST",
      { title: "Test collection", ...overrides },
      admin,
    );
    assert.ok([200, 201].includes(r.status), JSON.stringify(r.body));
    if (overrides.status && overrides.status !== "draft") {
      const update = await call(
        `/api/admin/collections/${r.body.id}`,
        "PATCH",
        { status: overrides.status },
        admin,
      );
      assert.equal(update.status, 200);
      return update.body;
    }
    return r.body;
  }
  async function upload(
    collectionId,
    width = 120,
    height = 180,
    name = "portrait.jpg",
  ) {
    const pixels = await sharp({
      create: { width, height, channels: 3, background: "#648373" },
    })
      .jpeg()
      .toBuffer();
    const form = new FormData();
    form.append("files", new Blob([pixels], { type: "image/jpeg" }), name);
    const res = await fetch(
      `${base}/api/admin/collections/${collectionId}/photos`,
      {
        method: "POST",
        headers: { cookie: admin },
        body: form,
      },
    );
    assert.ok(res.ok, await res.text());
    const collection = await call(
      `/api/admin/collections/${collectionId}`,
      "GET",
      undefined,
      admin,
    );
    return collection.body.photos.at(-1);
  }
  return { client, dataDir, base, call, create, upload, admin };
}

test("Client admin authentication and collection lifecycle stay isolated", async (t) => {
  const f = await fixture(t);
  assert.equal((await f.call("/api/admin/collections")).status, 401);
  assert.equal(
    (await f.call("/api/admin/login", "POST", { password: "incorrect" }))
      .status,
    401,
  );
  const r = await f.call(
    "/api/admin/settings",
    "PATCH",
    { studioName: "Unexpected" },
    f.admin,
    { Origin: "https://unrelated.invalid" },
  );
  assert.equal(r.status, 403, "reject cross-origin admin mutations");
  const c = await f.create({ title: "Portrait session", status: "draft" });
  assert.ok(c.id && c.slug);
  assert.notEqual((await f.call(`/api/gallery/${c.slug}`)).status, 200);
  assert.equal(
    (
      await f.call(
        `/api/admin/collections/${c.id}`,
        "PATCH",
        { title: "Updated session", status: "published" },
        f.admin,
      )
    ).status,
    200,
  );
  assert.equal(
    (await f.call(`/api/gallery/${c.slug}`)).body.title,
    "Updated session",
  );
  assert.ok(
    [200, 204].includes(
      (
        await f.call(
          `/api/admin/collections/${c.id}`,
          "DELETE",
          undefined,
          f.admin,
        )
      ).status,
    ),
  );
  assert.notEqual((await f.call(`/api/gallery/${c.slug}`)).status, 200);
  assert.equal(
    (
      await f.call(
        `/api/admin/collections/${c.id}/restore`,
        "POST",
        {},
        f.admin,
      )
    ).status,
    200,
  );
  assert.equal(
    (await f.call(`/api/admin/collections/${c.id}`, "GET", undefined, f.admin))
      .body.title,
    "Updated session",
  );
  assert.equal(
    (await f.call("/api/admin/logout", "POST", {}, f.admin)).status,
    200,
  );
  assert.equal(
    (await f.call("/api/admin/collections", "GET", undefined, f.admin)).status,
    401,
  );
});

test("Client images preserve dimensions and obey collection visibility", async (t) => {
  const f = await fixture(t);
  const c = await f.create({
    title: "Mixed orientations",
    status: "published",
  });
  const portrait = await f.upload(c.id, 120, 180);
  const landscape = await f.upload(c.id, 240, 160, "landscape.jpg");
  assert.equal(portrait.width, 120);
  assert.equal(portrait.height, 180);
  assert.equal(landscape.width, 240);
  assert.equal(landscape.height, 160);
  const gallery = await f.call(`/api/gallery/${c.slug}`);
  assert.equal(gallery.body.photos.length, 2);
  const media = gallery.body.photos[0].url;
  const image = await fetch(new URL(media, f.base));
  assert.equal(image.status, 200);
  assert.match(image.headers.get("content-type"), /image\//);
  await f.call(
    `/api/admin/collections/${c.id}`,
    "PATCH",
    { status: "hidden" },
    f.admin,
  );
  assert.notEqual((await f.call(`/api/gallery/${c.slug}`)).status, 200);
  assert.notEqual(
    (await fetch(new URL(media, f.base))).status,
    200,
    "copied media URL must honor hidden collection",
  );
});

test("Client password gates public gallery and direct media", async (t) => {
  const f = await fixture(t);
  const c = await f.create({ title: "Protected session", status: "published" });
  await f.upload(c.id);
  const before = await f.call(`/api/gallery/${c.slug}`);
  const media = before.body.photos[0].url;
  await f.call(
    `/api/admin/collections/${c.id}`,
    "PATCH",
    { settings: { password: "guest-secret" } },
    f.admin,
  );
  assert.equal((await f.call(`/api/gallery/${c.slug}`)).status, 401);
  assert.notEqual((await fetch(new URL(media, f.base))).status, 200);
  assert.equal(
    (
      await f.call(`/api/gallery/${c.slug}/unlock`, "POST", {
        password: "wrong",
      })
    ).status,
    401,
  );
  const unlock = await f.call(`/api/gallery/${c.slug}/unlock`, "POST", {
    password: "guest-secret",
  });
  assert.equal(unlock.status, 200);
  assert.ok(unlock.cookie);
  assert.equal(
    (await f.call(`/api/gallery/${c.slug}`, "GET", undefined, unlock.cookie))
      .status,
    200,
  );
  assert.equal(
    (
      await fetch(new URL(media, f.base), {
        headers: { cookie: unlock.cookie },
      })
    ).status,
    200,
  );
  assert.equal(
    (await f.call(`/api/gallery/${c.slug}`)).status,
    401,
    "another guest remains locked",
  );
  await f.call(
    `/api/admin/collections/${c.id}`,
    "PATCH",
    { settings: { password: "replacement-secret" } },
    f.admin,
  );
  assert.equal(
    (await f.call(`/api/gallery/${c.slug}`, "GET", undefined, unlock.cookie))
      .status,
    401,
    "changing the password revokes existing unlock sessions",
  );
});

test("Client download restrictions apply before granting file access", async (t) => {
  const f = await fixture(t);
  const c = await f.create({ title: "Download policy", status: "published" });
  const photo = await f.upload(c.id);
  const other = await f.create({
    title: "Other collection",
    status: "published",
  });
  const foreign = await f.upload(other.id);
  await f.call(
    `/api/admin/collections/${c.id}`,
    "PATCH",
    {
      settings: { downloadEnabled: false },
    },
    f.admin,
  );
  assert.equal(
    (
      await f.call(`/api/gallery/${c.slug}/download`, "POST", {
        photoIds: [photo.id],
        size: "original",
      })
    ).status,
    403,
  );
  await f.call(
    `/api/admin/collections/${c.id}`,
    "PATCH",
    {
      settings: {
        downloadEnabled: true,
        downloadPin: "2468",
        downloadEmailRequired: true,
        downloadSizes: ["original", "1024"],
      },
    },
    f.admin,
  );
  assert.notEqual(
    (
      await f.call(`/api/gallery/${c.slug}/download`, "POST", {
        photoIds: [photo.id],
        pin: "bad",
        email: "guest@example.com",
      })
    ).status,
    200,
  );
  const invalid = await f.call(`/api/gallery/${c.slug}/download`, "POST", {
    photoIds: [foreign.id],
    pin: "2468",
    email: "guest@example.com",
    size: "original",
  });
  assert.ok(
    invalid.status >= 400,
    "foreign collection image must not be exported",
  );
  const result = await f.call(`/api/gallery/${c.slug}/download`, "POST", {
    photoIds: [photo.id],
    pin: "2468",
    email: "guest@example.com",
    size: "original",
  });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.ok(result.body.url);
  const download = await fetch(new URL(result.body.url, f.base));
  assert.equal(download.status, 200);
  assert.ok((await download.arrayBuffer()).byteLength > 0);
});

test("Client private photos and favorites are isolated between guests", async (t) => {
  const f = await fixture(t);
  const c = await f.create({ title: "Proofing", status: "published" });
  const publicPhoto = await f.upload(c.id);
  const privatePhoto = await f.upload(c.id, 160, 100, "private.jpg");
  await f.call(
    `/api/admin/photos/${privatePhoto.id}`,
    "PATCH",
    { private: true },
    f.admin,
  );
  const gallery = await f.call(`/api/gallery/${c.slug}`);
  assert.deepEqual(
    gallery.body.photos.map((p) => p.id),
    [publicPhoto.id],
  );
  assert.notEqual((await fetch(new URL(privatePhoto.url, f.base))).status, 200);
  const route = `/api/gallery/${c.slug}/favorites`;
  const first = await f.call(route + "/session", "POST", {
    email: "same@example.com",
  });
  const second = await f.call(route + "/session", "POST", {
    email: "same@example.com",
  });
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  const selection = await f.call(
    route,
    "POST",
    {
      name: "Album choices",
      photoIds: [publicPhoto.id, privatePhoto.id],
      notes: { [publicPhoto.id]: "Keep this one" },
      completed: true,
    },
    first.cookie,
  );
  assert.equal(selection.status, 200);
  assert.deepEqual(selection.body.photoIds, [publicPhoto.id]);
  const own = await f.call(route, "GET", undefined, first.cookie);
  assert.equal(own.body.length, 1);
  assert.equal(own.body[0].notes[publicPhoto.id], "Keep this one");
  const foreign = await f.call(route, "GET", undefined, second.cookie);
  assert.deepEqual(
    foreign.body,
    [],
    "typing the same email cannot read another guest session",
  );
  assert.equal(
    (
      await f.call(
        `${route}/${selection.body.id}`,
        "PATCH",
        { name: "Stolen" },
        second.cookie,
      )
    ).status,
    404,
  );
  const adminLists = await f.call(
    `/api/admin/collections/${c.id}/favorite-lists`,
    "GET",
    undefined,
    f.admin,
  );
  assert.equal(adminLists.body[0].email, "same@example.com");
});

test("Client expiry, registration, pre-release and homepage policies are enforced", async (t) => {
  const f = await fixture(t);
  const c = await f.create({ title: "Registration", status: "published" });
  const p = await f.upload(c.id);
  await f.call(
    `/api/admin/collections/${c.id}`,
    "PATCH",
    { settings: { emailRegistration: true } },
    f.admin,
  );
  assert.equal((await f.call(`/api/gallery/${c.slug}`)).status, 403);
  assert.notEqual((await fetch(new URL(p.url, f.base))).status, 200);
  const registration = await f.call(`/api/gallery/${c.slug}/register`, "POST", {
    email: "guest@example.com",
  });
  assert.equal(registration.status, 200);
  assert.equal(
    (
      await f.call(
        `/api/gallery/${c.slug}`,
        "GET",
        undefined,
        registration.cookie,
      )
    ).status,
    200,
  );
  await f.call(
    `/api/admin/collections/${c.id}`,
    "PATCH",
    { settings: { expiry: "2000-01-01" } },
    f.admin,
  );
  assert.equal(
    (
      await f.call(
        `/api/gallery/${c.slug}`,
        "GET",
        undefined,
        registration.cookie,
      )
    ).status,
    404,
  );
  await f.call(
    `/api/admin/collections/${c.id}`,
    "PATCH",
    { status: "pre-release", settings: { expiry: "" } },
    f.admin,
  );
  const prerelease = await f.call(`/api/gallery/${c.slug}`);
  assert.equal(prerelease.body.status, "pre-release");
  assert.deepEqual(prerelease.body.photos, []);
  assert.equal(
    (
      await f.call(`/api/gallery/${c.slug}/subscribe`, "POST", {
        email: "guest@example.com",
        consent: false,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await f.call(`/api/gallery/${c.slug}/subscribe`, "POST", {
        email: "guest@example.com",
        consent: true,
      })
    ).status,
    200,
  );
  await f.call(
    "/api/admin/settings",
    "PATCH",
    { homepagePassword: "home-secret" },
    f.admin,
  );
  assert.equal((await f.call("/api/homepage")).status, 401);
  const home = await f.call("/api/homepage/unlock", "POST", {
    password: "home-secret",
  });
  assert.equal(home.status, 200);
  assert.equal(
    (await f.call("/api/homepage", "GET", undefined, home.cookie)).status,
    200,
  );
  await f.call(
    "/api/admin/settings",
    "PATCH",
    { homepagePassword: "home-secret-changed" },
    f.admin,
  );
  assert.equal(
    (await f.call("/api/homepage", "GET", undefined, home.cookie)).status,
    401,
    "changing homepage password revokes existing unlock sessions",
  );
  await f.call(
    "/api/admin/settings",
    "PATCH",
    { homepageEnabled: false },
    f.admin,
  );
  assert.equal(
    (await f.call("/api/homepage", "GET", undefined, home.cookie)).status,
    404,
  );
});

test("Client original downloads preserve PNG bytes and resized exports preserve proportions", async (t) => {
  const f = await fixture(t);
  const c = await f.create({ title: "Original delivery", status: "published" });
  const original = await sharp({
    create: {
      width: 1800,
      height: 1200,
      channels: 4,
      background: { r: 40, g: 90, b: 65, alpha: 0.5 },
    },
  })
    .png()
    .toBuffer();
  const form = new FormData();
  form.append(
    "files",
    new Blob([original], { type: "image/png" }),
    "original.png",
  );
  const uploaded = await fetch(
    `${f.base}/api/admin/collections/${c.id}/photos`,
    {
      method: "POST",
      headers: { cookie: f.admin },
      body: form,
    },
  );
  assert.equal(uploaded.status, 201);
  await uploaded.arrayBuffer();
  await f.call(
    `/api/admin/collections/${c.id}`,
    "PATCH",
    {
      settings: {
        downloadSizes: ["original", "640"],
        downloadEmailRequired: false,
      },
    },
    f.admin,
  );
  const originalJob = await f.call(`/api/gallery/${c.slug}/download`, "POST", {
    size: "original",
  });
  assert.equal(originalJob.status, 200);
  const delivered = await fetch(new URL(originalJob.body.url, f.base));
  assert.deepEqual(
    Buffer.from(await delivered.arrayBuffer()),
    original,
    "original means uploaded bytes",
  );
  const resizedJob = await f.call(`/api/gallery/${c.slug}/download`, "POST", {
    size: "640",
  });
  const resized = await fetch(new URL(resizedJob.body.url, f.base));
  const meta = await sharp(Buffer.from(await resized.arrayBuffer())).metadata();
  assert.equal(meta.width, 640);
  assert.equal(meta.height, 427);
});

test("Client gallery ZIP keeps duplicate filenames distinct", async (t) => {
  const f = await fixture(t);
  const c = await f.create({ title: "ZIP delivery", status: "published" });
  await f.upload(c.id, 100, 150, "same.jpg");
  await f.upload(c.id, 150, 100, "same.jpg");
  const job = await f.call(`/api/gallery/${c.slug}/download`, "POST", {
    size: "original",
    email: "guest@example.com",
  });
  assert.equal(job.status, 200);
  const res = await fetch(new URL(job.body.url, f.base));
  const zip = Buffer.from(await res.arrayBuffer());
  assert.equal(res.status, 200);
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  assert.ok(zip.includes(Buffer.from("0001-same.jpg")));
  assert.ok(zip.includes(Buffer.from("0002-same.jpg")));
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(end > 0);
  assert.equal(zip.readUInt16LE(end + 10), 2);
});

test("Client upload normalizes EXIF rotation and rejects disguised non-images", async (t) => {
  const f = await fixture(t);
  const c = await f.create({ title: "Image validation", status: "published" });
  const rotated = await sharp({
    create: { width: 160, height: 100, channels: 3, background: "#8c9b6c" },
  })
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer();
  const form = new FormData();
  form.append(
    "files",
    new Blob([rotated], { type: "image/jpeg" }),
    "phone.jpg",
  );
  const res = await fetch(`${f.base}/api/admin/collections/${c.id}/photos`, {
    method: "POST",
    headers: { cookie: f.admin },
    body: form,
  });
  assert.equal(res.status, 201);
  await res.arrayBuffer();
  const gallery = await f.call(`/api/gallery/${c.slug}`);
  assert.equal(gallery.body.photos[0].width, 100);
  assert.equal(gallery.body.photos[0].height, 160);
  const fake = new FormData();
  fake.append(
    "files",
    new Blob(["<script>alert(1)</script>"], { type: "image/jpeg" }),
    "fake.jpg",
  );
  const invalid = await fetch(
    `${f.base}/api/admin/collections/${c.id}/photos`,
    {
      method: "POST",
      headers: { cookie: f.admin },
      body: fake,
    },
  );
  assert.ok(invalid.status >= 400, "invalid image rejected");
  await invalid.arrayBuffer();
  assert.equal((await f.call(`/api/gallery/${c.slug}`)).body.photos.length, 1);
});

test("Client share email reports delivery only after SMTP success", async (t) => {
  const sent = [];
  const f = await fixture(t, {
    mailer: {
      sendMail: async (message) => {
        sent.push(message);
      },
    },
  });
  const c = await f.create({
    title: "Share <script>unsafe</script>",
    status: "published",
  });
  const share = await f.call(
    `/api/admin/collections/${c.id}/share`,
    "POST",
    {
      emails: ["one@example.com", "two@example.com"],
      subject: "Your collection",
      message: "Welcome <script>never execute</script>",
    },
    f.admin,
  );
  assert.equal(share.status, 200);
  assert.equal(share.body.sent, 2);
  assert.equal(sent.length, 2);
  assert.equal(sent[0].to, "one@example.com");
  assert.ok(sent[0].text.includes("/g/" + c.slug));
  assert.ok(!sent[0].html.includes("<script>"));
  assert.ok(sent[0].html.includes("&lt;script&gt;"));
  const activity = await f.call(
    `/api/admin/activity?collectionId=${c.id}`,
    "GET",
    undefined,
    f.admin,
  );
  assert.equal(activity.body.filter((a) => a.type === "email.sent").length, 2);
  const missing = await fixture(t);
  const unsent = await missing.create({
    title: "No SMTP",
    status: "published",
  });
  assert.equal(
    (
      await missing.call(
        `/api/admin/collections/${unsent.id}/share`,
        "POST",
        {
          emails: ["guest@example.com"],
        },
        missing.admin,
      )
    ).status,
    503,
  );
});

test("Client credentials are not exposed and repeated bad sign-ins are limited", async (t) => {
  const f = await fixture(t, { secureCookies: true });
  const c = await f.create({
    title: "No secret exposure",
    status: "published",
  });
  await f.call(
    `/api/admin/collections/${c.id}`,
    "PATCH",
    { settings: { password: "hidden-gallery-secret", downloadPin: "9351" } },
    f.admin,
  );
  const config = await f.call(
    `/api/admin/collections/${c.id}`,
    "GET",
    undefined,
    f.admin,
  );
  assert.equal(config.body.settings.passwordSet, true);
  assert.equal(config.body.settings.downloadPinRequired, true);
  assert.equal(config.body.settings.passwordHash, undefined);
  assert.equal(config.body.settings.downloadPinHash, undefined);
  assert.ok(!JSON.stringify(config.body).includes("hidden-gallery-secret"));
  const login = await f.call("/api/admin/login", "POST", {
    password: "client-test-password-long",
  });
  assert.match(login.headers.get("set-cookie"), /HttpOnly/);
  assert.match(login.headers.get("set-cookie"), /Secure/);
  assert.match(login.headers.get("set-cookie"), /SameSite=Lax/);
  for (let i = 0; i < 10; i++)
    await f.call("/api/admin/login", "POST", { password: "incorrect" });
  assert.equal(
    (await f.call("/api/admin/login", "POST", { password: "incorrect" }))
      .status,
    429,
  );
});

test("Client favorite preset limits apply to new guest sessions", async (t) => {
  const f = await fixture(t);
  const c = await f.create({ title: "Limited proofing", status: "published" });
  const a = await f.upload(c.id);
  const b = await f.upload(c.id, 150, 100, "second.jpg");
  const preset = await f.call(
    `/api/admin/collections/${c.id}/favorite-lists`,
    "POST",
    {
      name: "Choose one print",
      selectionLimit: 1,
    },
    f.admin,
  );
  assert.equal(preset.status, 201);
  const route = `/api/gallery/${c.slug}/favorites`;
  const signIn = await f.call(route + "/session", "POST", {
    email: "guest@example.com",
  });
  const lists = await f.call(route, "GET", undefined, signIn.cookie);
  assert.equal(lists.body.length, 1);
  assert.equal(lists.body[0].selectionLimit, 1);
  const id = lists.body[0].id;
  assert.equal(
    (
      await f.call(
        route + "/" + id,
        "PATCH",
        { photoIds: [a.id, b.id] },
        signIn.cookie,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await f.call(
        route + "/" + id,
        "PATCH",
        { photoIds: [a.id] },
        signIn.cookie,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await f.call(
        route + "/" + id,
        "PATCH",
        { photoIds: [a.id, b.id] },
        signIn.cookie,
      )
    ).status,
    400,
    "saving a limited list must not discard its limit",
  );
});

test("Client replace, copy and move preserve collection isolation", async (t) => {
  const f = await fixture(t);
  const c = await f.create({ title: "Source", status: "published" });
  const other = await f.create({ title: "Destination", status: "published" });
  const photo = await f.upload(c.id);
  const copied = await f.call(
    `/api/admin/photos/${photo.id}/copy`,
    "POST",
    { collectionId: other.id },
    f.admin,
  );
  assert.equal(copied.status, 201);
  assert.notEqual(copied.body.id, photo.id);
  const replacement = await sharp({
    create: { width: 90, height: 60, channels: 3, background: "#876364" },
  })
    .png()
    .toBuffer();
  const form = new FormData();
  form.append(
    "file",
    new Blob([replacement], { type: "image/png" }),
    "replacement.png",
  );
  const changed = await fetch(
    `${f.base}/api/admin/photos/${photo.id}/replace`,
    { method: "POST", headers: { cookie: f.admin }, body: form },
  );
  assert.equal(changed.status, 200);
  const updated = await changed.json();
  assert.equal(updated.id, photo.id);
  assert.equal(updated.width, 90);
  assert.equal(updated.height, 60);
  const untouched = await f.call(
    `/api/admin/collections/${other.id}`,
    "GET",
    undefined,
    f.admin,
  );
  assert.equal(
    untouched.body.photos[0].width,
    120,
    "replacing one copy must not alter another",
  );
  const moved = await f.call(
    `/api/admin/photos/${photo.id}/copy`,
    "POST",
    { collectionId: other.id, move: true },
    f.admin,
  );
  assert.equal(moved.status, 200);
  assert.equal((await f.call(`/api/gallery/${c.slug}`)).body.photos.length, 0);
  assert.equal(
    (await f.call(`/api/gallery/${other.slug}`)).body.photos.length,
    2,
  );
});

test("Client embeds restrict providers and bulk collection creation is atomic", async (t) => {
  const f = await fixture(t);
  const c = await f.create({ title: "Embeds", status: "published" });
  const endpoint = `/api/admin/collections/${c.id}/embed`;
  assert.equal(
    (
      await f.call(
        endpoint,
        "POST",
        { url: "https://evil.example/watch?v=abc" },
        f.admin,
      )
    ).status,
    400,
  );
  const good = await f.call(
    endpoint,
    "POST",
    { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", title: "Film" },
    f.admin,
  );
  assert.equal(good.status, 201);
  assert.equal(good.body.type, "embed");
  assert.equal(
    good.body.url,
    "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
  );
  const bulk = await f.call(
    "/api/admin/collections/bulk",
    "POST",
    { collections: [{ title: "Team A" }, { title: "Team B" }] },
    f.admin,
  );
  assert.equal(bulk.status, 201);
  assert.equal(bulk.body.length, 2);
  const before = (
    await f.call("/api/admin/collections", "GET", undefined, f.admin)
  ).body.length;
  const invalid = await f.call(
    "/api/admin/collections/bulk",
    "POST",
    { collections: [{ title: "Must roll back" }, { slug: "invalid slug" }] },
    f.admin,
  );
  assert.equal(invalid.status, 400);
  assert.equal(
    (await f.call("/api/admin/collections", "GET", undefined, f.admin)).body
      .length,
    before,
  );
});

test("Client campaigns respect subscriptions and signed unsubscribe links", async (t) => {
  const sent = [];
  const f = await fixture(t, {
    mailer: {
      sendMail: async (message) => {
        sent.push(message);
      },
    },
  });
  const c = await f.create({ title: "Release news", status: "published" });
  await f.call(`/api/gallery/${c.slug}/subscribe`, "POST", {
    email: "subscriber@example.com",
    consent: true,
  });
  const campaign = await f.call(
    "/api/admin/campaigns",
    "POST",
    {
      name: "Gallery ready",
      collectionId: c.id,
      message: "Your photos are ready.",
    },
    f.admin,
  );
  assert.equal(campaign.status, 201);
  const deliver = await f.call(
    `/api/admin/campaigns/${campaign.body.id}/send`,
    "POST",
    {},
    f.admin,
  );
  assert.equal(deliver.status, 200);
  assert.equal(deliver.body.sent, 1);
  assert.equal(sent.length, 1);
  assert.equal(
    (
      await f.call(
        `/api/admin/campaigns/${campaign.body.id}/send`,
        "POST",
        {},
        f.admin,
      )
    ).status,
    409,
  );
  const link = sent[0].text.match(/Unsubscribe: (\S+)/)[1];
  const route = new URL(link).pathname;
  assert.equal((await f.call(route)).status, 200);
  assert.equal((await f.call(route + "tampered", "POST", {})).status, 404);
  assert.equal((await f.call(route, "POST", {})).status, 200);
  const second = await f.call(
    "/api/admin/campaigns",
    "POST",
    { name: "Second", collectionId: c.id },
    f.admin,
  );
  const result = await f.call(
    `/api/admin/campaigns/${second.body.id}/send`,
    "POST",
    {},
    f.admin,
  );
  assert.equal(result.status, 200);
  assert.equal(result.body.sent, 0);
  assert.equal(sent.length, 1);
});

test("Client watermarks change previews while preserving original downloads", async (t) => {
  const f = await fixture(t);
  const c = await f.create({ title: "Watermarked", status: "published" });
  const photo = await f.upload(c.id, 600, 400);
  const before = Buffer.from(
    await (await fetch(new URL(photo.url, f.base))).arrayBuffer(),
  );
  await f.call(
    "/api/admin/settings",
    "PATCH",
    {
      watermarks: [
        {
          id: "test-mark",
          name: "Studio mark",
          type: "text",
          text: "In Moment",
          opacity: 80,
          scale: 30,
          position: "bottom-right",
        },
      ],
    },
    f.admin,
  );
  await f.call(
    `/api/admin/collections/${c.id}`,
    "PATCH",
    { settings: { watermarkId: "test-mark" } },
    f.admin,
  );
  const marked = await fetch(new URL(photo.url, f.base));
  assert.equal(marked.status, 200);
  const after = Buffer.from(await marked.arrayBuffer());
  assert.notDeepEqual(after, before);
  const meta = await sharp(after).metadata();
  assert.equal(meta.width, 600);
  assert.equal(meta.height, 400);
  const download = await f.call(`/api/gallery/${c.slug}/download`, "POST", {
    size: "original",
    email: "guest@example.com",
  });
  const original = Buffer.from(
    await (await fetch(new URL(download.body.url, f.base))).arrayBuffer(),
  );
  const stats = await sharp(original).stats();
  assert.equal(
    stats.channels[0].min,
    stats.channels[0].max,
    "original uniform photograph stays unwatermarked",
  );
});

test("Client disabled feature flags remain boolean in public settings", async (t) => {
  const f = await fixture(t);
  const c = await f.create({ title: "Disabled controls", status: "published" });
  const flags = {
    downloadEnabled: false,
    favoritesEnabled: false,
    favoriteNotes: false,
    slideshow: false,
    socialSharing: false,
    emailRegistration: false,
    homepageVisible: false,
  };
  await f.call(
    `/api/admin/collections/${c.id}`,
    "PATCH",
    { settings: flags },
    f.admin,
  );
  const publicView = await f.call(`/api/gallery/${c.slug}`);
  assert.equal(publicView.status, 200);
  for (const [key, value] of Object.entries(flags))
    assert.equal(publicView.body.settings[key], value, key);
  assert.equal(
    (
      await f.call(`/api/gallery/${c.slug}/favorites/session`, "POST", {
        email: "guest@example.com",
      })
    ).status,
    403,
  );
});

test("Client favorite recovery requires the emailed single-use token", async (t) => {
  const sent = [];
  const f = await fixture(t, {
    mailer: { sendMail: async (message) => sent.push(message) },
  });
  const c = await f.create({
    title: "Recover selections",
    status: "published",
  });
  const other = await f.create({ title: "Other gallery", status: "published" });
  const p = await f.upload(c.id);
  const route = `/api/gallery/${c.slug}/favorites`;
  const original = await f.call(route + "/session", "POST", {
    email: "owner@example.com",
  });
  await f.call(
    route,
    "POST",
    { name: "My album", photoIds: [p.id] },
    original.cookie,
  );
  const absent = await f.call(route + "/recover", "POST", {
    email: "unknown@example.com",
  });
  const known = await f.call(route + "/recover", "POST", {
    email: "owner@example.com",
  });
  assert.deepEqual(
    known.body,
    absent.body,
    "responses do not reveal whether email owns lists",
  );
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "owner@example.com");
  const link = sent[0].text.match(/https?:\/\/\S+/)[0];
  const token = new URL(link).searchParams.get("recover");
  assert.ok(token);
  assert.ok(!JSON.stringify(known.body).includes(token));
  assert.equal(
    (
      await f.call(`/api/gallery/${other.slug}/favorites/verify`, "POST", {
        token,
      })
    ).status,
    400,
  );
  assert.equal(
    (await f.call(route + "/verify", "POST", { token: "invalid" })).status,
    400,
  );
  const recovered = await f.call(route + "/verify", "POST", { token });
  assert.equal(recovered.status, 200);
  assert.ok(recovered.cookie);
  const lists = await f.call(route, "GET", undefined, recovered.cookie);
  assert.equal(lists.body.length, 1);
  assert.deepEqual(lists.body[0].photoIds, [p.id]);
  assert.equal(
    (await f.call(route + "/verify", "POST", { token })).status,
    400,
    "token cannot be reused",
  );
});

test("Client admin originals require authentication and bypass resized preview", async (t) => {
  const f = await fixture(t);
  const c = await f.create({ title: "Admin original" });
  const p = await f.upload(c.id, 2400, 1800);
  const route = `/api/admin/photos/${p.id}/original`;
  assert.equal((await fetch(f.base + route)).status, 401);
  const response = await fetch(f.base + route, {
    headers: { cookie: f.admin },
  });
  assert.equal(response.status, 200);
  const meta = await sharp(
    Buffer.from(await response.arrayBuffer()),
  ).metadata();
  assert.equal(meta.width, 2400);
  assert.equal(meta.height, 1800);
});

test("Client gallery and selected downloads have independent flags and per-email allowances", async (t) => {
  const f = await fixture(t);
  const c = await f.create({
    title: "Download allowances",
    status: "published",
  });
  const p = await f.upload(c.id);
  const route = `/api/gallery/${c.slug}/download`;
  const patch = (settings) =>
    f.call(`/api/admin/collections/${c.id}`, "PATCH", { settings }, f.admin);
  await patch({ galleryDownloadEnabled: false, singleDownloadEnabled: true });
  assert.equal(
    (
      await f.call(route, "POST", {
        size: "original",
        email: "guest@example.com",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await f.call(route, "POST", {
        photoIds: [p.id],
        size: "original",
        email: "guest@example.com",
      })
    ).status,
    200,
  );
  await patch({ galleryDownloadEnabled: true, singleDownloadEnabled: false });
  assert.equal(
    (
      await f.call(route, "POST", {
        photoIds: [p.id],
        size: "original",
        email: "guest@example.com",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await f.call(route, "POST", {
        size: "original",
        email: "guest@example.com",
      })
    ).status,
    200,
  );
  await patch({ downloadLimit: 1, downloadLimitPerEmail: true });
  assert.equal(
    (
      await f.call(route, "POST", {
        size: "original",
        email: "first@example.com",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await f.call(route, "POST", {
        size: "original",
        email: "first@example.com",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await f.call(route, "POST", {
        size: "original",
        email: "second@example.com",
      })
    ).status,
    200,
  );
});

test("Client maintenance deduplicates expiry reminders and preserves copied media during trash purge", async (t) => {
  const sent = [];
  const f = await fixture(t, {
    mailer: { sendMail: async (message) => sent.push(message) },
  });
  const c = await f.create({ title: "Expiring soon", status: "published" });
  const p = await f.upload(c.id);
  const expiry = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  await f.call(
    `/api/admin/collections/${c.id}`,
    "PATCH",
    { settings: { expiry, autoExpiryReminder: true } },
    f.admin,
  );
  await f.call(`/api/gallery/${c.slug}/register`, "POST", {
    email: "guest@example.com",
  });
  await f.call(`/api/gallery/${c.slug}/subscribe`, "POST", {
    email: "guest@example.com",
    consent: true,
  });
  await f.client.maintenance();
  await f.client.maintenance();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "guest@example.com");
  assert.ok(sent[0].text.includes(expiry));
  const other = await f.create({ title: "Keep copy", status: "published" });
  await f.call(
    `/api/admin/photos/${p.id}/copy`,
    "POST",
    { collectionId: other.id },
    f.admin,
  );
  const storage = f.client.db
    .prepare("SELECT storage FROM photos WHERE id=?")
    .get(p.id).storage;
  const source = path.join(f.dataDir, "originals", storage);
  fs.utimesSync(
    source,
    new Date(Date.now() - 3 * 86400000),
    new Date(Date.now() - 3 * 86400000),
  );
  f.client.db
    .prepare("UPDATE collections SET deletedAt=? WHERE id=?")
    .run(Date.now() - 31 * 86400000, c.id);
  await f.client.maintenance();
  assert.equal(
    f.client.db.prepare("SELECT id FROM collections WHERE id=?").get(c.id),
    undefined,
  );
  assert.ok(
    fs.existsSync(source),
    "shared original remains while another collection references it",
  );
  assert.equal(
    (await f.call(`/api/gallery/${other.slug}`)).body.photos.length,
    1,
  );
  f.client.db
    .prepare("UPDATE collections SET deletedAt=? WHERE id=?")
    .run(Date.now() - 31 * 86400000, other.id);
  await f.client.maintenance();
  assert.equal(
    fs.existsSync(source),
    false,
    "unreferenced old original is cleaned after purge",
  );
});

test("Client watermarked web downloads and zero-opacity previews honor their settings", async (t) => {
  const f = await fixture(t);
  const c = await f.create({
    title: "Watermark settings",
    status: "published",
  });
  const p = await f.upload(c.id, 600, 400);
  const definition = {
    id: "mark",
    type: "text",
    name: "Mark",
    text: "In Moment",
    opacity: 100,
    scale: 40,
    position: "center",
  };
  await f.call(
    "/api/admin/settings",
    "PATCH",
    { watermarks: [definition] },
    f.admin,
  );
  await f.call(
    `/api/admin/collections/${c.id}`,
    "PATCH",
    {
      settings: {
        watermarkId: "mark",
        watermarkDownloads: true,
        downloadSizes: ["original", "640"],
      },
    },
    f.admin,
  );
  const download = await f.call(`/api/gallery/${c.slug}/download`, "POST", {
    size: "640",
    email: "guest@example.com",
  });
  const bytes = Buffer.from(
    await (await fetch(new URL(download.body.url, f.base))).arrayBuffer(),
  );
  const stats = await sharp(bytes).stats();
  assert.ok(
    stats.channels[0].max > stats.channels[0].min,
    "watermark changes uniform resized photo",
  );
  await f.call(
    "/api/admin/settings",
    "PATCH",
    { watermarks: [{ ...definition, opacity: 0 }] },
    f.admin,
  );
  const invisible = Buffer.from(
    await (await fetch(new URL(p.url, f.base))).arrayBuffer(),
  );
  const zero = await sharp(invisible).stats();
  assert.equal(
    zero.channels[0].max,
    zero.channels[0].min,
    "opacity zero means invisible",
  );
});

test("Client bulk sharing validates all collections before sending mapped links", async (t) => {
  const sent = [];
  const f = await fixture(t, {
    mailer: { sendMail: async (message) => sent.push(message) },
  });
  const a = await f.create({ title: "Family A", status: "published" });
  const b = await f.create({ title: "Family B", status: "published" });
  const draft = await f.create({ title: "Unfinished" });
  const invalid = await f.call(
    "/api/admin/collections/bulk-share",
    "POST",
    {
      items: [
        { id: a.id, emails: ["a@example.com"] },
        { id: draft.id, emails: ["b@example.com"] },
      ],
    },
    f.admin,
  );
  assert.equal(invalid.status, 400);
  assert.equal(sent.length, 0);
  const result = await f.call(
    "/api/admin/collections/bulk-share",
    "POST",
    {
      message: "Your photographs",
      items: [
        { id: a.id, emails: ["a@example.com"] },
        { id: b.id, emails: ["b@example.com"] },
      ],
    },
    f.admin,
  );
  assert.equal(result.status, 200);
  assert.equal(result.body.sent, 2);
  assert.ok(sent[0].text.includes("/g/" + a.slug));
  assert.ok(!sent[0].text.includes("/g/" + b.slug));
  assert.ok(sent[1].text.includes("/g/" + b.slug));
  assert.equal(sent[1].to, "b@example.com");
});
