import { layoutPhotos } from "/client-assets/gallery-layout.js";
(() => {
  "use strict";
  const app = document.getElementById("app");
  const modal = document.getElementById("modal");
  const viewer = document.getElementById("lightbox");
  const slug = location.pathname.startsWith("/g/")
    ? decodeURIComponent(location.pathname.split("/")[2] || "")
    : "";
  const endpoint = slug
    ? `/api/gallery/${encodeURIComponent(slug)}`
    : "/api/homepage";
  const studioPreview =
    window.parent !== window &&
    new URLSearchParams(location.search).get("studio-preview") === "1";
  let collection,
    visiblePhotos = [],
    activeSet = "",
    viewerIndex = 0,
    slideTimer,
    lists = [],
    activeList = null,
    favoriteSession = false,
    homeData;
  let noticeTimer,
    touchX = 0,
    touchY = 0,
    viewerRequest = 0,
    galleryRender = 0,
    viewerPhotoId = null,
    quickPhotoOpened = false,
    gateBrand = {};
  const icons = {
    heart:
      '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
    share: '<path d="M12 16V3m-4 4 4-4 4 4M7 10H4v11h16V10h-3"/>',
    play: '<path d="m9 4 12 8-12 8Z"/>',
    pause: '<path d="M8 4v16M16 4v16"/>',
    more: '<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>',
    image:
      '<path d="M3 3h18v18H3zM3 17l6-6 4 4 3-3 5 5"/><circle cx="15" cy="8" r="1.5"/>',
  };
  const esc = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const icon = (name) =>
    `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.image}</svg>`;
  const button = (name, title, action, extra = "") =>
    `<button class="tool ${extra}" data-action="${action}" aria-label="${esc(title)}" title="${esc(title)}">${icon(name)}<span>${esc(title)}</span></button>`;
  const safeUrl = (value) => {
    if (!value) return "";
    try {
      const u = new URL(value, location.origin);
      return ["http:", "https:"].includes(u.protocol) ? u.href : "";
    } catch {
      return "";
    }
  };
  const photoUrl = (p) => safeUrl(p.url || p.thumbnailUrl || "");
  const thumbUrl = (p) => safeUrl(p.thumbnailUrl || p.url || "");
  const emailValue = () => {
    try {
      return localStorage.getItem("inmoment.delivery.email") || "";
    } catch {
      return "";
    }
  };
  const remember = (email) => {
    try {
      localStorage.setItem("inmoment.delivery.email", email);
    } catch {}
  };
  const settings = () => collection?.settings || {};
  const canDownloadPhoto = (p) =>
    settings().downloadEnabled !== false &&
    settings().singleDownloadEnabled !== false &&
    p.type !== "embed" &&
    (p.type !== "video" || settings().videoDownloadEnabled !== false);
  const optIn = (where) =>
    (collection?.brand || gateBrand)?.marketingOptIns?.[where]
      ? '<label class="check"><input name="marketingConsent" type="checkbox"> Send me occasional collection updates from this photographer (optional).</label>'
      : "";
  async function maybeSubscribe(form, email) {
    if (form.marketingConsent?.checked) {
      try {
        await api(endpoint + "/subscribe", { email, consent: true });
      } catch (e) {
        notice(
          "Your request succeeded, but email updates could not be saved. " +
            e.message,
        );
      }
    }
  }
  async function api(url, data, method = "POST") {
    const response = await fetch(url, {
      method: data === undefined ? "GET" : method,
      credentials: "same-origin",
      headers: data === undefined ? {} : { "Content-Type": "application/json" },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    const type = response.headers.get("content-type") || "";
    const result = type.includes("application/json")
      ? await response.json()
      : {
          error:
            "The service could not complete this request. Please try again.",
        };
    if (!response.ok) {
      const e = new Error(result.error || "Please try again.");
      e.status = response.status;
      e.data = result;
      throw e;
    }
    return result;
  }
  function notice(message) {
    const n = document.getElementById("notice");
    n.textContent = message;
    n.classList.add("visible");
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => n.classList.remove("visible"), 4500);
  }
  function dateLabel(date) {
    if (!date) return "";
    const d = new Date(String(date).slice(0, 10) + "T12:00:00");
    return Number.isNaN(d.valueOf())
      ? ""
      : d.toLocaleDateString(undefined, {
          month: "long",
          day: "numeric",
          year: "numeric",
        });
  }
  function theme(design = {}) {
    const palettes = {
      light: ["#f8f7f3", "#252d28", "#6f766f", "#dedfd7", "#556c5d", "#ffffff"],
      gold: ["#f7f2e5", "#3e3728", "#81745b", "#ded3b9", "#94743c", "#fffcf4"],
      rose: ["#f9f0ed", "#4b3539", "#8d7579", "#e7d5d5", "#a96e7d", "#fff7f6"],
      terracotta: [
        "#f5e8df",
        "#4b332c",
        "#8b6e60",
        "#d9bfb1",
        "#a05b40",
        "#fcf4ed",
      ],
      sand: ["#ede8df", "#464037", "#857b6c", "#d5cebf", "#92816a", "#f6f1e8"],
      olive: ["#edefe5", "#333d30", "#737c67", "#cfd5c2", "#697955", "#f8f9f2"],
      agave: ["#eef3ef", "#2f433b", "#6b8278", "#cedbd2", "#5d8a74", "#f9fcfa"],
      sea: ["#edf3f5", "#2c414a", "#6b838f", "#cbdbe2", "#527f94", "#f6fbfd"],
      dark: ["#202321", "#f2f1e9", "#b4bbb4", "#414841", "#afc1ab", "#2a302b"],
    };
    const p =
      palettes[String(design.palette || "light").toLowerCase()] ||
      palettes.light;
    ["paper", "ink", "muted", "line", "accent", "panel"].forEach((v, i) =>
      document.documentElement.style.setProperty("--" + v, p[i]),
    );
    const fonts = {
      sans: "Arial, sans-serif",
      serif: "Georgia, 'Times New Roman', serif",
      modern: "'Trebuchet MS', sans-serif",
      timeless: "Georgia, 'Times New Roman', serif",
      bold: "Arial Black, Arial, sans-serif",
      subtle: "'Palatino Linotype', Palatino, serif",
    };
    document.documentElement.style.setProperty(
      "--title",
      fonts[String(design.typography || "timeless").toLowerCase()] ||
        fonts.timeless,
    );
    document.documentElement.style.setProperty(
      "--gap",
      design.spacing === "large" ? "40px" : "8px",
    );
    document.documentElement.style.removeProperty("--photo-columns");
    document.documentElement.dataset.thumbnailSize =
      design.thumbnailSize === "large" ? "large" : "regular";
    document.body.classList.toggle(
      "icon-only",
      !["icon-text", "Icon & Text", "text"].includes(design.navigation),
    );
  }
  function brandHTML(brand = {}, cover = false) {
    const url = safeUrl(
      (cover ? brand.coverLogoUrl : "") || brand.logoUrl || "",
    );
    return url
      ? `<img src="${esc(url)}" alt="${esc(brand.name || "In Moment")}">`
      : `<span class="wordmark">${esc(brand.name || "inmoment")}</span>`;
  }
  function extras() {
    const brand = collection?.brand || homeData?.brand || {};
    const footer = document.querySelector(".gallery-footer");
    if (footer) {
      const div = document.createElement("div");
      div.className = "legal-links";
      div.innerHTML = `${brand.terms ? '<button data-action="terms">Terms of use</button>' : ""}${brand.privacy ? '<button data-action="privacy">Privacy</button>' : ""}${settings().galleryAssist ? '<button data-action="help">Gallery guide</button>' : ""}`;
      footer.append(div);
    }
    let seen = false;
    try {
      seen = localStorage.getItem("inmoment.essential-notice") === "yes";
    } catch {}
    if (brand.cookieBanner && !seen) {
      const note = document.createElement("aside");
      note.className = "cookie-note";
      note.setAttribute("aria-label", "Cookie information");
      note.innerHTML =
        '<p>This gallery uses essential cookies to remember your access and favorite selections. No optional analytics cookies are loaded.</p><button data-action="cookie-dismiss">Understood</button>';
      app.append(note);
    }
    let dismissed = false;
    try {
      dismissed =
        sessionStorage.getItem("inmoment.signup." + slug) === "dismissed";
    } catch {}
    if (slug && brand.galleryPopup && !dismissed) {
      const invite = document.createElement("aside");
      invite.className = "signup-invite";
      invite.innerHTML =
        '<button class="signup-dismiss" data-action="dismiss-signup" aria-label="Dismiss signup invitation">×</button><strong>A little more to look forward to.</strong><p>Get collection updates from your photographer.</p><button data-action="newsletter">Keep me in the loop →</button>';
      app.append(invite);
    }
  }
  function newsletter() {
    openModal(
      "Keep in touch",
      `<p>Occasional updates from ${esc(collection?.brand?.name || "your photographer")}, delivered to your inbox.</p><form id="newsletter-form"><label for="newsletter-email">Email address</label><input id="newsletter-email" name="email" type="email" value="${esc(emailValue())}" required autocomplete="email"><label class="check"><input type="checkbox" name="consent" required> I agree to receive collection updates from this photographer.</label><button class="primary full">Subscribe</button><div class="form-error" role="alert"></div></form>`,
    );
    document.getElementById("newsletter-form").onsubmit = async (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      await submit(form, async () => {
        const email = form.email.value.trim();
        await api(endpoint + "/subscribe", {
          email,
          consent: form.consent.checked,
        });
        remember(email);
        try {
          sessionStorage.setItem("inmoment.signup." + slug, "dismissed");
        } catch {}
        document.querySelector(".signup-invite")?.remove();
        openModal(
          "You are on the list",
          "<p>Thank you. Your preference has been saved.</p>",
        );
      });
    };
  }
  function legal(kind) {
    const brand = collection?.brand || homeData?.brand || {};
    openModal(
      kind === "terms" ? "Terms of use" : "Privacy",
      `<div class="legal-copy">${esc(brand[kind] || "No information has been provided yet.")}</div>`,
    );
  }
  function guide() {
    openModal(
      "Make this collection yours",
      `<p>Open a photograph to see it in full. Use the arrows or swipe to move through the collection.</p>${settings().favoritesEnabled !== false ? "<p>Tap the heart to save favorites. You can create different lists, add notes and send your selection to your photographer.</p>" : ""}${settings().downloadEnabled !== false ? "<p>Use the download arrow to save one photograph or the complete collection.</p>" : ""}<button class="primary full" data-action="close-modal">Start exploring</button>`,
    );
  }
  async function load() {
    try {
      const data = await api(
        endpoint + (studioPreview ? "?studio-preview=1" : ""),
      );
      if (data.brand)
        data.brand.name =
          data.brand.name || data.brand.brandName || "In Moment";
      const favicon = safeUrl(data.brand?.faviconUrl);
      if (favicon) {
        let link = document.querySelector("link[rel=icon]");
        if (!link) {
          link = document.createElement("link");
          link.rel = "icon";
          document.head.appendChild(link);
        }
        link.href = favicon;
      }
      if (slug) {
        collection = data;
        theme(data.design);
        const recovery =
          !studioPreview && new URLSearchParams(location.search).get("recover");
        if (recovery) {
          try {
            await api(endpoint + "/favorites/verify", { token: recovery });
            notice("Your favorite selections are restored");
          } catch (error) {
            notice(error.message);
          }
          const cleanUrl = new URL(location.href);
          cleanUrl.searchParams.delete("recover");
          history.replaceState(
            null,
            "",
            cleanUrl.pathname + cleanUrl.search + cleanUrl.hash,
          );
        }
        renderGallery();
        if (studioPreview)
          window.parent.postMessage(
            { type: "client-design-preview-ready" },
            location.origin,
          );
      } else {
        homeData = data;
        theme(data.brand?.design);
        renderHome();
      }
    } catch (e) {
      if (e.data?.locked || e.status === 401) renderGate("password", e.data);
      else if (e.data?.registrationRequired) renderGate("registration", e.data);
      else
        app.innerHTML = `<div class="lock-screen"><div class="lock-card"><span class="wordmark">inmoment</span><h1>Collection unavailable</h1><p>${esc(e.message)}</p><a class="secondary" href="/">Return home</a></div></div>`;
    }
  }
  function renderGate(kind, data = {}) {
    gateBrand = data.brand || {};
    const password = kind === "password";
    document.title = (data.title || "Your collection") + " · In Moment";
    app.innerHTML = `<div class="lock-screen"><div class="lock-card"><span class="wordmark">inmoment</span><div class="eyebrow">A collection just for you</div><h1>${esc(data.title || "Welcome back")}</h1><p>${password ? "Enter the password shared by your photographer." : "Leave your email to view this collection."}</p><form id="gate-form"><label for="gate-value">${password ? "Collection password" : "Email address"}</label><input id="gate-value" name="value" type="${password ? "password" : "email"}" value="${password ? "" : esc(emailValue())}" autocomplete="${password ? "current-password" : "email"}" required>${password ? "" : optIn("emailRegistration")}<button class="primary full">View collection</button><div class="form-error" role="alert"></div></form></div></div>`;
    document.getElementById("gate-form").onsubmit = async (e) => {
      e.preventDefault();
      await submit(e.currentTarget, async () => {
        const form = e.currentTarget;
        const value = form.elements.value.value.trim();
        await api(
          endpoint + (password ? "/unlock" : "/register"),
          password ? { password: value } : { email: value },
        );
        if (!password) {
          remember(value);
          await maybeSubscribe(form, value);
        }
        await load();
      });
    };
  }
  async function submit(form, work) {
    const b =
      form.querySelector("button[type=submit],button.primary") ||
      form.querySelector("button");
    const error = form.querySelector(".form-error");
    if (b) b.disabled = true;
    if (error) error.textContent = "";
    try {
      await work();
    } catch (e) {
      if (error) error.textContent = e.message;
      else notice(e.message);
    } finally {
      if (b) b.disabled = false;
    }
  }
  function renderHome() {
    const b = homeData.brand || {};
    document.title = (b.name || "In Moment") + " · Collections";
    const collections = homeData.collections || [];
    const tags = [
      ...new Set(
        collections.flatMap((c) => (Array.isArray(c.tags) ? c.tags : [])),
      ),
    ];
    app.innerHTML = `<header class="home-header"><a href="/">${brandHTML(b)}</a><span class="eyebrow">Client collections</span></header><div class="home-intro"><div class="eyebrow">Made to be remembered</div><h1>${esc(b.homepageTitle || "Your stories, beautifully kept.")}</h1><p>${esc(b.homepageDescription || "Photographs to return to. Find your collection, relive the moments and keep your favorites close.")}</p></div><div class="home-search"><input id="home-search" type="search" placeholder="Find a collection" aria-label="Find a collection"></div><div class="tags">${tags.map((t) => `<button data-tag="${esc(t)}">${esc(t)}</button>`).join("")}</div><div class="home-grid" id="home-grid"></div><footer class="gallery-footer">${brandHTML(b)}<p>Every photograph. A moment worth keeping.</p></footer>`;
    let selectedTag = "";
    const draw = () => {
      const q = document.getElementById("home-search").value.toLowerCase();
      const filtered = collections.filter(
        (c) =>
          (c.title || "").toLowerCase().includes(q) &&
          (!selectedTag || (c.tags || []).includes(selectedTag)),
      );
      document.getElementById("home-grid").innerHTML =
        filtered
          .map((c) => {
            const url = safeUrl(
              c.coverUrl ||
                c.thumbnailUrl ||
                c.cover?.thumbnailUrl ||
                c.cover?.url ||
                "",
            );
            return `<a class="collection-card" href="/g/${encodeURIComponent(c.slug)}">${url ? `<img loading="lazy" src="${esc(url)}" alt="${esc(c.title)}">` : '<div class="collection-placeholder"></div>'}<h2>${esc(c.title)}</h2><p>${esc(dateLabel(c.date))}</p></a>`;
          })
          .join("") ||
        '<div class="empty"><p>No collections to show yet.</p></div>';
    };
    document.getElementById("home-search").oninput = draw;
    document.querySelectorAll("[data-tag]").forEach(
      (b) =>
        (b.onclick = () => {
          selectedTag = selectedTag === b.dataset.tag ? "" : b.dataset.tag;
          document
            .querySelectorAll("[data-tag]")
            .forEach((x) =>
              x.classList.toggle("active", x.dataset.tag === selectedTag),
            );
          draw();
        }),
    );
    draw();
    extras();
  }
  async function renderGallery() {
    const render = ++galleryRender;
    const c = collection,
      d = c.design || {},
      b = c.brand || {};
    document.title = c.title + " · " + (b.name || "In Moment");
    if (c.status === "pre-release") {
      renderPreRelease();
      return;
    }
    const photo =
      (c.photos || []).find((p) => p.id === c.coverId) ||
      (c.photos || []).find((p) => !p.type || p.type === "image");
    const cover = safeUrl(photo?.url || c.coverUrl || "");
    if (cover) {
      const coverImage = new Image();
      coverImage.fetchPriority = "high";
      coverImage.src = cover;
      try { await coverImage.decode(); } catch { /* Keep the gallery usable if the cover fails. */ }
      if (render !== galleryRender) return;
    }
    const coverStyle = String(d.coverStyle || "outline")
      .toLowerCase()
      .replace(/[^a-z-]/g, "");
    const focal = (v) =>
      Math.max(
        0,
        Math.min(
          100,
          v !== null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : 50,
        ),
      );
    const focalX = focal(d.focalX),
      focalY = focal(d.focalY);
    app.innerHTML = `${c.preview ? '<div class="preview-badge">Private photographer preview</div>' : ""}<section class="cover cover-${coverStyle}">${cover ? `<img class="cover-photo" fetchpriority="high" loading="eager" decoding="sync" src="${esc(cover)}" alt="" style="object-position:${focalX}% ${focalY}%">` : ""}<a class="cover-brand" href="/">${brandHTML(b, true)}</a><div class="cover-copy"><div class="cover-date">${esc(dateLabel(c.date))}</div><h1>${esc(c.title)}</h1>${c.description ? `<p class="cover-description">${esc(c.description)}</p>` : ""}</div><a href="#gallery" class="enter-gallery">View gallery ↓</a></section><section id="gallery"><header class="gallery-head"><a class="gallery-brand" href="#"><h2>${esc(c.title)}</h2><small>${esc(b.name || "In Moment")}</small></a><div class="gallery-tools">${settings().favoritesEnabled !== false ? button("heart", "Favorites", "favorites") : ""}${settings().downloadEnabled !== false && settings().galleryDownloadEnabled !== false ? button("download", "Download", "download") : ""}${settings().socialSharing !== false ? button("share", "Share", "share", "mobile-hide") : ""}${settings().slideshow !== false ? button("play", "Slideshow", "slideshow", "mobile-hide") : ""}${button("more", "More options", "more")}</div></header><div class="set-tabs">${(c.sets || []).length > 1 ? `<button class="active" data-set="">All photographs</button>${c.sets.map((s) => `<button data-set="${esc(s.id)}">${esc(s.name)}</button>`).join("")}` : ""}</div><div id="set-description" class="gallery-intro"></div><div class="photo-grid ${d.layout === "horizontal" ? "horizontal" : ""}" id="photo-grid"></div></section><footer class="gallery-footer"><a href="/">${brandHTML(b)}</a><p>Beautifully captured. Yours to keep.</p><a class="eyebrow" href="#">Back to top ↑</a></footer>`;
    document.querySelectorAll("[data-set]").forEach(
      (b) =>
        (b.onclick = () => {
          activeSet = b.dataset.set;
          document
            .querySelectorAll("[data-set]")
            .forEach((x) =>
              x.classList.toggle("active", x.dataset.set === activeSet),
            );
          renderPhotos();
        }),
    );
    renderPhotos();
    if (!studioPreview) extras();
    if (!quickPhotoOpened && !studioPreview) {
      const photoId = new URLSearchParams(location.search).get("photo");
      if (photoId) {
        quickPhotoOpened = true;
        const index = visiblePhotos.findIndex((p) => p.id === photoId);
        if (index >= 0) openViewer(index);
        else notice("This photograph is not available in the collection.");
      }
    }
    if (!studioPreview)
      api(endpoint + "/favorites")
        .then((data) => {
          lists = Array.isArray(data) ? data : data.lists || [];
          favoriteSession = true;
          activeList = lists[0] || null;
          renderPhotos();
        })
        .catch(() => {});
  }
  function renderPreRelease() {
    app.innerHTML = `<div class="lock-screen"><div class="lock-card">${brandHTML(collection.brand || {})}<div class="eyebrow">Something worth waiting for</div><h1>${esc(collection.title)}</h1><p>Your photographs are on their way. Be the first to know when the collection is ready.</p><form id="subscribe-form"><label for="subscribe-email">Email address</label><input type="email" id="subscribe-email" name="email" value="${esc(emailValue())}" required autocomplete="email"><label class="check"><input type="checkbox" name="consent" required> I agree to receive updates about this collection.</label><button class="primary full">Notify me</button><div class="form-error" role="alert"></div></form></div></div>`;
    document.getElementById("subscribe-form").onsubmit = async (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      await submit(form, async () => {
        const email = form.email.value.trim();
        await api(endpoint + "/subscribe", {
          email,
          consent: form.consent.checked,
        });
        remember(email);
        form.innerHTML =
          "<p>Thank you. Your photographer can let you know when the collection is ready.</p>";
      });
    };
  }
  function isFavorite(id) {
    return (activeList?.photoIds || []).includes(id);
  }
  let gridObserver;
  function arrangePhotos() {
    const grid = document.getElementById("photo-grid");
    if (!grid) return;
    if (!visiblePhotos.length) {
      grid.classList.remove("arranged");
      grid.style.height = "";
      return;
    }
    const d = collection.design || {};
    const result = layoutPhotos(
      visiblePhotos.map((p) => p.width / p.height),
      grid.clientWidth,
      {
        layout: d.layout,
        large: d.thumbnailSize === "large",
        gap:
          d.spacing === "large"
            ? innerWidth <= 600
              ? 24
              : 40
            : innerWidth <= 600
              ? 4
              : 8,
        mobile: innerWidth <= 600,
        tablet: innerWidth > 600 && innerWidth <= 1000,
      },
    );
    grid.classList.add("arranged");
    grid.style.height = result.height + "px";
    [...grid.querySelectorAll(".tile")].forEach((tile, i) => {
      const box = result.boxes[i];
      Object.assign(tile.style, {
        left: box.x + "px",
        top: box.y + "px",
        width: box.width + "px",
        height: box.height + "px",
      });
    });
  }
  window.addEventListener("resize", arrangePhotos);
  function renderPhotos() {
    visiblePhotos = (collection.photos || []).filter(
      (p) => !activeSet || p.setId === activeSet,
    );
    const set = (collection.sets || []).find((s) => s.id === activeSet);
    document.getElementById("set-description").textContent =
      set?.description || "";
    document.getElementById("photo-grid").innerHTML =
      visiblePhotos
        .map(
          (p, i) =>
            `<article class="tile" style="--ratio:${p.width > 0 && p.height > 0 ? p.width / p.height : 1.5}"><button class="photo-open" data-photo="${i}" aria-label="Open ${esc(p.caption || p.filename || "photograph")}">${!p.type || p.type === "image" ? `<img loading="lazy" decoding="async" src="${esc(thumbUrl(p))}" alt="${esc(p.caption || p.filename || "Photograph")}" ${p.width && p.height ? `width="${p.width}" height="${p.height}"` : ""}>` : `<span class="media-label">${icon("play")} Play video</span>`}</button><div class="tile-tools">${settings().favoritesEnabled !== false && (!p.type || p.type === "image") ? `<button class="tool ${isFavorite(p.id) ? "favorite-on" : ""}" data-favorite="${esc(p.id)}" aria-label="${isFavorite(p.id) ? "Remove from" : "Add to"} favorites">${icon("heart")}</button>` : ""}${canDownloadPhoto(p) ? `<button class="tool" data-download="${esc(p.id)}" aria-label="Download photo">${icon("download")}</button>` : ""}</div></article>`,
        )
        .join("") ||
      '<div class="empty"><h2>A little anticipation.</h2><p>Your photographer is preparing the photographs for this collection.</p></div>';
    gridObserver?.disconnect();
    arrangePhotos();
    gridObserver = new ResizeObserver(arrangePhotos);
    gridObserver.observe(document.getElementById("photo-grid"));
  }
  function openModal(title, content) {
    document.getElementById("modal-content").innerHTML =
      `<h2 id="modal-title">${esc(title)}</h2>${content}`;
    if (!modal.open) modal.showModal();
  }
  function closeModal() {
    modal.close();
  }
  function openViewer(index) {
    viewerIndex = index;
    if (!viewer.open) viewer.showModal();
    document.documentElement.classList.add("viewing-photo");
    paintViewer();
  }
  function closeViewer() {
    clearInterval(slideTimer);
    slideTimer = null;
    viewerRequest++;
    viewerPhotoId = null;
    viewer.close();
    document.documentElement.classList.remove("viewing-photo");
    document.getElementById("viewer-media").removeAttribute("aria-busy");
    document.getElementById("viewer-media").innerHTML = "";
  }
  function embedUrl(url) {
    try {
      const u = new URL(url);
      if (u.hostname === "youtu.be")
        return (
          "https://www.youtube-nocookie.com/embed/" +
          encodeURIComponent(u.pathname.slice(1))
        );
      if (
        ["youtube.com", "www.youtube.com", "www.youtube-nocookie.com"].includes(
          u.hostname,
        )
      ) {
        const id = u.searchParams.get("v") || u.pathname.split("/").pop();
        return (
          "https://www.youtube-nocookie.com/embed/" + encodeURIComponent(id)
        );
      }
      if (
        ["vimeo.com", "www.vimeo.com", "player.vimeo.com"].includes(u.hostname)
      ) {
        const id = u.pathname.split("/").filter(Boolean).pop();
        if (/^\d+$/.test(id)) return "https://player.vimeo.com/video/" + id;
      }
    } catch {}
    return "";
  }
  async function paintViewer() {
    const p = visiblePhotos[viewerIndex];
    if (!p) return;
    document.getElementById("viewer-counter").textContent =
      `${viewerIndex + 1} / ${visiblePhotos.length}`;
    document.getElementById("viewer-caption").textContent =
      p.caption || (collection.brand?.showFilenames ? p.filename : "") || "";
    document.getElementById("viewer-tools").innerHTML =
      `${settings().favoritesEnabled !== false && (!p.type || p.type === "image") ? button("heart", "Favorite", "viewer-favorite", isFavorite(p.id) ? "favorite-on" : "") : ""}${canDownloadPhoto(p) ? button("download", "Download", "viewer-download") : ""}${settings().slideshow !== false ? button(slideTimer ? "pause" : "play", slideTimer ? "Pause slideshow" : "Play slideshow", "toggle-slideshow") : ""}`;
    const media = document.getElementById("viewer-media");
    if (viewerPhotoId === p.id) return;
    viewerPhotoId = p.id;
    const request = ++viewerRequest;
    media.removeAttribute("aria-busy");
    if (p.type === "video")
      media.innerHTML = `<video src="${esc(photoUrl(p))}" controls playsinline preload="metadata"></video>`;
    else if (p.type === "embed") {
      const url = embedUrl(p.url || p.embedUrl);
      media.innerHTML = url
        ? `<iframe src="${esc(url)}" title="${esc(p.filename || "Video")}" allow="fullscreen; picture-in-picture" allowfullscreen></iframe>`
        : "<p>This video cannot be embedded.</p>";
    } else {
      // Decode before replacing the current photo to avoid blank navigation flashes.
      const image = new Image();
      image.alt = p.caption || p.filename || "Photograph";
      image.src = photoUrl(p);
      media.setAttribute("aria-busy", "true");
      try { await image.decode(); } catch {
        if (request !== viewerRequest || !viewer.open) return;
        media.removeAttribute("aria-busy");
        viewerPhotoId = null;
        media.innerHTML = '<p role="status">This photograph could not load. Try opening it again.</p>';
        return;
      }
      if (request !== viewerRequest || !viewer.open) return;
      media.removeAttribute("aria-busy");
      media.replaceChildren(image);
      if (!matchMedia("(prefers-reduced-motion: reduce)").matches)
        image.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: "ease-out" });
      for (const offset of [-1, 1]) {
        const next = visiblePhotos[(viewerIndex + offset + visiblePhotos.length) % visiblePhotos.length];
        if (next && (!next.type || next.type === "image")) {
          const preload = new Image();
          preload.src = photoUrl(next);
        }
      }
    }
  }
  function moveViewer(delta) {
    if (!visiblePhotos.length) return;
    viewerIndex =
      (viewerIndex + delta + visiblePhotos.length) % visiblePhotos.length;
    paintViewer();
  }
  function toggleSlideshow() {
    if (slideTimer) {
      clearInterval(slideTimer);
      slideTimer = null;
    } else slideTimer = setInterval(() => moveViewer(1), 5000);
    paintViewer();
  }
  function download(ids) {
    const sizes = settings().downloadSizes || ["original", "2048"];
    openModal(
      ids?.length === 1 ? "Keep this moment" : "Download your collection",
      `<p>${sizes.length > 1 ? "Select the size that suits you. Your original photographs stay unchanged." : "Your original photographs stay unchanged."}</p><form id="download-form"><label for="download-email">Email address</label><input id="download-email" name="email" type="email" autocomplete="email" value="${esc(emailValue())}" ${settings().downloadEmailRequired === false && !settings().downloadLimitPerEmail ? "" : "required"}><p class="help">Saved on this device so you do not have to enter it again.</p>${sizes.length === 1 ? `<input type="hidden" name="size" value="${esc(sizes[0])}">` : `<label for="download-size">Photo size</label><select id="download-size" name="size">${sizes.map((s) => `<option value="${esc(s)}">${s === "original" ? "Original resolution" : esc(s) + " px"}</option>`).join("")}</select>`}${settings().downloadPinRequired ? '<label for="download-pin">Download PIN</label><input id="download-pin" name="pin" type="password" inputmode="numeric" autocomplete="off" required>' : ""}${optIn("downloads")}<button class="primary full">Prepare download</button><div class="form-error" role="alert"></div></form>`,
    );
    document.getElementById("download-form").onsubmit = async (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      await submit(form, async () => {
        const email = form.email.value.trim();
        const data = await api(endpoint + "/download", {
          photoIds: ids,
          size: form.size.value,
          email,
          pin: form.pin?.value || "",
        });
        remember(email);
        await maybeSubscribe(form, email);
        const url = safeUrl(data.url);
        if (!url)
          throw new Error(
            "The download link was not returned. Please try again.",
          );
        // Fetch before the final tap: iOS requires share() during user activation.
        const photo =
          ids?.length === 1
            ? collection.photos.find((p) => p.id === ids[0])
            : null;
        let shareFile = null;
        if (photo && (!photo.type || photo.type === "image")) {
          const filename =
            form.size.value === "original"
              ? photo.filename
              : photo.filename.replace(/\.[^.]+$/, "") + ".jpg";
          shareFile = await window.PhotoDelivery.prepare(url, filename);
        }
        openModal(
          "Your photographs are ready",
          `<p>Keep a little of this day, wherever you go.</p>${shareFile ? '<button id="save-photo-share" class="primary full">Save or share photo</button><p class="help">On iPhone, choose Save Image in the share sheet to add it to Photos.</p>' : ""}<a class="${shareFile ? "secondary" : "primary"} full download-ready" href="${esc(url)}" download>${shareFile ? "Download file instead" : "Save download"}</a><p id="share-help" class="help">${shareFile ? "" : "Your download may appear in Files or Downloads."}</p>`,
        );
        if (shareFile)
          document.getElementById("save-photo-share").onclick = async (
            event,
          ) => {
            const button = event.currentTarget;
            button.disabled = true;
            try {
              // No fetch or other await before this call.
              await navigator.share({ files: [shareFile] });
            } catch (error) {
              if (error.name !== "AbortError")
                document.getElementById("share-help").textContent =
                  "Sharing is unavailable. Use Download file instead, or try again.";
            } finally {
              button.disabled = false;
            }
          };
      });
    };
  }
  async function ensureFavorites(callback) {
    if (favoriteSession) {
      await callback();
      return;
    }
    openModal(
      "Your favorite moments",
      `<p>Save a selection to revisit and share with your photographer.</p><form id="favorite-signin"><label for="favorite-email">Email address</label><input id="favorite-email" name="email" type="email" autocomplete="email" value="${esc(emailValue())}" required><p class="help">Your selection is remembered in this browser. Use an email recovery link to return on another device.</p>${optIn("favorites")}<button class="primary full">Continue</button><div class="form-error" role="alert"></div></form><button class="danger-action" data-action="recover-favorites">Recover earlier selections by email</button>`,
    );
    document.getElementById("favorite-signin").onsubmit = async (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      await submit(form, async () => {
        const email = form.email.value.trim();
        await api(endpoint + "/favorites/session", { email });
        remember(email);
        await maybeSubscribe(form, email);
        const data = await api(endpoint + "/favorites");
        lists = Array.isArray(data) ? data : data.lists || [];
        activeList = lists[0] || null;
        favoriteSession = true;
        closeModal();
        await callback();
      });
    };
  }
  async function saveList(list) {
    const saved = await api(
      endpoint +
        "/favorites" +
        (list.id ? "/" + encodeURIComponent(list.id) : ""),
      list,
      list.id ? "PATCH" : "POST",
    );
    const result = saved.list || saved;
    lists = lists.filter((l) => l.id !== result.id);
    lists.push(result);
    activeList = result;
    return result;
  }
  async function favorite(id) {
    try {
      await ensureFavorites(async () => {
        if (!activeList)
          activeList = await saveList({
            name: "My favorites",
            photoIds: [],
            notes: {},
            completed: false,
          });
        const photoIds = [...(activeList.photoIds || [])];
        const index = photoIds.indexOf(id);
        if (index >= 0) photoIds.splice(index, 1);
        else {
          if (
            activeList.selectionLimit &&
            photoIds.length >= activeList.selectionLimit
          )
            throw new Error(
              "This selection allows up to " +
                activeList.selectionLimit +
                " photographs.",
            );
          photoIds.push(id);
        }
        await saveList({ ...activeList, photoIds, completed: false });
        renderPhotos();
        if (viewer.open) paintViewer();
        notice(
          index >= 0 ? "Removed from favorites" : "Added to " + activeList.name,
        );
      });
    } catch (e) {
      notice(e.message);
    }
  }
  async function favorites() {
    await ensureFavorites(async () => {
      openModal(
        "Your selections",
        `<p>Choose a list while you browse, or review your finished selection.</p><div>${lists.map((l) => `<div class="favorite-list"><div><strong>${esc(l.name)}</strong><small>${(l.photoIds || []).length} photograph${(l.photoIds || []).length === 1 ? "" : "s"}${l.selectionLimit ? " / " + l.selectionLimit + " maximum" : ""} ${l.completed ? "· Sent to photographer" : ""}${l.id === activeList?.id ? " · Active" : ""}</small></div><button data-list="${esc(l.id)}">Review</button></div>`).join("") || '<p class="help">Start a list, then tap the heart on any photograph.</p>'}</div><form id="new-list"><label for="list-name">New selection</label><div class="field-row"><input id="list-name" name="name" placeholder="For the album" maxlength="100" required><button class="primary">Create list</button></div><div class="form-error" role="alert"></div></form><button class="danger-action" data-action="recover-favorites">Email a recovery link for this selection</button>`,
      );
      document.getElementById("new-list").onsubmit = async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        await submit(form, async () => {
          await saveList({
            name: form.elements.name.value.trim(),
            photoIds: [],
            notes: {},
            completed: false,
          });
          closeModal();
          renderPhotos();
          notice("List created. Tap a heart to add photographs.");
        });
      };
    });
  }
  function reviewList(id) {
    activeList = lists.find((l) => l.id === id);
    if (!activeList) return;
    renderPhotos();
    const photos = (collection.photos || []).filter((p) =>
      (activeList.photoIds || []).includes(p.id),
    );
    openModal(
      activeList.name,
      `<p>${photos.length} photograph${photos.length === 1 ? "" : "s"} selected. This is now your active list.</p>${activeList.selectionLimit ? '<p class="selection-limit">Select up to ' + activeList.selectionLimit + " photographs.</p>" : ""}<div class="favorite-strip">${photos.map((p) => `<img src="${esc(thumbUrl(p))}" alt="${esc(p.filename)}">`).join("")}</div><form id="review-list"><label for="rename-list">Selection name</label><input id="rename-list" name="name" value="${esc(activeList.name)}" required maxlength="100">${settings().favoriteNotes ? photos.map((p) => `<div class="favorite-note"><label for="note-${esc(p.id)}">${esc(p.filename)}</label><textarea id="note-${esc(p.id)}" data-note="${esc(p.id)}" placeholder="A note for your photographer">${esc((activeList.notes || {})[p.id] || "")}</textarea></div>`).join("") : ""}<div class="modal-actions"><button class="secondary" name="mode" value="save">Save changes</button><button class="primary" name="mode" value="complete">Send selection</button></div><div class="form-error" role="alert"></div></form><button class="danger-action" data-action="delete-list">Delete this selection</button>`,
    );
    document.getElementById("review-list").onsubmit = async (e) => {
      e.preventDefault();
      const complete = e.submitter?.value === "complete",
        form = e.currentTarget;
      await submit(form, async () => {
        const notes = { ...(activeList.notes || {}) };
        form
          .querySelectorAll("[data-note]")
          .forEach((t) => (notes[t.dataset.note] = t.value));
        await saveList({
          ...activeList,
          name: form.elements.name.value.trim(),
          notes,
          completed: complete,
        });
        closeModal();
        notice(
          complete ? "Selection sent to your photographer" : "Selection saved",
        );
      });
    };
  }
  function recoveryForm() {
    openModal(
      "Return to your favorites",
      `<p>We will email a secure, one-time link to restore your selections on this device.</p><form id="recover-form"><label for="recover-email">Email address</label><input id="recover-email" name="email" type="email" value="${esc(emailValue())}" autocomplete="email" required><button class="primary full">Send recovery link</button><div class="form-error" role="alert"></div></form>`,
    );
    document.getElementById("recover-form").onsubmit = async (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      await submit(form, async () => {
        const email = form.email.value.trim();
        const response = await api(endpoint + "/favorites/recover", { email });
        remember(email);
        openModal(
          "Check your email",
          `<p>${esc(response.message || "If selections exist for this email, a recovery link is on its way.")}</p>`,
        );
      });
    };
  }
  async function share() {
    const data = {
      title: collection.title,
      url: location.origin + "/g/" + encodeURIComponent(slug),
    };
    try {
      if (navigator.share) {
        await navigator.share(data);
        return;
      }
      await navigator.clipboard.writeText(data.url);
      notice("Gallery link copied");
    } catch (e) {
      if (e.name === "AbortError") return;
      openModal(
        "Share this collection",
        `<p>Copy this link to share your gallery.</p><input readonly value="${esc(data.url)}" aria-label="Gallery link">`,
      );
    }
  }
  function more() {
    openModal(
      "Your collection",
      `<div class="modal-actions">${settings().galleryAssist ? '<button class="secondary" data-action="help">Gallery guide</button>' : ""}${settings().socialSharing !== false ? button("share", "Share gallery", "share") : ""}${settings().slideshow !== false ? button("play", "Play slideshow", "slideshow") : ""}</div><p class="help">${esc(collection.brand?.name || "In Moment")} · ${esc(collection.title)}</p>`,
    );
  }
  document.addEventListener("click", async (e) => {
    const photo = e.target.closest("[data-photo]");
    if (photo) {
      openViewer(Number(photo.dataset.photo));
      return;
    }
    const fav = e.target.closest("[data-favorite]");
    if (fav) {
      await favorite(fav.dataset.favorite);
      return;
    }
    const dl = e.target.closest("[data-download]");
    if (dl) {
      download([dl.dataset.download]);
      return;
    }
    const list = e.target.closest("[data-list]");
    if (list) {
      reviewList(list.dataset.list);
      return;
    }
    const action = e.target.closest("[data-action]")?.dataset.action;
    if (!action) return;
    try {
      switch (action) {
        case "close-modal":
          closeModal();
          break;
        case "newsletter":
          newsletter();
          break;
        case "dismiss-signup":
          try {
            sessionStorage.setItem("inmoment.signup." + slug, "dismissed");
          } catch {}
          document.querySelector(".signup-invite")?.remove();
          break;
        case "terms":
          legal("terms");
          break;
        case "privacy":
          legal("privacy");
          break;
        case "help":
          guide();
          break;
        case "cookie-dismiss":
          try {
            localStorage.setItem("inmoment.essential-notice", "yes");
          } catch {}
          document.querySelector(".cookie-note")?.remove();
          break;
        case "delete-list":
          openModal(
            "Delete this selection?",
            '<p>Your photographs stay in the collection. Only this favorites list will be removed.</p><div class="modal-actions"><button class="secondary" data-action="favorites">Keep selection</button><button class="primary" data-action="confirm-delete-list">Delete selection</button></div>',
          );
          break;
        case "confirm-delete-list":
          await api(
            endpoint + "/favorites/" + encodeURIComponent(activeList.id),
            {},
            "DELETE",
          );
          lists = lists.filter((l) => l.id !== activeList.id);
          activeList = lists[0] || null;
          closeModal();
          renderPhotos();
          notice("Selection deleted");
          break;
        case "close-viewer":
          closeViewer();
          break;
        case "previous":
          moveViewer(-1);
          break;
        case "next":
          moveViewer(1);
          break;
        case "download":
          download();
          break;
        case "viewer-download":
          download([visiblePhotos[viewerIndex].id]);
          break;
        case "favorites":
          await favorites();
          break;
        case "recover-favorites":
          recoveryForm();
          break;
        case "viewer-favorite":
          await favorite(visiblePhotos[viewerIndex].id);
          break;
        case "share":
          await share();
          break;
        case "more":
          more();
          break;
        case "slideshow":
          closeModal();
          if (visiblePhotos.length) {
            openViewer(0);
            toggleSlideshow();
          }
          break;
        case "toggle-slideshow":
          toggleSlideshow();
          break;
      }
    } catch (error) {
      notice(error.message);
    }
  });
  viewer.addEventListener("cancel", (e) => { e.preventDefault(); closeViewer(); });
  viewer.addEventListener("keydown", (e) => {
    if (modal.open) return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      moveViewer(1);
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      moveViewer(-1);
    }
    if (
      e.key === " " &&
      settings().slideshow !== false &&
      !["INPUT", "TEXTAREA", "BUTTON"].includes(e.target.tagName)
    ) {
      e.preventDefault();
      toggleSlideshow();
    }
  });
  viewer.addEventListener(
    "touchstart",
    (e) => {
      touchX = e.changedTouches[0].clientX;
      touchY = e.changedTouches[0].clientY;
    },
    { passive: true },
  );
  viewer.addEventListener(
    "touchend",
    (e) => {
      if (modal.open || e.target.closest("video,iframe")) return;
      const delta = e.changedTouches[0].clientX - touchX;
      const vertical = e.changedTouches[0].clientY - touchY;
      if (Math.abs(delta) > 65 && Math.abs(delta) > Math.abs(vertical) * 1.3)
        moveViewer(delta < 0 ? 1 : -1);
    },
    { passive: true },
  );
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && slideTimer) {
      clearInterval(slideTimer);
      slideTimer = null;
      if (viewer.open) paintViewer();
    }
  });
  if (studioPreview)
    window.addEventListener("message", (event) => {
      if (
        event.origin !== location.origin ||
        event.source !== window.parent ||
        event.data?.type !== "client-design-preview" ||
        !collection
      )
        return;
      const payload = event.data;
      if (
        payload.design &&
        typeof payload.design === "object" &&
        !Array.isArray(payload.design)
      )
        collection.design = { ...collection.design, ...payload.design };
      if (Object.prototype.hasOwnProperty.call(payload, "coverId")) {
        const photo = (collection.photos || []).find(
          (p) => p.id === payload.coverId,
        );
        if (photo) {
          collection.coverId = photo.id;
          collection.coverUrl = photo.url || photo.thumbnailUrl || "";
        }
      }
      theme(collection.design);
      renderGallery();
    });
  load();
})();
