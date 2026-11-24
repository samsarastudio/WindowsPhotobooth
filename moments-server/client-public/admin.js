/* In Moment Client Studio — buildless administrator application. */
const $ = (q, root = document) => root.querySelector(q);
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const safeUrl = (value) =>
  /^(https?:\/\/|\/)/i.test(String(value || "")) &&
  !String(value).startsWith("//")
    ? esc(value)
    : "";
const api = async (path, data, method = "GET") => {
  const res = await fetch("/api/admin" + path, {
    method,
    credentials: "same-origin",
    headers:
      data instanceof FormData ? {} : { "Content-Type": "application/json" },
    body:
      data === undefined
        ? undefined
        : data instanceof FormData
          ? data
          : JSON.stringify(data),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && path !== "/login") login();
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return body;
};
const state = {
  view: "collections",
  collections: [],
  settings: {},
  collection: null,
  tab: "photos",
  section: "general",
  setId: "",
  search: "",
  status: "all",
  sort: "newest",
  list: false,
  palette: "Light",
  mobile: false,
};
const palette = {
  Light: ["#fff", "#272b25"],
  Gold: ["#fbf6e9", "#6b5a37"],
  Rose: ["#f6eeee", "#694f54"],
  Terracotta: ["#ecd8ca", "#5d3c30"],
  Sand: ["#eee9df", "#574e42"],
  Olive: ["#e3e6da", "#4a523c"],
  Agave: ["#dce7e2", "#39534b"],
  Sea: ["#e3ebed", "#3c5964"],
  Dark: ["#222", "#fff"],
};
const covers = [
  "Center",
  "Joy",
  "Left",
  "Novel",
  "Vintage",
  "Frame",
  "Stripe",
  "Divider",
  "Journal",
  "Stamp",
  "Outline",
  "Classic",
  "Split",
  "Label",
  "Border",
  "Album",
  "None",
  "Cliff",
  "Cedar",
  "Breeze",
  "Aero",
  "Surf",
  "Cosmos",
  "Reef",
  "Bondi",
  "West",
  "Oakwood",
  "Edge",
  "Anchor",
  "Love",
];
const navs = [
  ["collections", "▦", "Collections"],
  ["library", "▧", "Photo library"],
  ["starred", "☆", "Starred"],
  ["trash", "♧", "Trash"],
  ["homepage", "⌂", "Homepage"],
  ["settings", "⚙", "Settings"],
  ["activity", "◷", "Activity"],
  ["marketing", "✉", "Marketing"],
];
const list = (value) =>
  Array.isArray(value)
    ? value
    : value?.items || value?.collections || value?.photos || [];
const notify = (message) => {
  $("#toast").textContent = message;
  $("#toast").classList.add("show");
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => $("#toast").classList.remove("show"), 4200);
};
const error = (err) => notify(err.message || String(err));
const dateLabel = (value) =>
  value
    ? new Date(
        /^\d{4}-\d{2}-\d{2}$/.test(value) ? value + "T12:00:00" : value,
      ).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "No event date";
const field = (name, label, value = "", type = "text", hint = "") =>
  `<label class="field"><span>${esc(label)}</span><input name="${esc(name)}" type="${type}" value="${esc(value)}">${hint ? `<p class="hint">${esc(hint)}</p>` : ""}</label>`;
const textarea = (name, label, value = "", hint = "") =>
  `<label class="field"><span>${esc(label)}</span><textarea name="${esc(name)}">${esc(value)}</textarea>${hint ? `<p class="hint">${esc(hint)}</p>` : ""}</label>`;
const select = (name, label, value, options) =>
  `<label class="field"><span>${esc(label)}</span><select name="${esc(name)}">${options
    .map((o) => {
      const [v, t] = Array.isArray(o) ? o : [o, o];
      return `<option value="${esc(v)}" ${String(v).toLowerCase() === String(value).toLowerCase() ? "selected" : ""}>${esc(t)}</option>`;
    })
    .join("")}</select></label>`;
const toggle = (name, label, on, hint = "") =>
  `<label class="switch-row"><span>${esc(label)}${hint ? `<small>${esc(hint)}</small>` : ""}</span><input type="checkbox" name="${esc(name)}" ${on ? "checked" : ""}></label>`;
const empty = (title, description, action = "") =>
  `<div class="empty"><div class="empty-mark">◇</div><h2>${esc(title)}</h2><p>${esc(description)}</p>${action}</div>`;
function shell(content, title = "Client Gallery") {
  $("#app").innerHTML =
    `<input id="asset-picker" class="hidden" type="file" accept="image/*"><input id="folder-picker" class="hidden" type="file" webkitdirectory multiple accept="image/*,video/mp4,video/webm"><div class="studio"><aside class="sidebar"><a class="brand" href="/admin">inmoment<span>CLIENT STUDIO</span></a><div class="nav-label">Your workspace</div><nav class="nav">${navs.map(([id, icon, label]) => `<button data-action="nav" data-view="${id}" class="${state.view === id ? "active" : ""}"><span class="glyph" aria-hidden="true">${icon}</span>${label}</button>`).join("")}</nav><div class="sidebar-foot">Beautifully delivered.<br>Every moment, together.</div></aside><div class="main"><header class="topbar"><small>Client Gallery / ${esc(title)}</small><div class="account"><span class="avatar">I</span><span>${esc(state.settings.brandName || "In Moment")}</span><button class="quiet small" data-action="logout">Sign out</button></div></header><main class="content">${content}</main></div></div>`;
}
function login(message = "") {
  $("#app").innerHTML =
    `<div class="login"><section class="login-art"><a class="brand" href="/">inmoment<span>CLIENT STUDIO</span></a><div><div class="eyebrow">Made for the moments that matter</div><h1>Your photographs.<br>Their memories.</h1><p>A thoughtful home for every collection, from first selection to the final delivery.</p></div><small>IN MOMENT PHOTOGRAPHY</small></section><section class="login-form"><form data-form="login"><div class="eyebrow">Welcome to your studio</div><h1>A beautiful delivery<br>starts here.</h1><p class="muted">Sign in to manage your client collections.</p>${message ? `<div class="error">${esc(message)}</div>` : ""}${field("password", "Studio password", "", "password")}<button class="primary">Enter studio →</button></form></section></div>`;
}
async function start() {
  try {
    await api("/me");
    state.settings = await api("/settings");
    await navigate("collections");
  } catch (e) {
    login();
  }
}
async function navigate(view) {
  state.view = view;
  state.collection = null;
  state.search = "";
  state.section = view === "settings" ? "branding" : "general";
  if (["collections", "starred", "trash"].includes(view)) {
    state.collections = list(await api("/collections?includeDeleted=true"));
    renderCollections();
  } else if (view === "library") {
    await renderLibrary();
  } else if (view === "activity") {
    await renderActivity();
  } else if (view === "settings") {
    renderSettings();
  } else if (view === "homepage") {
    renderHomepage();
  } else if (view === "marketing") {
    await renderMarketing();
  }
}
function renderCollections() {
  let collections = state.collections.filter((c) =>
    state.view === "trash"
      ? c.deletedAt
      : !c.deletedAt && (state.view !== "starred" || c.starred),
  );
  collections = collections.filter(
    (c) =>
      (state.status === "all" || c.status === state.status) &&
      `${c.title} ${(c.tags || []).join(" ")}`
        .toLowerCase()
        .includes(state.search.toLowerCase()),
  );
  collections.sort((a, b) =>
    state.sort === "name"
      ? a.title.localeCompare(b.title)
      : state.sort === "event"
        ? String(b.date || "").localeCompare(String(a.date || ""))
        : String(b.createdAt || b.id).localeCompare(
            String(a.createdAt || a.id),
          ),
  );
  const title =
    state.view === "trash"
      ? "Trash"
      : state.view === "starred"
        ? "Starred collections"
        : "Your collections";
  shell(
    `<div class="heading"><div><div class="eyebrow">Thoughtfully organized</div><h1>${title}</h1><p class="muted">${state.view === "trash" ? "Restore a collection to bring it back to your studio." : "A home for every story. Ready when your clients are."}</p></div><div class="actions"><button data-action="nav-presets">Presets</button><button data-action="bulk-import">Import CSV</button><button data-action="folder-import">Upload folders</button><button data-action="bulk-share">Bulk delivery</button><button class="primary" data-action="new-collection">＋ New collection</button></div></div><div class="toolbar"><input type="search" id="collection-search" placeholder="Search collections or tags" aria-label="Search collections" value="${esc(state.search)}"><select id="status-filter" aria-label="Filter status">${["all", "draft", "published", "hidden", "pre-release"].map((v) => `<option ${v === state.status ? "selected" : ""}>${v}</option>`).join("")}</select><select id="sort-filter" aria-label="Sort collections">${[
      ["newest", "Newest first"],
      ["event", "Event date"],
      ["name", "Name A–Z"],
    ]
      .map(
        ([v, t]) =>
          `<option value="${v}" ${v === state.sort ? "selected" : ""}>${t}</option>`,
      )
      .join(
        "",
      )}</select><button class="icon" data-action="list-toggle" aria-label="Toggle list view">${state.list ? "▦" : "☷"}</button></div><div class="${state.list ? "list-mode" : ""}">${collections.length ? `<div class="cards">${collections.map(collectionCard).join("")}</div>` : empty("Room for a new story", state.view === "trash" ? "No collections in the trash." : "Create a collection, upload your photographs and make it your own.", state.view === "collections" ? '<button class="primary" data-action="new-collection">Create your first collection</button>' : "")}</div>`,
    "Collections",
  );
}
function collectionCard(c) {
  const cover =
    c.coverUrl ||
    c.photos?.find((p) => p.id === c.coverId)?.thumbnailUrl ||
    c.photos?.[0]?.thumbnailUrl;
  return `<article class="card"><button class="card-open" data-action="${state.view === "trash" ? "restore" : "open"}" data-id="${esc(c.id)}">${cover ? `<img class="cover" src="${safeUrl(cover)}" alt="${esc(c.title)}" loading="lazy">` : '<div class="cover-empty">◇</div>'}<div class="card-body"><div class="card-title">${esc(c.title)}</div><div class="card-meta"><span>${c.photoCount ?? c.photos?.length ?? 0} photos</span><span>${esc(dateLabel(c.date))}</span></div>${state.view === "trash" ? '<p class="hint">Click to restore</p>' : ""}</div></button><span class="pill card-status ${esc(c.status)}">${esc(c.status)}</span>${state.view !== "trash" ? `<button class="star ${c.starred ? "on" : ""}" data-action="star-collection" data-id="${esc(c.id)}" aria-label="${c.starred ? "Unstar" : "Star"} collection">${c.starred ? "★" : "☆"}</button>` : ""}</article>`;
}
function modal(title, body, foot = "") {
  const d = $("#dialog");
  d.classList.remove("cover-picker-dialog");
  d.innerHTML = `<div class="modal-head"><h2>${esc(title)}</h2><button class="quiet icon" data-action="close-modal" aria-label="Close dialog">×</button></div><div class="modal-body">${body}</div>${foot ? `<div class="modal-foot">${foot}</div>` : ""}`;
  d.showModal();
}
async function newCollection() {
  const presets = list(await api("/presets"));
  state.availablePresets = presets;
  modal(
    "A new collection",
    `<form id="new-collection" data-form="new-collection">${field("title", "Collection name")}${field("date", "Event date", "", "date")}${select("presetId", "Start from a preset", "", [["", "Custom collection"], ...presets.map((p) => [p.id, p.name])])}<p class="hint">Your collection starts as a draft. Publish it when you are ready to share.</p></form>`,
    `<button data-action="close-modal">Cancel</button><button class="primary" form="new-collection">Create collection</button>`,
  );
}
async function openCollection(id) {
  state.collection = await api("/collections/" + encodeURIComponent(id));
  state.view = "collections";
  state.tab = "photos";
  state.setId = "";
  renderCollection();
}
function renderCollection() {
  const c = state.collection;
  const page =
    state.tab === "photos"
      ? photosPage()
      : state.tab === "design"
        ? designPage()
        : state.tab === "settings"
          ? collectionSettings()
          : state.tab === "activity"
            ? '<div id="activity-holder"></div>'
            : "";
  shell(
    `<button class="quiet back" data-action="nav" data-view="collections">← All collections</button><div class="heading"><div><div class="collection-title"><h1>${esc(c.title)}</h1><span class="pill ${esc(c.status)}">${esc(c.status)}</span></div><p class="muted">${esc(dateLabel(c.date))} · ${c.photos?.length || 0} photograph${c.photos?.length === 1 ? "" : "s"}</p></div><div class="actions"><button data-action="collection-more">More ···</button><a class="button-link" href="/g/${encodeURIComponent(c.slug)}" target="_blank" rel="noopener">Preview ↗</a><button class="primary" data-action="share">Share collection</button></div></div><nav class="tabs">${["photos", "design", "settings", "activity"].map((t) => `<button data-action="collection-tab" data-tab="${t}" class="${t === state.tab ? "active" : ""}">${t[0].toUpperCase() + t.slice(1)}</button>`).join("")}</nav>${page}`,
    c.title,
  );
  if (state.tab === "activity") loadCollectionActivity();
}
function photosPage() {
  const c = state.collection;
  const photos = (c.photos || [])
    .filter((p) => !state.setId || p.setId === state.setId)
    .sort((a, b) => (a.position || 0) - (b.position || 0));
  return `<div class="workspace"><aside><div class="eyebrow">Photo sets</div><div class="set-nav"><button class="${!state.setId ? "active" : ""}" data-action="set" data-id="">All photographs <span class="set-count">${c.photos?.length || 0}</span></button>${(c.sets || []).map((s) => `<button class="${state.setId === s.id ? "active" : ""}" data-action="set" data-id="${esc(s.id)}">${esc(s.name)}<span class="set-count">${c.photos.filter((p) => p.setId === s.id).length}</span></button>`).join("")}<button data-action="new-set">＋ Add set</button>${state.setId ? '<button data-action="edit-set">Edit this set ···</button>' : ""}</div></aside><div><div class="dropzone" id="dropzone"><button data-action="upload" class="primary">＋ Add photographs</button><input id="photo-files" class="hidden" type="file" accept="image/*,video/mp4,video/webm" multiple><button class="quiet" data-action="embed-video">Embed video</button><p>Drag photographs or videos here. Your originals stay intact.</p><div id="upload-status" aria-live="polite"></div></div>${photos.length ? `<div class="photo-grid">${photos.map(photoCard).join("")}</div>` : empty("The beginning of a collection", "Add your photographs to start shaping this story.")}</div></div>`;
}
function photoCard(p) {
  return `<article class="photo-card">${p.type === "embed" ? `<div class="cover-empty" style="height:170px;font-size:30px">▷</div>` : p.type === "video" ? `<video src="${safeUrl(p.url)}" preload="metadata"></video>` : `<img src="${safeUrl(p.thumbnailUrl || p.url)}" alt="${esc(p.caption || p.filename)}" loading="lazy">`}<button data-action="photo-menu" data-id="${esc(p.id)}" aria-label="Options for ${esc(p.filename)}">···</button>${p.private ? '<span class="photo-flag">Private</span>' : p.starred ? '<span class="photo-flag">★</span>' : ""}<div class="photo-label" title="${esc(p.filename)}">${esc(p.filename)}</div></article>`;
}
async function upload(files) {
  if (!files.length) return;
  const out = $("#upload-status");
  out.innerHTML =
    '<p>Uploading… Keep this window open.</p><div class="progress"><i></i></div>';
  const c = state.collection;
  try {
    for (let i = 0; i < files.length; i++) {
      const f = new FormData();
      f.append("files", files[i]);
      if (state.setId) f.append("setId", state.setId);
      await api("/collections/" + c.id + "/photos", f, "POST");
      if (out.isConnected) {
        out.querySelector("p").textContent =
          `Uploaded ${i + 1} of ${files.length}`;
        out.querySelector("i").style.width =
          ((i + 1) / files.length) * 100 + "%";
      }
    }
    state.collection = await api("/collections/" + c.id);
    renderCollection();
    notify(`${files.length} file${files.length === 1 ? "" : "s"} uploaded`);
  } catch (e) {
    if (out.isConnected)
      out.innerHTML = `<p class="error">${esc(e.message)}. Files already uploaded are saved. Refresh before retrying remaining files.</p>`;
    else error(e);
  }
}
function designChoice(name, value, current, visual, label = value) {
  return `<label class="design-choice"><input type="radio" name="${name}" value="${esc(value)}" ${String(value).toLowerCase() === String(current).toLowerCase() ? "checked" : ""}><span class="choice-art">${visual}</span><span class="choice-label">${esc(label)}</span></label>`;
}
function designPage() {
  const c = state.collection,
    d = c.design || {},
    photos = (c.photos || []).filter((p) => !p.type || p.type === "image"),
    cover = photos.find((p) => p.id === c.coverId) || photos[0];
  const thumb = cover
    ? `<img class="design-cover-image" src="${safeUrl(cover.thumbnailUrl || cover.url)}" alt="">`
    : "";
  const styles = covers
    .map((n) =>
      designChoice(
        "coverStyle",
        n,
        d.coverStyle || "Outline",
        `<span class="cover-mini mini-${n.toLowerCase()}">${thumb}<span class="mini-title">TITLE</span></span>`,
      ),
    )
    .join("");
  const fonts = {
    Sans: "Arial",
    Serif: "Georgia",
    Modern: "Trebuchet MS",
    Timeless: "Georgia",
    Bold: "Arial Black",
    Subtle: "Palatino Linotype",
  };
  const type = Object.entries(fonts)
    .map(([name, font]) =>
      designChoice(
        "typography",
        name,
        d.typography || "Timeless",
        `<span class="type-sample" style="font-family:${font}">Aa<span>Beautiful moments</span></span>`,
      ),
    )
    .join("");
  const colors = Object.entries(palette)
    .map(([name, values]) =>
      designChoice(
        "palette",
        name,
        d.palette || "Light",
        `<span class="color-sample" style="background:${values[0]};color:${values[1]}"><span>Aa</span><i style="background:${values[1]}"></i></span>`,
      ),
    )
    .join("");
  const segment = (name, current, options) =>
    `<div class="design-segments">${options.map(([value, label]) => `<label><input type="radio" name="${name}" value="${value}" ${value === current ? "checked" : ""}><span>${label}</span></label>`).join("")}</div>`;
  return `<div class="design-studio"><nav class="design-navigation" aria-label="Design settings">${[
    ["cover", "▧", "Cover"],
    ["type", "T", "Typography"],
    ["color", "◉", "Color"],
    ["grid", "▦", "Grid"],
  ]
    .map(
      ([id, icon, label], i) =>
        `<button type="button" data-action="design-section" data-section="${id}" class="${i === 0 ? "active" : ""}"><span>${icon}</span>${label}</button>`,
    )
    .join(
      "",
    )}</nav><form data-form="design" class="design-controls"><input type="hidden" name="coverId" value="${esc(cover?.id || "")}"><section data-design-section="cover"><div class="design-section-heading"><h2>Cover</h2><button type="button" class="design-link" data-action="choose-cover">▧ Cover Photo</button><button type="button" class="design-link" data-action="cover-focal">◎ Focal</button></div><button type="button" class="selected-cover" data-action="choose-cover">${thumb}<span>Change cover photo</span></button><div id="focal-controls" hidden><p class="hint">Position the photograph inside the cover.</p><label class="field">Horizontal<input type="range" name="focalX" min="0" max="100" value="${d.focalX ?? 50}"></label><label class="field">Vertical<input type="range" name="focalY" min="0" max="100" value="${d.focalY ?? 50}"></label></div><div class="design-choices cover-choices">${styles}</div></section><section data-design-section="type" hidden><h2>Typography</h2><p class="hint">Choose the character of your collection.</p><div class="design-choices">${type}</div></section><section data-design-section="color" hidden><h2>Color</h2><p class="hint">A palette for your photographs.</p><div class="design-choices">${colors}</div></section><section data-design-section="grid" hidden><h2>Grid</h2><h3>Grid style</h3>${segment(
    "layout",
    d.layout || "vertical",
    [
      ["vertical", "▥ Vertical"],
      ["horizontal", "▤ Horizontal"],
    ],
  )}<h3>Thumbnail size</h3>${segment(
    "thumbnailSize",
    d.thumbnailSize || "regular",
    [
      ["regular", "Regular"],
      ["large", "Large"],
    ],
  )}<h3>Grid spacing</h3>${segment("spacing", d.spacing || "regular", [
    ["regular", "Regular"],
    ["large", "Large"],
  ])}<h3>Navigation style</h3>${segment("navigation", d.navigation || "icons", [
    ["icons", "Icons only"],
    ["text", "Icons & text"],
  ])}</section><div class="design-save"><span id="design-save-state">Preview changes before saving</span><button class="primary">Save design</button></div></form><div class="design-preview-stage"><div class="preview-frame ${state.mobile ? "mobile" : ""}"><iframe id="design-preview" title="Live collection design preview" src="/g/${encodeURIComponent(c.slug)}?studio-preview=1"></iframe></div><div class="preview-bar"><button type="button" class="quiet small" data-action="preview-device" data-mobile="false">▱ Desktop</button><button type="button" class="quiet small" data-action="preview-device" data-mobile="true">▯ Mobile</button></div></div></div>`;
}
function coverPicker() {
  const selected = $("form[data-form=design]").elements.coverId.value;
  const photos = (state.collection.photos || []).filter(
    (p) => !p.type || p.type === "image",
  );
  modal(
    "Choose cover photo",
    `<p class="muted">Choose a photograph from this collection. Your selection updates the preview immediately.</p><div class="cover-photo-picker">${photos.map((p) => `<button type="button" data-action="select-cover-photo" data-id="${esc(p.id)}" aria-label="Choose ${esc(p.filename)}" aria-pressed="${p.id === selected}"><img src="${safeUrl(p.thumbnailUrl || p.url)}" alt="${esc(p.filename)}" loading="lazy"><span>${esc(p.filename)}</span>${p.id === selected ? "<b>✓ Selected</b>" : ""}</button>`).join("") || "<p>Add photographs to choose a cover.</p>"}</div>`,
  );
  $("#dialog").classList.add("cover-picker-dialog");
}
function collectionSettings() {
  const c = state.collection,
    s = c.settings || {};
  const menus = ["general", "privacy", "download", "favorites"];
  let content = "";
  if (state.section === "general")
    content = `${field("title", "Collection name", c.title)}${field("slug", "Gallery URL", c.slug)}${field("date", "Event date", c.date || "", "date")}${select(
      "status",
      "Availability",
      c.status,
      [
        ["draft", "Draft · not shared"],
        ["published", "Published"],
        ["hidden", "Hidden"],
        ["pre-release", "Pre-release · collect interest"],
      ],
    )}${textarea("description", "Introduction", c.description)}${field("tags", "Category tags", (c.tags || []).join(", "), "text", "Separate tags with commas.")}${field("expiry", "Collection expiry", s.expiry || "", "date")}${select("watermarkId", "Watermark", s.watermarkId || "", [["", "No watermark"], ...(state.settings.watermarks || []).map((w) => [w.id, w.name])])}${toggle("watermarkDownloads", "Apply watermark to resized downloads", s.watermarkDownloads)}${toggle("galleryAssist", "Gallery guide", s.galleryAssist !== false, "Offer a short guide to viewing, favorites and downloads.")}${toggle("autoExpiryReminder", "Email expiry reminders", s.autoExpiryReminder, "Remind registered visitors before the collection expires. Requires SMTP.")}${toggle("emailRegistration", "Email registration", s.emailRegistration, "Ask visitors to register before browsing.")}${toggle("slideshow", "Slideshow", s.slideshow !== false)}${toggle("socialSharing", "Share controls", s.socialSharing !== false)}${toggle("homepageVisible", "Show on homepage", s.homepageVisible !== false)}`;
  if (state.section === "privacy")
    content = `<p class="muted">Control who can see this collection.</p><div class="notice">${s.passwordSet ? "A collection password is set. Leave the field blank to keep it." : "No collection password is set."}</div>${field("password", "New collection password", "", "password")}${toggle("removePassword", "Remove collection password", false)}${field("clientPassword", "New client exclusive-access password", "", "password", s.clientPasswordSet ? "Client access password is set. Leave blank to keep it." : "Optional. Lets your client view private photographs.")}${toggle("removeClientPassword", "Remove client access password", false)}${textarea("allowedEmails", "Allowed downloader email addresses", (s.allowedEmails || []).join("\n"), "Restricts downloads, not viewing. One per line; empty allows all.")}<p class="hint">Mark individual photographs private using their photo menu.</p>`;
  if (state.section === "download")
    content = `${toggle("downloadEnabled", "Allow photo downloads", s.downloadEnabled !== false)}${toggle("galleryDownloadEnabled", "Full-gallery downloads", s.galleryDownloadEnabled !== false)}${toggle("singleDownloadEnabled", "Individual photo downloads", s.singleDownloadEnabled !== false)}${toggle("videoDownloadEnabled", "Video downloads", s.videoDownloadEnabled !== false)}${toggle("downloadLimitPerEmail", "Apply allowance per email", s.downloadLimitPerEmail)}${toggle("downloadEmailRequired", "Record downloader email", s.downloadEmailRequired !== false, "Visitors can keep their email saved on this device.")}${field("downloadPin", "New download PIN", "", "text", s.downloadPinRequired ? "A PIN is set. Leave blank to keep it." : "Optional four-digit PIN.")}${toggle("removeDownloadPin", "Remove download PIN", false)}${field("downloadLimit", "Download limit", s.downloadLimit || 0, "number", "0 means no limit.")}<label class="field"><span>Available sizes</span><div class="check-list">${["original", "3600", "2048", "1024", "640"].map((n) => `<label><input type="checkbox" name="downloadSizes" value="${n}" ${(s.downloadSizes || ["original", "2048"]).includes(n) ? "checked" : ""}>${n === "original" ? "Original resolution" : n + " px"}</label>`).join("")}</div></label><label class="field"><span>Downloadable sets</span><div class="check-list">${(c.sets || []).map((set) => `<label><input type="checkbox" name="downloadSetIds" value="${esc(set.id)}" ${(s.downloadSetIds || []).includes(set.id) ? "checked" : ""}>${esc(set.name)}</label>`).join("")}</div><p class="hint">No selections means all sets.</p></label>`;
  if (state.section === "favorites")
    content = `${toggle("favoritesEnabled", "Allow favorite lists", s.favoritesEnabled !== false)}${toggle("favoriteNotes", "Allow notes on favorites", s.favoriteNotes !== false)}<div class="notice">Clients can save selections and share their lists with you. Create a preset list to guide their selection.</div><button type="button" data-action="favorite-lists">Manage selection lists</button>`;
  return `<div class="settings-layout"><nav class="settings-menu">${menus.map((m) => `<button data-action="section" data-section="${m}" class="${m === state.section ? "active" : ""}">${m[0].toUpperCase() + m.slice(1)}</button>`).join("")}</nav><form data-form="collection-settings" class="panel"><h2>${state.section[0].toUpperCase() + state.section.slice(1)}</h2>${content}<div class="actions" style="margin-top:24px"><button class="primary">Save changes</button></div></form></div>`;
}
async function renderLibrary() {
  state.library = list(await api("/library"));
  const photos = state.library.filter((p) =>
    `${p.filename} ${p.caption || ""}`
      .toLowerCase()
      .includes(state.search.toLowerCase()),
  );
  shell(
    `<div class="heading"><div><div class="eyebrow">Across every collection</div><h1>Photo library</h1><p class="muted">Find the photograph you had in mind.</p></div><span class="pill">${state.library.length} photographs</span></div><div class="toolbar"><input type="search" id="library-search" placeholder="Search filename or caption" value="${esc(state.search)}" aria-label="Search library"></div>${photos.length ? `<div class="photo-grid">${photos.map(photoCard).join("")}</div>` : empty("Your photographs, together", "Images from your collections will appear here.")}`,
    "Photo library",
  );
}
function renderSettings() {
  const s = state.settings;
  const section = state.section;
  let content = "";
  if (section === "branding")
    content = `<form data-form="global-settings"><h2>Your signature</h2><p class="muted">Carry your identity through every collection.</p>${field("brandName", "Studio name", s.brandName || "In Moment")}${assetField("logoUrl", "Studio logo", s.logoUrl || "")}${assetField("coverLogoUrl", "Cover logo", s.coverLogoUrl || "")}${assetField("faviconUrl", "Favicon", s.faviconUrl || "")}<label class="field"><span>Public gallery domain</span><input value="${esc(location.origin)}" readonly><p class="hint">Configured by CLIENT_PUBLIC_URL and the Cloudflare tunnel on your server.</p></label><button class="primary">Save branding</button></form>`;
  if (section === "preferences")
    content = `<form data-form="global-settings"><h2>Preferences</h2>${select("defaultLanguage", "Default language", s.defaultLanguage || "en", [["en", "English"]])}${toggle("showFilenames", "Display filenames", s.showFilenames)}${toggle("searchEngineVisible", "Search engine visibility", s.searchEngineVisible, "Allow indexing of public collections.")}${toggle("sharpening", "Sharpen web previews", s.sharpening)}${toggle("cookieBanner", "Cookie notice", s.cookieBanner)}${textarea("terms", "Terms of service", s.terms || "")}${textarea("privacy", "Privacy statement", s.privacy || "")}<button class="primary" style="margin-top:20px">Save preferences</button></form>`;
  if (section === "watermarks")
    content = `<div class="panel-head"><div><h2>Watermarks</h2><p class="muted">Your signature on delivered previews.</p></div><button data-action="new-watermark">＋ Add watermark</button></div>${(s.watermarks || []).length ? (s.watermarks || []).map((w, i) => `<div class="watermark-row"><div><strong>${esc(w.name)}</strong><p class="hint">${esc(w.text || w.imageUrl || "Image watermark")} · ${esc(w.opacity ?? 50)}% opacity</p></div><div class="actions"><button class="small" data-action="edit-watermark" data-index="${i}">Edit</button><button class="small danger" data-action="delete-watermark" data-index="${i}">Remove</button></div></div>`).join("") : empty("Add a signature", "Create a text or image watermark to use with your collections.")}`;
  if (section === "presets" || section === "templates")
    content = '<div id="resources-holder"></div>';
  shell(
    `<div class="heading"><div><div class="eyebrow">Make the studio yours</div><h1>Settings</h1><p class="muted">Consistent details. Beautiful delivery.</p></div></div><div class="settings-layout"><nav class="settings-menu">${["branding", "watermarks", "presets", "templates", "preferences"].map((n) => `<button data-action="global-section" data-section="${n}" class="${n === section ? "active" : ""}">${n === "templates" ? "Email templates" : n[0].toUpperCase() + n.slice(1)}</button>`).join("")}</nav><div class="panel">${content}</div></div>`,
    "Settings",
  );
  if (section === "presets" || section === "templates")
    renderResources(section);
}
async function renderResources(kind) {
  const data = list(await api("/" + kind));
  state.resources = data;
  const target = $("#resources-holder");
  if (!target) return;
  target.innerHTML = `<div class="panel-head"><div><h2>${kind === "presets" ? "Collection presets" : "Email templates"}</h2><p class="muted">Reuse the details you love.</p></div><button data-action="new-resource" data-kind="${kind}">＋ Add</button></div>${data.length ? data.map((r) => `<div class="resource-row"><div><strong>${esc(r.name)}</strong>${r.subject ? `<p class="hint">${esc(r.subject)}</p>` : ""}</div><div class="actions"><button class="small" data-action="edit-resource" data-kind="${kind}" data-id="${esc(r.id)}">Edit</button><button class="small danger" data-action="delete-resource" data-kind="${kind}" data-id="${esc(r.id)}">Delete</button></div></div>`).join("") : empty("Start with a favorite", kind === "presets" ? "Save a collection’s design and settings as a reusable starting point." : "Create a warm, personal delivery message to reuse.")}`;
}
function renderHomepage() {
  const s = state.settings;
  shell(
    `<div class="heading"><div><div class="eyebrow">Your public portfolio</div><h1>A home for your stories</h1><p class="muted">One link to the collections you choose to share.</p></div><a href="/" target="_blank" rel="noopener">Open homepage ↗</a></div><form data-form="homepage" class="panel" style="max-width:760px">${toggle("homepageEnabled", "Enable gallery homepage", s.homepageEnabled, "Only published collections marked visible will appear.")}${field("homepageTitle", "Heading", s.homepageTitle || s.brandName || "In Moment")}${textarea("homepageDescription", "Introduction", s.homepageDescription || "")}${select(
      "homepageSort",
      "Collection order",
      s.homepageSort || "newest",
      [
        ["newest", "Newest first"],
        ["event", "Event date"],
        ["name", "Name A–Z"],
      ],
    )}${field("homepagePassword", "New homepage password", "", "password", "Leave blank to keep the existing password. This is separate from collection passwords.")}${toggle("removeHomepagePassword", "Remove homepage password", false)}<button class="primary" style="margin-top:22px">Save homepage</button></form>`,
    "Homepage",
  );
}
async function renderActivity() {
  const activities = list(await api("/activity"));
  shell(
    `<div class="heading"><div><div class="eyebrow">The delivery journey</div><h1>Activity</h1><p class="muted">Downloads, registrations and client selections.</p></div></div>${activityTable(activities)}`,
    "Activity",
  );
}
async function loadCollectionActivity() {
  try {
    const items = list(
      await api("/activity?collectionId=" + state.collection.id),
    );
    const holder = $("#activity-holder");
    if (holder) holder.innerHTML = activityTable(items);
  } catch (e) {
    error(e);
  }
}
function activityTable(items) {
  return items.length
    ? `<div class="panel table-wrap"><table><thead><tr><th>Activity</th><th>Visitor</th><th>Collection</th><th>When</th></tr></thead><tbody>${items.map((a) => `<tr><td>${esc(a.type || a.action)}</td><td>${esc(a.email || "—")}</td><td>${esc(a.collectionTitle || a.collectionId || "—")}</td><td>${esc(new Date(a.createdAt || a.at).toLocaleString())}</td></tr>`).join("")}</tbody></table></div>`
    : empty(
        "The story is just beginning",
        "Client activity will appear here when your collections are shared.",
      );
}
async function share() {
  const c = state.collection;
  const templates = list(await api("/templates"));
  state.templates = templates;
  modal(
    "Share this collection",
    `<div class="notice">${c.status === "published" ? "This collection is published and ready to share." : "This collection is " + esc(c.status) + ". Change availability in Settings before delivering it to clients."}</div><label class="field"><span>Collection link</span><div class="link-box"><input id="share-link" readonly value="${esc(location.origin + "/g/" + encodeURIComponent(c.slug))}"><button type="button" data-action="copy-link">Copy</button></div></label><form id="share-form" data-form="share">${select("template", "Email template", "", [["", "Write a personal message"], ...templates.map((t) => [t.id, t.name])])}${textarea("emails", "Recipient email addresses", "", "Separate addresses with commas or new lines.")}${field("subject", "Subject", `Your photographs from ${c.title}`)}${textarea("message", "Message", `Your collection is ready. We hope you love these moments as much as we loved capturing them.`)}<p class="hint">Email delivery requires SMTP to be configured on your server.</p></form>`,
    `<button data-action="close-modal">Close</button><button class="primary" form="share-form">Send gallery email</button>`,
  );
}
function photoMenu(id) {
  const p = (state.collection?.photos || state.library || []).find(
    (p) => p.id === id,
  );
  if (!p) return;
  state.editPhoto = p;
  modal(
    "Photograph details",
    `<img src="${safeUrl(p.thumbnailUrl || p.url)}" alt="${esc(p.filename)}" style="width:100%;max-height:270px;object-fit:contain;background:#f0f2eb;border-radius:6px;margin-bottom:20px"><p class="hint">${esc(p.filename)} · ${p.width || "—"} × ${p.height || "—"}</p><form id="photo-form" data-form="photo">${field("filename", "Filename", p.filename)}${textarea("caption", "Caption", p.caption || "")}${state.collection ? select("setId", "Photo set", p.setId || "", [["", "No set"], ...(state.collection.sets || []).map((s) => [s.id, s.name])]) : ""}${field("position", "Display position", p.position || 0, "number")}${toggle("starred", "Star photograph", p.starred)}${toggle("private", "Private photograph", p.private)}</form><div class="actions" style="margin-top:16px">${state.collection ? '<button data-action="set-cover">Use as cover</button><button data-action="quick-share">Quick share</button><button data-action="copy-photo">Move / copy</button><button data-action="replace-photo">Replace</button><input id="replacement-file" type="file" accept="image/*" class="hidden">' : ""}<a href="/api/admin/photos/${encodeURIComponent(p.id)}/original" download="${esc(p.filename)}">Download original</a><button class="danger" data-action="delete-photo">Delete photo</button></div>`,
    `<button data-action="close-modal">Cancel</button><button class="primary" form="photo-form">Save details</button>`,
  );
}
function collectionMore() {
  modal(
    "Collection actions",
    `<div class="check-list"><button data-action="duplicate">Duplicate collection</button><button data-action="save-preset">Save as preset</button><button data-action="rename-collection">Edit collection details</button><button class="danger" data-action="trash-collection">Move to trash</button></div>`,
  );
}
function resourceModal(kind, id) {
  const r = state.resources?.find((r) => r.id === id) || {};
  state.editResource = { kind, id };
  modal(
    kind === "presets" ? "Collection preset" : "Email template",
    `<form id="resource-form" data-form="resource">${field("name", "Name", r.name || "")}${kind === "templates" ? field("subject", "Subject", r.subject || "") + textarea("message", "Message", r.message || "") : select("palette", "Color palette", r.design?.palette || "Light", Object.keys(palette)) + select("coverStyle", "Cover style", r.design?.coverStyle || "Outline", covers) + select("typography", "Typography", r.design?.typography || "Timeless", ["Sans", "Serif", "Modern", "Timeless", "Bold", "Subtle"]) + toggle("downloadEnabled", "Enable downloads", r.settings?.downloadEnabled !== false) + toggle("favoritesEnabled", "Enable favorites", r.settings?.favoritesEnabled !== false)}</form>`,
    `<button data-action="close-modal">Cancel</button><button class="primary" form="resource-form">Save</button>`,
  );
}
function watermarkModal(index) {
  const w = state.settings.watermarks?.[index] || {};
  state.watermarkIndex = index;
  modal(
    "Watermark",
    `<form id="watermark-form" data-form="watermark">${field("name", "Name", w.name || "")}${field("text", "Text", w.text || "")}${assetField("imageUrl", "Image watermark", w.imageUrl || "")}${field("opacity", "Opacity (%)", w.opacity ?? 45, "number")}${field("scale", "Size (%)", w.scale ?? 12, "number")}${select("position", "Position", w.position || "bottom-right", ["top-left", "top-center", "top-right", "center-left", "center", "center-right", "bottom-left", "bottom-center", "bottom-right"])}</form>`,
    `<button data-action="close-modal">Cancel</button><button class="primary" form="watermark-form">Save watermark</button>`,
  );
}
async function favoriteLists() {
  const lists = list(
    await api("/collections/" + state.collection.id + "/favorite-lists"),
  );
  modal(
    "Client selection lists",
    `${lists.map((l) => `<div class="resource-row"><div><strong>${esc(l.name)}</strong><p class="hint">${esc(l.email || "Preset list")} · ${(l.photoIds || []).length} selections${l.selectionLimit ? " / " + l.selectionLimit : ""}</p></div></div>`).join("") || '<p class="muted">No selections yet.</p>'}<h3 style="margin-top:22px">Create a preset selection list</h3><form id="favorite-form" data-form="favorite-list">${field("name", "List name")}${field("selectionLimit", "Selection limit", 0, "number")}</form>`,
    `<button data-action="close-modal">Close</button><button class="primary" form="favorite-form">Create list</button>`,
  );
}
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-action]");
  if (!b) return;
  const a = b.dataset.action;
  try {
    if (a === "nav") await navigate(b.dataset.view);
    if (a === "logout") {
      await api("/logout", {}, "POST");
      login();
    }
    if (a === "new-collection") await newCollection();
    if (a === "close-modal") $("#dialog").close();
    if (a === "open") await openCollection(b.dataset.id);
    if (a === "list-toggle") {
      state.list = !state.list;
      renderCollections();
    }
    if (a === "star-collection") {
      const c = state.collections.find((c) => c.id === b.dataset.id);
      await api("/collections/" + c.id, { starred: !c.starred }, "PATCH");
      c.starred = !c.starred;
      renderCollections();
    }
    if (a === "restore") {
      await api("/collections/" + b.dataset.id + "/restore", {}, "POST");
      await navigate("trash");
      notify("Collection restored");
    }
    if (a === "collection-tab") {
      state.tab = b.dataset.tab;
      state.section = "general";
      renderCollection();
    }
    if (a === "section") {
      state.section = b.dataset.section;
      renderCollection();
    }
    if (a === "set") {
      state.setId = b.dataset.id;
      renderCollection();
    }
    if (a === "upload") $("#photo-files").click();
    if (a === "new-set" || a === "edit-set") {
      const s = state.collection.sets?.find((s) => s.id === state.setId);
      state.editSet = a === "edit-set" ? s : null;
      modal(
        a === "new-set" ? "Add photo set" : "Edit photo set",
        `<form id="set-form" data-form="set">${field("name", "Set name", state.editSet?.name || "")}${textarea("description", "Description", state.editSet?.description || "")}</form>${state.editSet ? '<button class="danger" data-action="delete-set">Delete set</button>' : ""}`,
        `<button data-action="close-modal">Cancel</button><button class="primary" form="set-form">Save set</button>`,
      );
    }
    if (a === "delete-set") {
      if (
        !confirm(
          "Delete this set? Photographs should be moved out of the set by the server.",
        )
      )
        return;
      await api("/sets/" + state.editSet.id, undefined, "DELETE");
      $("#dialog").close();
      state.setId = "";
      state.collection = await api("/collections/" + state.collection.id);
      renderCollection();
    }
    if (a === "design-section") {
      document
        .querySelectorAll("[data-design-section]")
        .forEach(
          (section) =>
            (section.hidden =
              section.dataset.designSection !== b.dataset.section),
        );
      document
        .querySelectorAll('[data-action="design-section"]')
        .forEach((button) => button.classList.toggle("active", button === b));
    }
    if (a === "choose-cover") coverPicker();
    if (a === "cover-focal")
      $("#focal-controls").hidden = !$("#focal-controls").hidden;
    if (a === "select-cover-photo") {
      const photo = state.collection.photos.find((p) => p.id === b.dataset.id);
      if (!photo) return;
      $("form[data-form=design]").elements.coverId.value = photo.id;
      document
        .querySelectorAll(".design-cover-image")
        .forEach((img) => (img.src = photo.thumbnailUrl || photo.url));
      $("#dialog").close();
      sendDesignPreview();
    }
    if (a === "preview-device") {
      state.mobile = b.dataset.mobile === "true";
      $(".preview-frame")?.classList.toggle("mobile", state.mobile);
    }
    if (a === "palette") {
      const form = $("form[data-form=design]");
      form.elements.palette.value = b.dataset.value;
      sendDesignPreview();
      notify("Palette selected. Save design to apply.");
    }
    if (a === "share") await share();
    if (a === "copy-link") {
      await navigator.clipboard.writeText($("#share-link").value);
      notify("Collection link copied");
    }
    if (a === "photo-menu") photoMenu(b.dataset.id);
    if (a === "set-cover") {
      state.collection = await api(
        "/collections/" + state.collection.id,
        { coverId: state.editPhoto.id },
        "PATCH",
      );
      $("#dialog").close();
      renderCollection();
      notify("Cover updated");
    }
    if (a === "delete-photo") {
      if (!confirm("Delete this photograph from the collection?")) return;
      await api("/photos/" + state.editPhoto.id, undefined, "DELETE");
      $("#dialog").close();
      if (state.collection) {
        state.collection = await api("/collections/" + state.collection.id);
        renderCollection();
      } else await renderLibrary();
    }
    if (a === "collection-more") collectionMore();
    if (a === "duplicate") {
      const c = await api(
        "/collections/" + state.collection.id + "/duplicate",
        {},
        "POST",
      );
      $("#dialog").close();
      await openCollection(c.id);
      notify("Collection duplicated");
    }
    if (a === "trash-collection") {
      if (
        !confirm(
          "Move this collection to the trash? Its public link will stop working.",
        )
      )
        return;
      await api("/collections/" + state.collection.id, undefined, "DELETE");
      $("#dialog").close();
      await navigate("collections");
      notify("Collection moved to trash");
    }
    if (a === "rename-collection") {
      $("#dialog").close();
      state.tab = "settings";
      state.section = "general";
      renderCollection();
    }
    if (a === "save-preset") {
      modal(
        "Save collection preset",
        `<form id="save-preset-form" data-form="save-preset">${field("name", "Preset name", state.collection.title + " style")}</form>`,
        `<button data-action="close-modal">Cancel</button><button class="primary" form="save-preset-form">Save preset</button>`,
      );
    }
    if (a === "global-section") {
      state.section = b.dataset.section;
      renderSettings();
    }
    if (a === "nav-presets") {
      state.view = "settings";
      state.section = "presets";
      renderSettings();
    }
    if (a === "new-resource" || a === "edit-resource")
      resourceModal(b.dataset.kind, b.dataset.id);
    if (a === "delete-resource") {
      if (
        !confirm(
          "Delete this saved " +
            (b.dataset.kind === "presets" ? "preset" : "template") +
            "?",
        )
      )
        return;
      await api("/" + b.dataset.kind + "/" + b.dataset.id, undefined, "DELETE");
      await renderResources(b.dataset.kind);
    }
    if (a === "new-watermark" || a === "edit-watermark")
      watermarkModal(a === "new-watermark" ? -1 : Number(b.dataset.index));
    if (a === "delete-watermark") {
      if (!confirm("Remove this watermark from the library?")) return;
      const watermarks = [...(state.settings.watermarks || [])];
      watermarks.splice(Number(b.dataset.index), 1);
      state.settings = await api("/settings", { watermarks }, "PATCH");
      renderSettings();
    }
    if (a === "favorite-lists") await favoriteLists();
  } catch (err) {
    error(err);
  }
});
document.addEventListener("submit", async (e) => {
  const form = e.target;
  if (!form.dataset.form) return;
  e.preventDefault();
  const fd = new FormData(form),
    data = Object.fromEntries(fd),
    kind = form.dataset.form,
    button =
      form.querySelector("button[type=submit],button:not([type])") ||
      document.querySelector(`button[form="${form.id}"]`);
  if (button) button.disabled = true;
  try {
    if (kind === "login") {
      await api("/login", { password: data.password }, "POST");
      await start();
      return;
    }
    if (kind === "new-collection") {
      if (!data.title?.trim()) throw new Error("Please add a collection name.");
      const preset = state.availablePresets?.find(
        (p) => p.id === data.presetId,
      );
      const c = await api(
        "/collections",
        {
          ...data,
          ...(preset
            ? { settings: preset.settings, design: preset.design }
            : {}),
        },
        "POST",
      );
      $("#dialog").close();
      await openCollection(c.id);
      notify("Your collection is ready");
    }
    if (kind === "set") {
      if (!data.name?.trim()) throw new Error("Please name the set.");
      await api(
        state.editSet
          ? "/sets/" + state.editSet.id
          : "/collections/" + state.collection.id + "/sets",
        data,
        state.editSet ? "PATCH" : "POST",
      );
      $("#dialog").close();
      state.collection = await api("/collections/" + state.collection.id);
      renderCollection();
    }
    if (kind === "design") {
      const { coverId, ...design } = data;
      design.focalX = Math.max(0, Math.min(100, Number(design.focalX)));
      design.focalY = Math.max(0, Math.min(100, Number(design.focalY)));
      state.collection = await api(
        "/collections/" + state.collection.id,
        { coverId, design: { ...state.collection.design, ...design } },
        "PATCH",
      );
      renderCollection();
      notify("Design saved");
    }
    if (kind === "collection-settings") {
      const c = state.collection;
      const settings = { ...c.settings };
      let update = {};
      if (state.section === "general") {
        for (const k of ["title", "slug", "date", "status", "description"])
          update[k] = data[k];
        update.tags = data.tags
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        settings.expiry = data.expiry;
        settings.watermarkId = data.watermarkId;
        settings.watermarkDownloads = fd.has("watermarkDownloads");
        for (const k of [
          "emailRegistration",
          "slideshow",
          "socialSharing",
          "homepageVisible",
          "galleryAssist",
          "autoExpiryReminder",
        ])
          settings[k] = fd.has(k);
      }
      if (state.section === "privacy") {
        if (data.password) settings.password = data.password;
        if (data.clientPassword) settings.clientPassword = data.clientPassword;
        if (fd.has("removeClientPassword")) settings.clientPassword = "";
        if (fd.has("removePassword")) settings.password = "";
        settings.allowedEmails = data.allowedEmails
          .split(/[\n,;]/)
          .map((v) => v.trim())
          .filter(Boolean);
      }
      if (state.section === "download") {
        for (const k of [
          "downloadEnabled",
          "downloadEmailRequired",
          "galleryDownloadEnabled",
          "singleDownloadEnabled",
          "videoDownloadEnabled",
          "downloadLimitPerEmail",
        ])
          settings[k] = fd.has(k);
        if (data.downloadPin) settings.downloadPin = data.downloadPin;
        if (fd.has("removeDownloadPin")) settings.downloadPin = "";
        settings.downloadLimit = Math.max(0, Number(data.downloadLimit));
        settings.downloadSizes = fd.getAll("downloadSizes");
        settings.downloadSetIds = fd.getAll("downloadSetIds");
      }
      if (state.section === "favorites") {
        settings.favoritesEnabled = fd.has("favoritesEnabled");
        settings.favoriteNotes = fd.has("favoriteNotes");
      }
      state.collection = await api(
        "/collections/" + c.id,
        { ...update, settings },
        "PATCH",
      );
      renderCollection();
      notify("Collection settings saved");
    }
    if (kind === "global-settings" || kind === "homepage") {
      const update = { ...data };
      form
        .querySelectorAll("input[type=checkbox]")
        .forEach((i) => (update[i.name] = i.checked));
      if (kind === "homepage") {
        if (!data.homepagePassword) delete update.homepagePassword;
        if (fd.has("removeHomepagePassword")) update.homepagePassword = "";
        delete update.removeHomepagePassword;
      }
      state.settings = await api("/settings", update, "PATCH");
      kind === "homepage" ? renderHomepage() : renderSettings();
      notify("Settings saved");
    }
    if (kind === "share") {
      const emails = data.emails
        .split(/[\n,;]/)
        .map((v) => v.trim())
        .filter(Boolean);
      if (!emails.length) throw new Error("Add at least one recipient.");
      await api(
        "/collections/" + state.collection.id + "/share",
        { emails, subject: data.subject, message: data.message },
        "POST",
      );
      $("#dialog").close();
      notify("Gallery email sent");
    }
    if (kind === "photo") {
      data.starred = fd.has("starred");
      data.private = fd.has("private");
      data.position = Number(data.position) || 0;
      if (data.setId === "") delete data.setId;
      await api("/photos/" + state.editPhoto.id, data, "PATCH");
      $("#dialog").close();
      if (state.collection) {
        state.collection = await api("/collections/" + state.collection.id);
        renderCollection();
      } else await renderLibrary();
      notify("Photograph updated");
    }
    if (kind === "resource") {
      const { kind: resource, id } = state.editResource;
      const value =
        resource === "templates"
          ? data
          : {
              name: data.name,
              design: {
                palette: data.palette,
                coverStyle: data.coverStyle,
                typography: data.typography,
              },
              settings: {
                downloadEnabled: fd.has("downloadEnabled"),
                favoritesEnabled: fd.has("favoritesEnabled"),
              },
            };
      await api(
        "/" + resource + (id ? "/" + id : ""),
        value,
        id ? "PATCH" : "POST",
      );
      $("#dialog").close();
      await renderResources(resource);
      notify("Saved");
    }
    if (kind === "save-preset") {
      await api(
        "/presets",
        {
          name: data.name,
          settings: state.collection.settings,
          design: state.collection.design,
        },
        "POST",
      );
      $("#dialog").close();
      notify("Preset saved");
    }
    if (kind === "watermark") {
      const watermarks = [...(state.settings.watermarks || [])];
      data.opacity = Math.max(0, Math.min(100, Number(data.opacity)));
      data.scale = Math.max(1, Math.min(100, Number(data.scale)));
      data.id =
        state.settings.watermarks?.[state.watermarkIndex]?.id ||
        crypto.randomUUID();
      data.type = data.imageUrl ? "image" : "text";
      if (state.watermarkIndex < 0) watermarks.push(data);
      else watermarks[state.watermarkIndex] = data;
      state.settings = await api("/settings", { watermarks }, "PATCH");
      $("#dialog").close();
      renderSettings();
      notify("Watermark saved");
    }
    if (kind === "favorite-list") {
      await api(
        "/collections/" + state.collection.id + "/favorite-lists",
        { ...data, selectionLimit: Math.max(0, Number(data.selectionLimit)) },
        "POST",
      );
      $("#dialog").close();
      notify("Selection list created");
    }
  } catch (err) {
    if (kind === "login") login(err.message);
    else error(err);
  } finally {
    if (button) button.disabled = false;
  }
});
document.addEventListener("change", async (e) => {
  try {
    if (e.target.id === "photo-files") await upload([...e.target.files]);
    if (e.target.id === "status-filter") {
      state.status = e.target.value;
      renderCollections();
    }
    if (e.target.id === "sort-filter") {
      state.sort = e.target.value;
      renderCollections();
    }
    if (e.target.name === "template") {
      const t = state.templates?.find((t) => t.id === e.target.value);
      if (t) {
        const f = e.target.form;
        f.elements.subject.value = t.subject || "";
        f.elements.message.value = t.message || "";
      }
    }
  } catch (err) {
    error(err);
  }
});
let searchTimer;
document.addEventListener("input", (e) => {
  if (e.target.id === "collection-search" || e.target.id === "library-search") {
    state.search = e.target.value;
    const id = e.target.id,
      pos = e.target.selectionStart;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
      id === "collection-search" ? renderCollections() : await renderLibrary();
      const input = $("#" + id);
      input?.focus();
      input?.setSelectionRange(pos, pos);
    }, 250);
  }
});
document.addEventListener("dragover", (e) => {
  const dz = e.target.closest("#dropzone");
  if (dz) {
    e.preventDefault();
    dz.classList.add("drag");
  }
});
document.addEventListener("dragleave", (e) =>
  e.target.closest("#dropzone")?.classList.remove("drag"),
);
document.addEventListener("drop", (e) => {
  const dz = e.target.closest("#dropzone");
  if (dz) {
    e.preventDefault();
    dz.classList.remove("drag");
    upload([...e.dataTransfer.files]).catch(error);
  }
});
function assetField(name, label, value) {
  return `<label class="field"><span>${esc(label)}</span><div class="link-box"><input name="${name}" value="${esc(value)}" placeholder="Upload or paste an HTTPS image URL"><button type="button" data-action="asset-upload" data-target="${name}">Upload</button></div></label>`;
}
async function renderMarketing() {
  state.campaigns = list(await api("/campaigns"));
  const s = state.settings;
  shell(
    `<div class="heading"><div><div class="eyebrow">Keep the connection</div><h1>Marketing</h1><p class="muted">Thoughtful updates for people who asked to hear from you.</p></div><div class="actions"><button data-action="contacts">Subscribers</button><button class="primary" data-action="new-campaign">＋ New campaign</button></div></div><div class="panel"><h2>Email campaigns</h2>${state.campaigns.length ? state.campaigns.map((c) => `<div class="resource-row"><div><strong>${esc(c.name || c.subject)}</strong><p class="hint">${esc(c.subject || "Draft campaign")}</p></div><div class="actions"><button class="small" data-action="edit-campaign" data-id="${esc(c.id)}">Edit</button><button class="small" data-action="send-campaign" data-id="${esc(c.id)}">Send</button><button class="small danger" data-action="delete-campaign" data-id="${esc(c.id)}">Delete</button></div></div>`).join("") : empty("A personal note goes a long way", "Create a campaign for subscribers who opted in to collection updates.")}</div><form data-extra-form="marketing-settings" class="panel"><h2>Invite people to stay in touch</h2><p class="muted">Offer optional marketing signup alongside gallery interactions.</p>${toggle("emailRegistration", "Email registration", s.marketingOptIns?.emailRegistration)}${toggle("downloads", "Photo downloads", s.marketingOptIns?.downloads)}${toggle("favorites", "Favorites sign-in", s.marketingOptIns?.favorites)}${toggle("galleryPopup", "Gallery signup invitation", s.galleryPopup)}<button class="primary" style="margin-top:20px">Save opt-in settings</button></form>`,
    "Marketing",
  );
}
async function campaignModal(id) {
  const c = state.campaigns.find((c) => c.id === id) || {};
  state.editCampaignId = id;
  const collections = list(await api("/collections"));
  modal(
    "Email campaign",
    `<form id="campaign-form" data-extra-form="campaign">${field("name", "Campaign name", c.name || "")}${select(
      "collectionId",
      "Collection",
      c.collectionId || "",
      collections.filter((c) => !c.deletedAt).map((c) => [c.id, c.title]),
    )}${field("subject", "Subject", c.subject || "")}${textarea("message", "Message", c.message || "")}<p class="hint">Saving creates a draft. Sending is a separate action and requires configured SMTP.</p></form>`,
    `<button data-action="close-modal">Cancel</button><button class="primary" form="campaign-form">Save draft</button>`,
  );
}
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-action]");
  if (!b) return;
  const a = b.dataset.action;
  try {
    if (a === "asset-upload") {
      state.assetTarget = b.dataset.target;
      $("#asset-picker").click();
    }
    if (a === "new-campaign" || a === "edit-campaign")
      await campaignModal(b.dataset.id);
    if (a === "send-campaign") {
      if (
        !confirm(
          "Send this campaign to opted-in subscribers for its collection?",
        )
      )
        return;
      const c = state.campaigns.find((c) => c.id === b.dataset.id);
      await api(
        "/campaigns/" + b.dataset.id + "/send",
        {
          collectionId: c.collectionId,
          subject: c.subject,
          message: c.message,
        },
        "POST",
      );
      notify("Campaign sent");
      await renderMarketing();
    }
    if (a === "delete-campaign") {
      if (!confirm("Delete this campaign draft?")) return;
      await api("/campaigns/" + b.dataset.id, undefined, "DELETE");
      await renderMarketing();
    }
    if (a === "contacts") await contactsModal();
    if (a === "quick-share") {
      const result = await api(
        "/photos/" + state.editPhoto.id + "/share",
        {},
        "POST",
      );
      await navigator.clipboard.writeText(
        new URL(result.url, location.origin).href,
      );
      notify("Photo share link copied");
    }
    if (a === "remove-contact") {
      if (!confirm("Remove this subscriber from this collection?")) return;
      await api(
        "/contacts",
        { email: b.dataset.email, collectionId: b.dataset.collection },
        "DELETE",
      );
      await contactsModal();
    }
    if (a === "bulk-import")
      modal(
        "Create collections from CSV",
        `<form id="bulk-form" data-extra-form="bulk"><p class="muted">Upload a CSV with a <strong>title</strong> column. Optional columns: date, description, slug. Up to 100 collections per import, created as drafts.</p><input type="file" name="csv" accept=".csv,text/csv" required><p class="hint">Quoted fields and commas inside names are supported.</p></form>`,
        `<button data-action="close-modal">Cancel</button><button class="primary" form="bulk-form">Import collections</button>`,
      );
    if (a === "folder-import") $("#folder-picker").click();
    if (a === "cancel-folder") {
      state.cancelFolder = true;
      b.disabled = true;
      b.textContent = "Finishing current upload…";
    }
    if (a === "bulk-share")
      modal(
        "Deliver multiple collections",
        `<form id="bulk-share-form" data-extra-form="bulk-share"><p class="muted">Upload a CSV with <strong>slug,email</strong> columns. Each recipient receives the link to their collection. Collections must be published or in pre-release.</p><input type="file" name="csv" accept=".csv,text/csv" required>${field("subject", "Email subject", "Your photographs are ready")}${textarea("message", "Message", "Your collection is ready to view. Thank you for letting us capture these moments.")}<p class="hint">Review the confirmation before sending. SMTP must be configured.</p></form>`,
        `<button data-action="close-modal">Cancel</button><button class="primary" form="bulk-share-form">Review recipients</button>`,
      );
    if (a === "embed-video")
      modal(
        "Embed a video",
        `<form id="embed-form" data-extra-form="embed">${field("url", "YouTube or Vimeo URL", "", "url")}${field("title", "Video title")}</form>`,
        `<button data-action="close-modal">Cancel</button><button class="primary" form="embed-form">Add video</button>`,
      );
    if (a === "replace-photo") $("#replacement-file").click();
    if (a === "copy-photo") {
      const collections = list(await api("/collections"));
      modal(
        "Move or copy photograph",
        `<form id="copy-photo-form" data-extra-form="copy-photo">${select(
          "collectionId",
          "Destination collection",
          "",
          collections.filter((c) => !c.deletedAt).map((c) => [c.id, c.title]),
        )}${toggle("move", "Move instead of copy", false)}</form>`,
        `<button data-action="close-modal">Cancel</button><button class="primary" form="copy-photo-form">Continue</button>`,
      );
    }
  } catch (err) {
    error(err);
  }
});
document.addEventListener("change", async (e) => {
  if (e.target.id !== "asset-picker") return;
  try {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    const r = await api("/assets", fd, "POST");
    const input = document.querySelector(`[name="${state.assetTarget}"]`);
    if (input) input.value = r.url;
    notify("Image uploaded. Save settings to apply.");
  } catch (err) {
    error(err);
  }
});
document.addEventListener("submit", async (e) => {
  const form = e.target,
    kind = form.dataset.extraForm;
  if (!kind) return;
  e.preventDefault();
  const fd = new FormData(form),
    data = Object.fromEntries(fd);
  try {
    if (kind === "campaign") {
      await api(
        "/campaigns" + (state.editCampaignId ? "/" + state.editCampaignId : ""),
        data,
        state.editCampaignId ? "PATCH" : "POST",
      );
      $("#dialog").close();
      await renderMarketing();
      notify("Campaign draft saved");
    }
    if (kind === "marketing-settings") {
      const marketingOptIns = {};
      ["emailRegistration", "downloads", "favorites"].forEach(
        (k) => (marketingOptIns[k] = fd.has(k)),
      );
      state.settings = await api(
        "/settings",
        { marketingOptIns, galleryPopup: fd.has("galleryPopup") },
        "PATCH",
      );
      notify("Opt-in settings saved");
    }
    if (kind === "embed") {
      await api(
        "/collections/" + state.collection.id + "/embed",
        { ...data, setId: state.setId },
        "POST",
      );
      $("#dialog").close();
      state.collection = await api("/collections/" + state.collection.id);
      renderCollection();
    }
    if (kind === "copy-photo") {
      await api(
        "/photos/" + state.editPhoto.id + "/copy",
        { collectionId: data.collectionId, move: fd.has("move") },
        "POST",
      );
      $("#dialog").close();
      state.collection = await api("/collections/" + state.collection.id);
      renderCollection();
      notify(fd.has("move") ? "Photograph moved" : "Photograph copied");
    }
    if (kind === "bulk") {
      const file = fd.get("csv");
      if (!file?.size) throw new Error("Choose a CSV file.");
      const parsed = parseCSV(await file.text());
      const header = parsed.shift().map((x) =>
        x
          .replace(/^\uFEFF/, "")
          .trim()
          .toLowerCase(),
      );
      if (!header.includes("title"))
        throw new Error("The CSV needs a title column.");
      const collections = parsed
        .filter((r) => r.some((v) => v.trim()))
        .map((r) =>
          Object.fromEntries(
            header
              .map((h, i) => [h, r[i] || ""])
              .filter(([h]) =>
                ["title", "date", "description", "slug"].includes(h),
              ),
          ),
        );
      if (!collections.length || collections.length > 100)
        throw new Error("Import between 1 and 100 collections.");
      if (collections.some((c) => !c.title.trim()))
        throw new Error("Every row needs a collection title.");
      const result = await api("/collections/bulk", { collections }, "POST");
      $("#dialog").close();
      await navigate("collections");
      notify(`${collections.length} draft collections imported`);
    }
    if (kind === "bulk-share") {
      const file = fd.get("csv");
      if (!file?.size) throw new Error("Choose a CSV file.");
      const parsed = parseCSV(await file.text());
      const headers = parsed.shift().map((x) =>
        x
          .replace(/^\uFEFF/, "")
          .trim()
          .toLowerCase(),
      );
      if (!headers.includes("slug") || !headers.includes("email"))
        throw new Error("The CSV needs slug and email columns.");
      const collections = list(await api("/collections"));
      const byId = new Map();
      for (const row of parsed.filter((r) => r.some((v) => v.trim()))) {
        const slug = row[headers.indexOf("slug")]?.trim();
        const email = row[headers.indexOf("email")]?.trim();
        const c = collections.find((c) => c.slug === slug && !c.deletedAt);
        if (!c) throw new Error("Collection not found: " + slug);
        if (!["published", "pre-release"].includes(c.status))
          throw new Error(c.title + " is not published or in pre-release.");
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || ""))
          throw new Error("Invalid recipient for " + slug);
        if (!byId.has(c.id))
          byId.set(c.id, { id: c.id, title: c.title, emails: [] });
        if (!byId.get(c.id).emails.includes(email))
          byId.get(c.id).emails.push(email);
      }
      const items = [...byId.values()];
      if (!items.length) throw new Error("Add at least one recipient.");
      state.pendingBulkShare = {
        items,
        subject: data.subject,
        message: data.message,
      };
      modal(
        "Review delivery",
        `<p>${items.length} collections will be delivered to their assigned recipients.</p>${items.map((i) => `<div class="resource-row"><div><strong>${esc(i.title)}</strong><p class="hint">${esc(i.emails.join(", "))}</p></div></div>`).join("")}<form id="send-bulk-form" data-extra-form="send-bulk"><p class="hint">Subject: ${esc(data.subject)}</p></form>`,
        `<button data-action="close-modal">Cancel</button><button class="primary" form="send-bulk-form">Send collection emails</button>`,
      );
    }
    if (kind === "send-bulk") {
      const button = document.querySelector('[form="send-bulk-form"]');
      if (button) button.disabled = true;
      try {
        const result = await api(
          "/collections/bulk-share",
          state.pendingBulkShare,
          "POST",
        );
        $("#dialog").close();
        notify("Bulk delivery completed");
      } finally {
        if (button) button.disabled = false;
      }
    }
  } catch (err) {
    error(err);
  }
});
document.addEventListener("change", async (e) => {
  if (e.target.id !== "replacement-file") return;
  try {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    await api("/photos/" + state.editPhoto.id + "/replace", fd, "POST");
    $("#dialog").close();
    state.collection = await api("/collections/" + state.collection.id);
    renderCollection();
    notify("Photograph replaced");
  } catch (err) {
    error(err);
  }
});
async function contactsModal() {
  const contacts = list(await api("/contacts"));
  modal(
    "Marketing subscribers",
    contacts.length
      ? `<div class="table-wrap"><table><thead><tr><th>Email</th><th>Collection</th><th></th></tr></thead><tbody>${contacts.map((c) => `<tr><td>${esc(c.email)}</td><td>${esc(c.collectionTitle || c.collectionId)}</td><td><button class="small danger" data-action="remove-contact" data-email="${esc(c.email)}" data-collection="${esc(c.collectionId)}">Remove</button></td></tr>`).join("")}</tbody></table></div>`
      : '<p class="muted">No subscribers yet. Only people who opt in will appear here.</p>',
  );
}
function parseCSV(text) {
  const rows = [];
  let row = [],
    field = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((c === "\r" || c === "\n") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (quoted) throw new Error("The CSV has an unclosed quoted field.");
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
document.addEventListener("change", async (e) => {
  if (e.target.id !== "folder-picker") return;
  const files = [...e.target.files].filter((f) =>
    /^(image|video)\//.test(f.type),
  );
  if (!files.length) {
    notify("No supported media found in this folder.");
    return;
  }
  const groups = new Map();
  for (const f of files) {
    const parts = f.webkitRelativePath.split("/");
    const group = parts.length >= 3 ? parts[1] : parts[0];
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(f);
  }
  if (groups.size > 100) {
    notify("Please import no more than 100 folders at once.");
    return;
  }
  state.cancelFolder = false;
  modal(
    "Importing folders",
    `<p>${groups.size} collections · ${files.length} files</p><p id="folder-progress" role="status">Preparing collections…</p><div class="progress"><i id="folder-progress-bar"></i></div><p class="hint">Collections are saved as drafts. If you stop, completed files remain in the studio.</p>`,
    `<button data-action="cancel-folder">Stop after current file</button>`,
  );
  let count = 0,
    created = 0;
  try {
    for (const [title, items] of groups) {
      if (state.cancelFolder) break;
      const collection = await api("/collections", { title }, "POST");
      created++;
      for (const file of items) {
        if (state.cancelFolder) break;
        const fd = new FormData();
        fd.append("files", file);
        await api("/collections/" + collection.id + "/photos", fd, "POST");
        count++;
        const progress = $("#folder-progress");
        if (progress)
          progress.textContent = `${title} · ${count} of ${files.length} files saved`;
        const bar = $("#folder-progress-bar");
        if (bar) bar.style.width = (count / files.length) * 100 + "%";
      }
    }
    $("#dialog").close();
    await navigate("collections");
    notify(
      `${state.cancelFolder ? "Stopped. " : ""}${count} files saved across ${created} draft collections.`,
    );
  } catch (err) {
    $("#dialog").close();
    await navigate("collections");
    notify(`Import stopped after ${count} saved files. ${err.message}`);
  }
});
start();

function sendDesignPreview() {
  const form = $('form[data-form="design"]'),
    frame = $("#design-preview");
  if (!form || !frame?.contentWindow || !state.collection) return;
  const { coverId, ...design } = Object.fromEntries(new FormData(form));
  if ($("#design-save-state"))
    $("#design-save-state").textContent = "Preview updated · Save to apply";
  design.focalX = Math.max(0, Math.min(100, Number(design.focalX)));
  design.focalY = Math.max(0, Math.min(100, Number(design.focalY)));
  frame.contentWindow.postMessage(
    {
      type: "client-design-preview",
      design: { ...state.collection.design, ...design },
      coverId,
    },
    location.origin,
  );
}
document.addEventListener("input", (e) => {
  if (e.target.closest('form[data-form="design"]')) sendDesignPreview();
});
document.addEventListener("change", (e) => {
  if (e.target.closest('form[data-form="design"]')) sendDesignPreview();
});
document.addEventListener(
  "load",
  (e) => {
    if (e.target.id === "design-preview") sendDesignPreview();
  },
  true,
);
window.addEventListener("message", (e) => {
  if (
    e.origin === location.origin &&
    e.source === $("#design-preview")?.contentWindow &&
    e.data?.type === "client-design-preview-ready"
  )
    sendDesignPreview();
});
