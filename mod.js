/**
 * tuckzed mods — Mod Detail Page
 * Gallery + lightbox, description, likes, comments and related mods.
 */

'use strict';

let currentMod = null;
let galleryImages = [];
let activeImageIndex = 0;
let isLightboxOpen = false;
let lightboxOpenTimestamp = 0;
let lightboxPrevFocus = null;

function truncateWords(text, limit = 40) {
  if (!text) return '';
  const words = text.trim().split(/\s+/);
  if (words.length <= limit) return text;
  return words.slice(0, limit).join(' ') + '…';
}

function goToMod(id, e) {
  if (e && e.target && e.target.closest('.mod-card__dl-btn')) return;
  window.location.href = `mod.html?id=${encodeURIComponent(id)}`;
}
window.goToMod = goToMod;

function isAdminUser(user) {
  return !!(user && user.email && window.TZ_AUTH && window.TZ_AUTH.ADMIN_EMAIL
    && user.email.toLowerCase() === window.TZ_AUTH.ADMIN_EMAIL.toLowerCase());
}

// ── Boot ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  restoreBackLink();
  const params = new URLSearchParams(window.location.search);
  const modId = params.get('id');

  if (!modId) {
    showNotFound();
    return;
  }

  const { Store } = window.TZ;
  currentMod = Store.getById(modId);

  // Render straight from cache if we have it, then refresh with live data
  if (currentMod) renderMod(currentMod);

  if (Store.fetchFromRemote) {
    await Store.fetchFromRemote();
    const fresh = Store.getById(modId);
    if (fresh) {
      currentMod = fresh;
      renderMod(currentMod);
    }
  }

  if (!currentMod) showNotFound();

  if (currentMod) {
    try { window.TZ.Store.rememberRecentMod(currentMod); } catch (_) {}
  }

  bindGalleryControls();
  bindGallerySwipe();
  initStickyDownload();
  renderSiblingNav(modId);

  if (window.TZ_AUTH && window.TZ_AUTH.onChange) {
    window.TZ_AUTH.onChange(user => {
      const editWrap = document.getElementById('admin-edit-wrap');
      if (editWrap) editWrap.style.display = isAdminUser(user) ? 'block' : 'none';
      if (currentMod) updateAuthUI();
    });
  }
});

function bindGalleryControls() {
  const expandBtn = document.getElementById('gallery-expand-btn');
  if (expandBtn) {
    expandBtn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); openLightbox(e); });
  }

  const mainWrap = document.getElementById('main-img-wrap');
  if (mainWrap) {
    mainWrap.addEventListener('click', e => {
      if (e.target && e.target.closest('.mod-detail__nav-btn')) return;
      e.preventDefault();
      openLightbox(e);
    });
  }

  const bind = (id, fn) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); fn(); });
  };
  bind('lightbox-close-btn', closeLightbox);
  bind('lightbox-prev-btn', prevImage);
  bind('lightbox-next-btn', nextImage);

  const lbOverlay = document.getElementById('lightbox-overlay');
  if (lbOverlay) lbOverlay.addEventListener('click', e => closeLightbox(e));

  // Basic swipe support for the lightbox on touch devices
  let touchStartX = null;
  if (lbOverlay) {
    lbOverlay.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
    lbOverlay.addEventListener('touchend', e => {
      if (touchStartX === null) return;
      const dx = e.changedTouches[0].clientX - touchStartX;
      touchStartX = null;
      if (Math.abs(dx) > 50) { dx > 0 ? prevImage() : nextImage(); }
    }, { passive: true });
  }

  document.addEventListener('keydown', e => {
    const tag = (e.target && e.target.tagName) || '';
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable);
    if (e.key === 'Escape' && isLightboxOpen) {
      closeLightbox();
      return;
    }
    if (typing) return;
    if (galleryImages.length <= 1) return;
    if (e.key === 'ArrowLeft') prevImage();
    if (e.key === 'ArrowRight') nextImage();
  });
}

// ── Auth-dependent UI ──────────────────────────────────────
function updateAuthUI() {
  const formWrap = document.getElementById('comment-form-wrap');
  const loginPrompt = document.getElementById('comment-login-prompt');
  const likeBtn = document.getElementById('mod-like-btn');
  const user = window.TZ_AUTH ? window.TZ_AUTH.currentUser() : null;

  if (user) {
    if (formWrap) formWrap.style.display = 'block';
    if (loginPrompt) loginPrompt.style.display = 'none';
    if (currentMod) {
      window.TZ.Store.getModLikeStatus(currentMod.id).then(isLiked => setLikeButton(isLiked, currentMod.likes || 0));
      window.TZ.Store.getWishlistStatus(currentMod.id).then(isWished => setWishlistButton(isWished));
    }
  } else {
    if (formWrap) formWrap.style.display = 'none';
    if (loginPrompt) {
      loginPrompt.style.display = 'block';
      const link = loginPrompt.querySelector('a');
      if (link && window.TZ.authRedirectUrl) link.href = window.TZ.authRedirectUrl();
    }
    if (likeBtn && currentMod) setLikeButton(false, currentMod.likes || 0);
    setWishlistButton(false);
  }
}

function setLikeButton(isLiked, count, animate) {
  const likeBtn = document.getElementById('mod-like-btn');
  if (!likeBtn) return;
  likeBtn.innerHTML = `<span>${isLiked ? '❤️ Liked' : '🤍 Like'} (<span id="mod-likes-count">${window.TZ.formatCount(count)}</span>)</span>`;
  likeBtn.dataset.liked = isLiked ? 'true' : 'false';
  likeBtn.setAttribute('aria-pressed', isLiked ? 'true' : 'false');
  likeBtn.classList.toggle('btn--liked', isLiked);
  if (animate) {
    likeBtn.classList.remove('btn--pop');
    void likeBtn.offsetWidth;
    likeBtn.classList.add('btn--pop');
  }
}

function setWishlistButton(isWished) {
  const btn = document.getElementById('mod-wishlist-btn');
  if (!btn) return;
  btn.innerHTML = `<span>${isWished ? '★ Wishlisted' : '☆ Wishlist'}</span>`;
  btn.dataset.wished = isWished ? 'true' : 'false';
  btn.setAttribute('aria-pressed', isWished ? 'true' : 'false');
}

function requireSignIn(message) {
  const href = window.TZ.authRedirectUrl
    ? window.TZ.authRedirectUrl()
    : 'auth.html?redirect=' + encodeURIComponent('mod.html' + window.location.search);
  window.TZ.showToast(message, { action: { label: 'Sign in', href } });
}

function showNotFound() {
  document.getElementById('mod-loading').style.display = 'none';
  document.getElementById('mod-content').style.display = 'none';
  document.getElementById('mod-not-found').style.display = 'block';
  document.title = 'Mod Not Found — tuckzed mods';
}

// ── Meta tags for sharing ──────────────────────────────────
function setMeta(selector, content) {
  const el = document.querySelector(selector);
  if (el) el.setAttribute('content', content);
}

function updatePageMeta(mod) {
  const title = `${mod.title} — tuckzed mods`;
  const desc = truncateWords(window.TZ.stripMarkdown(mod.description), 30)
    || 'View mod details, screenshots, and download links on tuckzed mods.';
  document.title = title;
  setMeta('meta[name="description"]', desc);
  setMeta('meta[property="og:title"]', title);
  setMeta('meta[property="og:description"]', desc);
  setMeta('meta[name="twitter:title"]', title);
  setMeta('meta[name="twitter:description"]', desc);
  if (mod.coverImage) {
    setMeta('meta[property="og:image"]', mod.coverImage);
    setMeta('meta[name="twitter:image"]', mod.coverImage);
  }
  const url = window.location.origin + window.location.pathname.replace(/\.html$/, '') + '?id=' + encodeURIComponent(mod.id);
  setMeta('meta[property="og:url"]', url);
  const canonical = document.querySelector('link[rel="canonical"]');
  if (canonical) canonical.setAttribute('href', url);

  // JSON-LD for search engines
  let ld = document.getElementById('mod-jsonld');
  if (!ld) {
    ld = document.createElement('script');
    ld.type = 'application/ld+json';
    ld.id = 'mod-jsonld';
    document.head.appendChild(ld);
  }
  ld.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: mod.title,
    description: desc,
    applicationCategory: 'GameMod',
    operatingSystem: mod.game === 'ac' ? 'Assetto Corsa' : (mod.game === 'beamng' ? 'BeamNG.drive' : 'PC'),
    image: mod.coverImage || undefined,
    url,
    downloadUrl: mod.downloadUrl || undefined,
    interactionStatistic: {
      '@type': 'InteractionCounter',
      interactionType: 'https://schema.org/DownloadAction',
      userInteractionCount: mod.downloads || 0
    }
  });
}

function restoreBackLink() {
  const back = document.getElementById('back-btn');
  if (!back) return;
  try {
    const saved = sessionStorage.getItem('tz_browse');
    if (saved && (saved.startsWith('./') || saved.startsWith('/') || saved.startsWith('index') || saved.includes('#mods'))) {
      back.href = saved;
      return;
    }
  } catch (_) {}
  back.href = './#mods';
}

// ── Render ─────────────────────────────────────────────────
function renderMod(mod) {
  const { GAMES, CATEGORY_ICONS, escapeHtml, formatDate, formatCount, parseTags } = window.TZ;
  const game = GAMES[mod.game];
  const catIcon = CATEGORY_ICONS[mod.category] || '📦';

  updatePageMeta(mod);

  const setText = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };

  setText('mod-game-badge', game ? game.name : mod.game);
  setText('mod-cat-badge', `${catIcon} ${mod.category}`);
  setText('mod-version-badge', 'v' + mod.version);
  setText('mod-title', mod.title);

  const tagsEl = document.getElementById('mod-tags');
  if (tagsEl) {
    const tags = parseTags(mod.tags);
    tagsEl.innerHTML = tags.map(t =>
      `<a class="badge badge--outline mod-card__tag" href="./?tag=${encodeURIComponent(t)}#mods" title="Browse all #${escapeHtml(t)} mods">#${escapeHtml(t)}</a>`
    ).join(' ');
    tagsEl.style.display = tags.length ? '' : 'none';
  }

  setText('mod-game-name', game ? game.name : mod.game);
  setText('mod-cat-name', mod.category);
  setText('mod-version', 'v' + mod.version);
  const updatedRow = document.getElementById('meta-updated-row');
  const updatedEl = document.getElementById('mod-updated');
  if (updatedRow && updatedEl) {
    const updated = mod.updatedAtIso || mod.updatedAt;
    const created = mod.createdAtIso || mod.createdAt;
    if (updated && created && String(updated).slice(0, 10) !== String(created).slice(0, 10)) {
      updatedEl.textContent = formatDate(mod.updatedAt || updated);
      updatedRow.style.display = '';
    } else {
      updatedRow.style.display = 'none';
    }
  }
  const sizeRow = document.getElementById('meta-size-row');
  const sizeEl = document.getElementById('mod-file-size');
  if (sizeRow && sizeEl) {
    if (mod.fileSize) { sizeEl.textContent = mod.fileSize; sizeRow.style.display = ''; }
    else sizeRow.style.display = 'none';
  }
  const compatRow = document.getElementById('meta-compat-row');
  const compatEl = document.getElementById('mod-compatibility');
  if (compatRow && compatEl) {
    if (mod.compatibility) {
      compatEl.textContent = mod.compatibility;
      compatRow.style.display = '';
    } else {
      compatRow.style.display = 'none';
    }
  }
  const dateEl = document.getElementById('mod-date');
  if (dateEl) {
    dateEl.textContent = formatDate(mod.createdAt);
    dateEl.setAttribute('title', mod.createdAtIso || mod.createdAt);
  }
  setText('mod-author', mod.createdBy || 'admin');
  const downloadsEl = document.getElementById('mod-downloads');
  if (downloadsEl) {
    downloadsEl.textContent = formatCount(mod.downloads);
    downloadsEl.dataset.raw = String(mod.downloads || 0);
  }

  // Gallery images (cover first)
  let rawImages = [];
  if (Array.isArray(mod.images)) {
    rawImages = mod.images.filter(img => typeof img === 'string' && img.trim().length > 0);
  } else if (typeof mod.images === 'string' && mod.images.trim()) {
    try {
      const parsed = JSON.parse(mod.images);
      if (Array.isArray(parsed)) rawImages = parsed.filter(img => typeof img === 'string' && img.trim());
      else if (typeof parsed === 'string' && parsed.trim()) rawImages = [parsed.trim()];
    } catch (_) {
      rawImages = [mod.images.trim()];
    }
  }
  const cover = mod.coverImage || (rawImages[0] || '');
  galleryImages = cover ? [cover, ...rawImages.filter(img => img !== cover)] : [...rawImages];

  setText('mod-images-count', String(galleryImages.length));
  activeImageIndex = 0;
  setupGallery();

  // Description (Markdown → sanitised HTML)
  const descEl = document.getElementById('mod-description');
  if (descEl) {
    if (window.marked && typeof marked.parse === 'function') {
      const html = marked.parse(mod.description || '', { breaks: true });
      descEl.innerHTML = window.DOMPurify ? window.DOMPurify.sanitize(html, { ADD_ATTR: ['target'] }) : html;
      descEl.querySelectorAll('a[href]').forEach(a => {
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer');
      });
    } else {
      descEl.textContent = mod.description || '';
    }
    setupReadMore(descEl);
  }

  renderVideo(mod);
  renderInstallBlock(mod);
  renderMirrors(mod);
  renderModCollections(mod.id);

  const changelogEl = document.getElementById('mod-changelog');
  if (changelogEl) {
    const entries = Array.isArray(mod.changelog) ? mod.changelog : [];
    if (entries.length) {
      changelogEl.style.display = '';
      changelogEl.innerHTML = `<h3 class="mod-changelog__title">Changelog</h3>` + entries.map(e => {
        const ver = escapeHtml(e.version || e.v || '');
        const notes = escapeHtml(e.notes || e.text || e.changes || '');
        const when = e.date ? ` <time>${escapeHtml(formatDate(e.date))}</time>` : '';
        return `<p class="mod-changelog__item"><span class="mod-changelog__ver">v${ver}</span>${when}${notes ? ' — ' + notes : ''}</p>`;
      }).join('');
    } else {
      changelogEl.style.display = 'none';
      changelogEl.innerHTML = '';
    }
  }

  // Download button
  const dlBtn = document.getElementById('mod-dl-btn');
  if (dlBtn) {
    if (!mod.downloadUrl) {
      dlBtn.classList.add('disabled');
      dlBtn.setAttribute('aria-disabled', 'true');
      dlBtn.textContent = 'No Download Link';
    } else {
      dlBtn.classList.remove('disabled');
      dlBtn.removeAttribute('aria-disabled');
      dlBtn.textContent = '⬇ Download Mod';
    }
  }

  loadComments(mod.id);
  setLikeButton(document.getElementById('mod-like-btn')?.dataset.liked === 'true', mod.likes || 0);
  updateAuthUI();
  renderRelatedMods(mod);
  renderAlsoLiked(mod);
  const stickyTitle = document.getElementById('mod-sticky-title');
  if (stickyTitle) stickyTitle.textContent = mod.title;

  const editWrap = document.getElementById('admin-edit-wrap');
  if (editWrap) {
    const editLink = editWrap.querySelector('a');
    if (editLink) editLink.href = 'admin.html?edit=' + encodeURIComponent(mod.id);
  }

  document.getElementById('mod-loading').style.display = 'none';
  document.getElementById('mod-not-found').style.display = 'none';
  const content = document.getElementById('mod-content');
  content.style.display = 'block';
  content.classList.add('content-enter');
}

// ── Gallery ────────────────────────────────────────────────
function setupGallery() {
  const mainImg = document.getElementById('main-img');
  const prevBtn = document.getElementById('gallery-prev-btn');
  const nextBtn = document.getElementById('gallery-next-btn');
  const counter = document.getElementById('gallery-counter');
  const thumbs = document.getElementById('gallery-thumbs');

  if (galleryImages.length === 0) {
    mainImg.removeAttribute('src');
    mainImg.alt = 'No preview available';
    mainImg.style.background = 'var(--gray-100)';
    mainImg.style.minHeight = '220px';
    prevBtn.style.display = 'none';
    nextBtn.style.display = 'none';
    counter.style.display = 'none';
    thumbs.style.display = 'none';
    galleryImages = [];
    return;
  }

  updateMainImage();

  if (galleryImages.length > 1) {
    prevBtn.style.display = 'flex';
    nextBtn.style.display = 'flex';
    counter.style.display = 'block';
    thumbs.style.display = 'flex';
    thumbs.innerHTML = galleryImages.map((url, idx) => `
      <button
        type="button"
        class="mod-detail__thumb-btn ${idx === activeImageIndex ? 'active' : ''}"
        id="thumb-btn-${idx}"
        role="tab"
        aria-selected="${idx === activeImageIndex}"
        onclick="setImageIndex(${idx})"
        aria-label="View screenshot ${idx + 1}"
      >
        <img src="${window.TZ.escapeHtml(url)}" alt="Thumbnail ${idx + 1}" class="mod-detail__thumb-img" loading="lazy" onerror="this.style.opacity='0.3'" />
      </button>
    `).join('');
  } else {
    prevBtn.style.display = 'none';
    nextBtn.style.display = 'none';
    counter.style.display = 'none';
    thumbs.style.display = 'none';
  }
}

function openLightbox(e) {
  if (e) {
    if (typeof e.stopPropagation === 'function') e.stopPropagation();
    if (typeof e.preventDefault === 'function') e.preventDefault();
  }
  if (!galleryImages || galleryImages.length === 0) {
    const mainImg = document.getElementById('main-img');
    if (mainImg && mainImg.src) { galleryImages = [mainImg.src]; activeImageIndex = 0; }
    else return;
  }
  if (activeImageIndex < 0 || activeImageIndex >= galleryImages.length) activeImageIndex = 0;

  isLightboxOpen = true;
  lightboxOpenTimestamp = Date.now();
  lightboxPrevFocus = document.activeElement;

  const overlay = document.getElementById('lightbox-overlay');
  if (overlay) {
    overlay.classList.add('open');
    overlay.style.display = 'flex';
    overlay.setAttribute('aria-hidden', 'false');
  }
  document.body.style.overflow = 'hidden';
  document.body.classList.add('lightbox-open');
  updateLightbox();
  const closeBtn = document.getElementById('lightbox-close-btn');
  if (closeBtn) closeBtn.focus();
  document.addEventListener('keydown', lightboxFocusTrap);
}
window.openLightbox = openLightbox;

function lightboxFocusTrap(e) {
  if (!isLightboxOpen || e.key !== 'Tab') return;
  const overlay = document.getElementById('lightbox-overlay');
  if (!overlay) return;
  const focusables = overlay.querySelectorAll('button, [href], [tabindex]:not([tabindex="-1"])');
  const list = Array.prototype.filter.call(focusables, el => !el.disabled && el.offsetParent !== null);
  if (list.length === 0) return;
  const first = list[0];
  const last = list[list.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

function closeLightbox(e) {
  // Ignore the click that opened the lightbox bubbling up to the overlay
  if (Date.now() - lightboxOpenTimestamp < 250) return;
  if (e && e.target && (e.target.closest('.lightbox-img-wrap') || e.target.closest('.lightbox-nav-btn') || e.target.closest('.lightbox-counter'))) {
    return;
  }
  isLightboxOpen = false;
  document.removeEventListener('keydown', lightboxFocusTrap);
  const overlay = document.getElementById('lightbox-overlay');
  if (overlay) {
    overlay.classList.remove('open');
    overlay.style.display = 'none';
    overlay.setAttribute('aria-hidden', 'true');
  }
  document.body.style.overflow = '';
  document.body.classList.remove('lightbox-open');
  const expandBtn = document.getElementById('gallery-expand-btn');
  if (lightboxPrevFocus && typeof lightboxPrevFocus.focus === 'function') {
    try { lightboxPrevFocus.focus(); } catch (_) {}
  } else if (expandBtn) {
    expandBtn.focus();
  }
}
window.closeLightbox = closeLightbox;

function updateLightbox() {
  if (!isLightboxOpen) return;
  const lbImg = document.getElementById('lightbox-img');
  const lbCounter = document.getElementById('lightbox-counter');
  const lbPrev = document.getElementById('lightbox-prev-btn');
  const lbNext = document.getElementById('lightbox-next-btn');

  const currentUrl = (galleryImages && galleryImages[activeImageIndex])
    ? galleryImages[activeImageIndex]
    : (document.getElementById('main-img')?.src || '');

  if (currentUrl && lbImg) {
    lbImg.src = currentUrl;
    lbImg.alt = `${currentMod ? currentMod.title : 'Mod'} screenshot ${activeImageIndex + 1}`;
  }

  const multi = galleryImages && galleryImages.length > 1;
  if (lbCounter) lbCounter.textContent = multi ? `${activeImageIndex + 1} / ${galleryImages.length}` : '1 / 1';
  if (lbPrev) lbPrev.style.display = multi ? 'flex' : 'none';
  if (lbNext) lbNext.style.display = multi ? 'flex' : 'none';
}

function updateMainImage() {
  const mainImg = document.getElementById('main-img');
  const counter = document.getElementById('gallery-counter');
  const currentUrl = galleryImages[activeImageIndex];

  if (currentUrl) {
    mainImg.onerror = () => {
      mainImg.onerror = null;
      mainImg.removeAttribute('src');
      mainImg.alt = 'Preview unavailable';
      mainImg.style.background = 'var(--gray-100)';
      mainImg.style.minHeight = '220px';
    };
    mainImg.src = currentUrl;
    mainImg.alt = `${currentMod ? currentMod.title : 'Mod'} screenshot ${activeImageIndex + 1}`;
  }
  if (counter && galleryImages.length > 1) {
    counter.textContent = `${activeImageIndex + 1} / ${galleryImages.length}`;
  }

  galleryImages.forEach((_, idx) => {
    const btn = document.getElementById(`thumb-btn-${idx}`);
    if (!btn) return;
    const active = idx === activeImageIndex;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', String(active));
    if (active) btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  });

  if (isLightboxOpen) updateLightbox();
}

function setImageIndex(idx) {
  if (idx >= 0 && idx < galleryImages.length) {
    activeImageIndex = idx;
    updateMainImage();
  }
}
window.setImageIndex = setImageIndex;

function prevImage() {
  if (galleryImages.length <= 1) return;
  activeImageIndex = (activeImageIndex - 1 + galleryImages.length) % galleryImages.length;
  updateMainImage();
}
window.prevImage = prevImage;

function nextImage() {
  if (galleryImages.length <= 1) return;
  activeImageIndex = (activeImageIndex + 1) % galleryImages.length;
  updateMainImage();
}
window.nextImage = nextImage;

// ── Related mods ───────────────────────────────────────────
function renderRelatedMods(mod) {
  const { Store, GAMES, CATEGORY_ICONS, escapeHtml, formatDate } = window.TZ;
  const relatedGrid = document.getElementById('related-grid');
  const relatedSection = document.getElementById('related-section');

  // Prefer same game + same category, then same game, then same category
  const others = Store.sortNewest(Store.getAll().filter(m => m.id !== mod.id));
  const score = m => (m.game === mod.game ? 2 : 0) + (m.category === mod.category ? 1 : 0);
  const related = others.filter(m => score(m) > 0).sort((a, b) => score(b) - score(a)).slice(0, 3);

  if (related.length === 0) {
    relatedSection.style.display = 'none';
    return;
  }

  relatedSection.style.display = 'block';
  relatedGrid.innerHTML = related.map(m => {
    const game = GAMES[m.game];
    const icon = CATEGORY_ICONS[m.category] || '📦';
    const href = `mod.html?id=${encodeURIComponent(m.id)}`;
    const imgHtml = m.coverImage
      ? `<img src="${escapeHtml(m.coverImage)}" alt="" class="mod-card__img img-fade" loading="lazy" decoding="async" onload="this.classList.add('is-loaded')" onerror="this.parentElement.innerHTML='<div class=\\'mod-card__img-placeholder\\'>${icon}</div>'" />`
      : `<div class="mod-card__img-placeholder">${icon}</div>`;
    const imgBadge = (Array.isArray(m.images) && m.images.length > 1)
      ? `<span class="mod-card__img-badge">📷 ${m.images.length}</span>`
      : '';

    return `
      <article class="mod-card" id="rel-card-${escapeHtml(m.id)}" role="listitem" data-mod-id="${escapeHtml(m.id)}">
        <a href="${href}" class="mod-card__hit" aria-label="View ${escapeHtml(m.title)}">
          <div class="mod-card__img-wrap">${imgHtml}${imgBadge}</div>
          <div class="mod-card__body">
            <div class="mod-card__tags">
              <span class="badge badge--filled">${escapeHtml(game?.name || m.game)}</span>
              <span class="badge badge--gray">${escapeHtml(m.category)}</span>
            </div>
            <h3 class="mod-card__title">${escapeHtml(m.title)}</h3>
            <p class="mod-card__desc">${escapeHtml(truncateWords(window.TZ.stripMarkdown(m.description), 40))}</p>
            <div class="mod-card__meta">
              <span class="mod-card__version">v${escapeHtml(m.version)}</span>
              <time datetime="${escapeHtml(m.createdAt)}">${escapeHtml(formatDate(m.createdAt))}</time>
            </div>
          </div>
        </a>
        <div class="mod-card__footer">
          <a href="${href}" class="btn btn--primary mod-card__dl-btn" id="rel-view-btn-${escapeHtml(m.id)}">View Mod →</a>
        </div>
      </article>`;
  }).join('');
}

// ── Actions: like / download / share ───────────────────────
window.handleLikeToggle = async function (e) {
  e.preventDefault();
  if (!window.TZ_AUTH || !window.TZ_AUTH.currentUser()) {
    requireSignIn('Sign in to like this mod.');
    return;
  }
  if (!currentMod) return;
  const likeBtn = document.getElementById('mod-like-btn');
  const newLikedState = likeBtn.dataset.liked !== 'true';
  const prevLikes = currentMod.likes || 0;
  const optimisticLikes = Math.max(0, prevLikes + (newLikedState ? 1 : -1));

  // Optimistic UI for instant feedback
  setLikeButton(newLikedState, optimisticLikes, true);
  likeBtn.disabled = true;
  const result = await window.TZ.Store.toggleLike(currentMod.id, newLikedState);
  likeBtn.disabled = false;

  if (!result || !result.ok) {
    setLikeButton(!newLikedState, prevLikes);
    window.TZ.showToast('Could not update like. Please try again.');
    return;
  }
  currentMod.likes = result.likes;
  setLikeButton(newLikedState, result.likes);
};

window.handleWishlistToggle = async function (e) {
  e.preventDefault();
  if (!window.TZ_AUTH || !window.TZ_AUTH.currentUser()) {
    requireSignIn('Sign in to save this mod to your wishlist.');
    return;
  }
  if (!currentMod) return;
  const btn = document.getElementById('mod-wishlist-btn');
  const next = btn.dataset.wished !== 'true';
  setWishlistButton(next);
  btn.disabled = true;
  const result = await window.TZ.Store.toggleWishlist(currentMod.id, next);
  btn.disabled = false;
  if (!result || !result.ok) {
    setWishlistButton(!next);
    window.TZ.showToast('Could not update wishlist. Please try again.');
    return;
  }
  window.TZ.showToast(next ? '★ Added to wishlist' : 'Removed from wishlist');
};

window.handleModDownload = function (e) {
  e.preventDefault();
  if (!currentMod || !currentMod.downloadUrl) {
    window.TZ.showToast('No download link is available for this mod.');
    return;
  }
  window.TZ.Store.incrementDownloads(currentMod.id);
  window.open(currentMod.downloadUrl, '_blank', 'noopener,noreferrer');
  const dlEl = document.getElementById('mod-downloads');
  if (dlEl) {
    const next = (parseInt(dlEl.dataset.raw, 10) || 0) + 1;
    dlEl.dataset.raw = String(next);
    dlEl.textContent = window.TZ.formatCount(next);
  }
};

window.handleShare = async function (e) {
  if (e) e.preventDefault();
  if (!currentMod) return;
  const url = window.location.origin + window.location.pathname.replace(/\.html$/, '') + '?id=' + encodeURIComponent(currentMod.id);
  const title = `${currentMod.title} — tuckzed mods`;

  if (navigator.share) {
    try {
      await navigator.share({ title, url });
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    window.TZ.showToast('🔗 Link copied to clipboard!');
  } catch (_) {
    window.TZ.promptDialog('Copy this link to share the mod:', { title: 'Share mod', defaultValue: url, confirmText: 'Done', required: false });
  }
};

// ── Comments ───────────────────────────────────────────────
const COMMENTS_PAGE_SIZE = 20;
let commentsRootOffset = 0;
let commentsHasMore = false;
let commentSort = 'newest';
let lastCommentsPayload = [];

function highlightCommentFromHash() {
  const match = (window.location.hash || '').match(/^#comment-(.+)$/);
  if (!match) return;
  const el = document.getElementById('comment-' + match[1]);
  if (!el) return;
  el.classList.add('comment--highlight');
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function loadComments(modId, append = false) {
  const commentsList = document.getElementById('comments-list');
  const countEl = document.getElementById('comments-count');
  const moreWrap = document.getElementById('comments-more-wrap');
  const { escapeHtml, timeAgo } = window.TZ;

  if (!append) {
    commentsRootOffset = 0;
    commentsHasMore = false;
    if (commentsList) commentsList.innerHTML = '<p class="comments-empty">Loading comments…</p>';
  }

  const result = await window.TZ.Store.getComments(modId, {
    limit: COMMENTS_PAGE_SIZE,
    offset: commentsRootOffset
  });
  // The mod may have changed while we were waiting
  if (!currentMod || currentMod.id !== modId) return;

  if (result === null) {
    commentsList.innerHTML = '<p class="comments-empty">Failed to load comments. Please try again later.</p>';
    countEl.textContent = '0';
    if (moreWrap) moreWrap.style.display = 'none';
    return;
  }

  const comments = Array.isArray(result) ? result : (result.comments || []);
  const totalRoots = Array.isArray(result) ? comments.filter(c => !c.parent_id).length : (result.total || 0);
  commentsHasMore = Array.isArray(result) ? false : !!result.hasMore;
  countEl.textContent = String(totalRoots);

  if (!append && comments.length === 0) {
    commentsList.innerHTML = '<p class="comments-empty">No comments yet. Be the first!</p>';
    if (moreWrap) moreWrap.style.display = 'none';
    return;
  }

  lastCommentsPayload = comments;
  const commentsByParent = {};
  comments.forEach(c => {
    const pid = c.parent_id || 'root';
    (commentsByParent[pid] = commentsByParent[pid] || []).push(c);
  });
  const sortRoots = (list) => {
    const copy = [...list];
    copy.sort((a, b) => {
      const pin = Number(!!b.pinned) - Number(!!a.pinned);
      if (pin) return pin;
      if (commentSort === 'oldest') return String(a.created_at || '').localeCompare(String(b.created_at || ''));
      if (commentSort === 'liked') return ((reactionMap[b.id] && reactionMap[b.id].count) || 0) - ((reactionMap[a.id] && reactionMap[a.id].count) || 0);
      return String(b.created_at || '').localeCompare(String(a.created_at || ''));
    });
    return copy;
  };

  const reactionMap = await window.TZ.Store.getCommentReactionCounts(comments.map(c => c.id));
  if (!currentMod || currentMod.id !== modId) return;

  const currentUser = window.TZ_AUTH ? window.TZ_AUTH.currentUser() : null;
  const isAdmin = isAdminUser(currentUser);

  function renderCommentNode(c, depth = 0) {
    const name = c.display_name || c.username || c.user_email || '?';
    const avatarHtml = c.avatar_url
      ? `<img src="${escapeHtml(c.avatar_url)}" alt="" class="comment__avatar" loading="lazy">`
      : `<div class="comment__avatar-fallback" aria-hidden="true">${escapeHtml(name[0].toUpperCase())}</div>`;

    const isOwner = currentUser && currentUser.email === c.user_email;
    const canDelete = isOwner || isAdmin;
    const canReply = !!currentUser && depth < 3;
    const created = c.created_at ? new Date(c.created_at) : null;
    const edited = c.updated_at && c.created_at && (new Date(c.updated_at) - new Date(c.created_at) > 60000);
    const rx = reactionMap[c.id] || { count: 0, mine: false };

    const actionsHtml = `
      ${isAdmin ? `<button type="button" class="comment__action" onclick="pinComment('${escapeHtml(c.id)}', ${c.pinned ? 'false' : 'true'})">${c.pinned ? 'Unpin' : 'Pin'}</button>` : ''}
      ${isOwner ? `<button type="button" class="comment__action" onclick="editComment('${escapeHtml(c.id)}')">Edit</button>` : ''}
      ${canDelete ? `<button type="button" class="comment__action comment__action--danger" onclick="deleteComment('${escapeHtml(c.id)}')">Delete</button>` : ''}
      ${!isOwner ? `<button type="button" class="comment__action comment__action--icon" onclick="reportComment('${escapeHtml(c.id)}')" title="Report this comment" aria-label="Report this comment">🚩</button>` : ''}`;

    const children = (commentsByParent[c.id] || []).map(child => renderCommentNode(child, depth + 1)).join('');

    return `
      <div class="comment${depth > 0 ? ' comment--reply' : ''}" id="comment-${escapeHtml(c.id)}">
        <div class="comment__box">
          ${avatarHtml}
          <div class="comment__body">
            <div class="comment__head">
              <span class="comment__author">${escapeHtml(name)}${c.pinned ? ' · 📌 Pinned' : ''}</span>
              <div class="comment__meta">
                ${actionsHtml}
                <time datetime="${created ? created.toISOString() : ''}" title="${created ? created.toLocaleString() : ''}">${timeAgo(c.created_at)}${edited ? ' · edited' : ''}</time>
              </div>
            </div>
            <p class="comment__text" id="comment-text-${escapeHtml(c.id)}" data-raw="${escapeHtml(c.comment)}">${escapeHtml(c.comment)}</p>
            <div class="comment__edit-form" id="comment-edit-${escapeHtml(c.id)}" style="display:none;"></div>
            <div class="comment__footer-actions">
              <button type="button" class="comment__action comment__react-btn${rx.mine ? ' is-active' : ''}" data-count="${rx.count}" aria-pressed="${rx.mine ? 'true' : 'false'}" onclick="toggleCommentReaction('${escapeHtml(c.id)}', this)">👍 ${rx.count || ''}</button>
              ${canReply ? `<button type="button" class="comment__action comment__reply-btn" onclick="showReplyForm('${escapeHtml(c.id)}')">↩ Reply</button>` : ''}
            </div>
            <div class="comment__form" id="reply-form-${escapeHtml(c.id)}" style="display:none;">
              <label class="sr-only" for="reply-input-${escapeHtml(c.id)}">Write a reply</label>
              <textarea class="input" id="reply-input-${escapeHtml(c.id)}" rows="2" maxlength="2000" placeholder="Write a reply…"></textarea>
              <div class="comment__form-actions">
                <button type="button" class="btn btn--sm btn--ghost" onclick="hideReplyForm('${escapeHtml(c.id)}')">Cancel</button>
                <button type="button" class="btn btn--sm btn--primary" onclick="submitReply('${escapeHtml(c.id)}', this)">Post Reply</button>
              </div>
            </div>
          </div>
        </div>
        ${children ? `<div class="comment__children">${children}</div>` : ''}
      </div>`;
  }

  const html = sortRoots(commentsByParent['root'] || []).map(c => renderCommentNode(c, 0)).join('');
  if (append) {
    commentsList.insertAdjacentHTML('beforeend', html);
  } else {
    commentsList.innerHTML = html;
  }

  commentsRootOffset += (commentsByParent['root'] || []).length;
  if (moreWrap) moreWrap.style.display = commentsHasMore ? '' : 'none';
  highlightCommentFromHash();
}

window.loadMoreComments = function () {
  if (!currentMod || !commentsHasMore) return;
  loadComments(currentMod.id, true);
};

window.toggleCommentReaction = async function (commentId, btn) {
  if (!window.TZ_AUTH || !window.TZ_AUTH.currentUser()) {
    requireSignIn('Sign in to react to comments.');
    return;
  }
  const mine = btn.classList.contains('is-active');
  const prev = Number(btn.dataset.count) || 0;
  const nextCount = Math.max(0, prev + (mine ? -1 : 1));
  btn.classList.toggle('is-active', !mine);
  btn.dataset.count = String(nextCount);
  btn.setAttribute('aria-pressed', (!mine).toString());
  btn.textContent = '👍 ' + (nextCount || '');
  const result = await window.TZ.Store.toggleCommentReaction(commentId, !mine);
  if (!result || !result.ok) {
    btn.classList.toggle('is-active', mine);
    btn.dataset.count = String(prev);
    btn.setAttribute('aria-pressed', mine.toString());
    btn.textContent = '👍 ' + (prev || '');
    window.TZ.showToast('Could not update reaction.');
  }
};

window.showReplyForm = function (commentId) {
  const form = document.getElementById('reply-form-' + commentId);
  if (!form) return;
  form.style.display = 'block';
  const ta = form.querySelector('textarea');
  if (ta) ta.focus();
};

window.hideReplyForm = function (commentId) {
  const form = document.getElementById('reply-form-' + commentId);
  if (!form) return;
  form.style.display = 'none';
  const ta = form.querySelector('textarea');
  if (ta) ta.value = '';
};

window.submitReply = async function (parentId, btnEl) {
  const container = document.getElementById('reply-form-' + parentId);
  const textarea = container ? container.querySelector('textarea') : null;
  const text = textarea ? textarea.value.trim() : '';
  if (!text || !currentMod) return;

  const user = window.TZ_AUTH && window.TZ_AUTH.currentUser();
  if (!user) {
    requireSignIn('Sign in to reply to comments.');
    return;
  }

  btnEl.disabled = true;
  btnEl.textContent = 'Posting…';
  const username = user.displayName || user.email.split('@')[0] || 'user';
  const created = await window.TZ.Store.addComment(currentMod.id, username, text, parentId);
  btnEl.disabled = false;
  btnEl.textContent = 'Post Reply';

  if (created) {
    loadComments(currentMod.id);
  } else {
    window.TZ.showToast('Failed to post reply. Please try again.');
  }
};

window.deleteComment = async function (commentId) {
  const ok = await window.TZ.confirmDialog('This comment will be permanently removed.', { title: 'Delete comment?', confirmText: 'Delete', danger: true });
  if (!ok) return;
  const success = await window.TZ.Store.deleteComment(commentId);
  if (success) {
    window.TZ.showToast('Comment deleted.');
    loadComments(currentMod.id);
  } else {
    window.TZ.showToast('Failed to delete comment.');
  }
};

/** Swap the comment text for an inline textarea editor */
window.editComment = function (commentId) {
  const textEl = document.getElementById('comment-text-' + commentId);
  const editWrap = document.getElementById('comment-edit-' + commentId);
  if (!textEl || !editWrap) return;
  const { escapeHtml } = window.TZ;
  const raw = textEl.dataset.raw || textEl.textContent;

  editWrap.innerHTML = `
    <label class="sr-only" for="edit-input-${escapeHtml(commentId)}">Edit your comment</label>
    <textarea class="input" id="edit-input-${escapeHtml(commentId)}" rows="3" maxlength="2000"></textarea>
    <div class="comment__form-actions">
      <button type="button" class="btn btn--sm btn--ghost" onclick="cancelEditComment('${escapeHtml(commentId)}')">Cancel</button>
      <button type="button" class="btn btn--sm btn--primary" onclick="saveEditComment('${escapeHtml(commentId)}', this)">Save</button>
    </div>`;
  const ta = editWrap.querySelector('textarea');
  ta.value = raw;
  textEl.style.display = 'none';
  editWrap.style.display = 'block';
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);
};

window.cancelEditComment = function (commentId) {
  const textEl = document.getElementById('comment-text-' + commentId);
  const editWrap = document.getElementById('comment-edit-' + commentId);
  if (textEl) textEl.style.display = '';
  if (editWrap) { editWrap.style.display = 'none'; editWrap.innerHTML = ''; }
};

window.saveEditComment = async function (commentId, btnEl) {
  const textEl = document.getElementById('comment-text-' + commentId);
  const editWrap = document.getElementById('comment-edit-' + commentId);
  const ta = editWrap ? editWrap.querySelector('textarea') : null;
  if (!ta) return;
  const newText = ta.value.trim();
  const oldText = textEl ? (textEl.dataset.raw || textEl.textContent) : '';
  if (!newText) { ta.focus(); return; }
  if (newText === oldText) { window.cancelEditComment(commentId); return; }

  btnEl.disabled = true;
  btnEl.textContent = 'Saving…';
  const success = await window.TZ.Store.editComment(commentId, newText);
  if (success) {
    window.TZ.showToast('Comment updated.');
    loadComments(currentMod.id);
  } else {
    btnEl.disabled = false;
    btnEl.textContent = 'Save';
    window.TZ.showToast('Failed to edit comment.');
  }
};

window.reportComment = async function (commentId) {
  if (!window.TZ_AUTH || !window.TZ_AUTH.currentUser()) {
    requireSignIn('Sign in to report comments.');
    return;
  }
  const reason = await window.TZ.promptDialog('Tell us what is wrong with this comment (e.g. spam, harassment, offensive content).', {
    title: 'Report comment',
    placeholder: 'Reason for reporting…',
    confirmText: 'Submit Report',
    multiline: true,
    maxlength: 500
  });
  if (!reason) return;

  const success = await window.TZ.Store.submitReport(commentId, 'comment', reason, currentMod ? currentMod.id : '');
  window.TZ.showToast(success ? '✅ Report submitted. Thank you.' : 'Failed to submit report.');
};

window.handleReportMod = async function () {
  if (!currentMod) return;
  if (!window.TZ_AUTH || !window.TZ_AUTH.currentUser()) {
    requireSignIn('Sign in to report this mod.');
    return;
  }
  const reason = await window.TZ.promptDialog('Tell us what is wrong with this mod (e.g. broken download, malware suspicion, stolen content).', {
    title: 'Report mod',
    placeholder: 'Reason for reporting…',
    confirmText: 'Submit Report',
    multiline: true,
    maxlength: 500
  });
  if (!reason) return;
  const success = await window.TZ.Store.submitReport(currentMod.id, 'mod', reason, currentMod.id);
  window.TZ.showToast(success ? '✅ Report submitted. Thank you.' : 'Failed to submit report.');
};

window.postComment = async function () {
  const input = document.getElementById('comment-input');
  const btn = document.getElementById('comment-submit-btn');
  const text = input.value.trim();
  if (!text || !currentMod) { input.focus(); return; }

  const user = window.TZ_AUTH && window.TZ_AUTH.currentUser();
  if (!user) {
    requireSignIn('Sign in to leave a comment.');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Posting…';
  const username = user.displayName || user.email.split('@')[0] || 'user';
  const created = await window.TZ.Store.addComment(currentMod.id, username, text);
  btn.disabled = false;
  btn.textContent = 'Post Comment';

  if (!created) {
    window.TZ.showToast('Failed to post comment. Please try again.');
    return;
  }
  input.value = '';
  loadComments(currentMod.id);
};

window.setCommentSort = function (val) {
  commentSort = val || 'newest';
  if (currentMod) loadComments(currentMod.id);
};

window.pinComment = async function (commentId, pinned) {
  const ok = await window.TZ.Store.pinComment(commentId, pinned);
  window.TZ.showToast(ok ? (pinned ? 'Comment pinned.' : 'Comment unpinned.') : 'Could not pin comment. Re-run supabase_setup.sql.');
  if (ok && currentMod) loadComments(currentMod.id);
};

window.copyDownloadLink = async function () {
  if (!currentMod || !currentMod.downloadUrl) {
    window.TZ.showToast('No download link is available.');
    return;
  }
  try {
    await navigator.clipboard.writeText(currentMod.downloadUrl);
    window.TZ.showToast('Download link copied.');
  } catch (_) {
    window.TZ.promptDialog('Copy this download link:', { title: 'Download link', defaultValue: currentMod.downloadUrl, confirmText: 'Done', required: false });
  }
};

window.toggleDescription = function () {
  const desc = document.getElementById('mod-description');
  const btn = document.getElementById('desc-more-btn');
  if (!desc || !btn) return;
  const open = desc.classList.toggle('is-expanded');
  btn.textContent = open ? 'Read less' : 'Read more';
};

function setupReadMore(descEl) {
  const btn = document.getElementById('desc-more-btn');
  if (!descEl || !btn) return;
  descEl.classList.remove('is-clamped', 'is-expanded');
  btn.style.display = 'none';
  requestAnimationFrame(() => {
    if (descEl.scrollHeight > 280) {
      descEl.classList.add('is-clamped');
      btn.style.display = '';
      btn.textContent = 'Read more';
    }
  });
}

function renderVideo(mod) {
  const wrap = document.getElementById('mod-video');
  if (!wrap) return;
  const id = window.TZ.parseYoutubeId ? window.TZ.parseYoutubeId(mod.videoUrl) : '';
  if (!id) { wrap.style.display = 'none'; wrap.innerHTML = ''; return; }
  wrap.style.display = '';
  wrap.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${id}" title="Mod preview video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe>`;
}

function renderInstallBlock(mod) {
  const el = document.getElementById('mod-install');
  if (!el) return;
  const { escapeHtml } = window.TZ;
  const rows = [];
  if (mod.fileSize) rows.push(`<li><strong>Size</strong> ${escapeHtml(mod.fileSize)}</li>`);
  if (mod.requirements || mod.compatibility) rows.push(`<li><strong>Requirements</strong> ${escapeHtml(mod.requirements || mod.compatibility)}</li>`);
  if (mod.installPath) rows.push(`<li><strong>Install path</strong> <code>${escapeHtml(mod.installPath)}</code></li>`);
  if (!rows.length) { el.style.display = 'none'; el.innerHTML = ''; return; }
  el.style.display = '';
  el.innerHTML = `<h3 class="mod-changelog__title">Install &amp; requirements</h3><ul class="mod-install__list">${rows.join('')}</ul>`;
}

function renderMirrors(mod) {
  const el = document.getElementById('mod-mirrors');
  if (!el) return;
  const { escapeHtml, parseMirrors } = window.TZ;
  const urls = parseMirrors ? parseMirrors(mod.downloadMirrors) : [];
  if (!urls.length) { el.style.display = 'none'; el.innerHTML = ''; return; }
  el.style.display = '';
  el.innerHTML = `<p class="mod-mirrors__label">Mirrors</p>` + urls.map((u, i) =>
    `<a class="mod-mirrors__link" href="${escapeHtml(u)}" target="_blank" rel="noopener noreferrer">Mirror ${i + 1}</a>`
  ).join(' ');
}

async function renderModCollections(modId) {
  const el = document.getElementById('mod-in-collections');
  if (!el || !window.TZ.Store.getCollectionsForMod) return;
  const cols = await window.TZ.Store.getCollectionsForMod(modId);
  if (!currentMod || currentMod.id !== modId) return;
  if (!cols.length) { el.style.display = 'none'; el.innerHTML = ''; return; }
  const { escapeHtml } = window.TZ;
  el.style.display = '';
  el.innerHTML = `<h3 class="mod-changelog__title">This belongs to</h3>` + cols.map(c =>
    `<a class="badge badge--outline" href="collection.html?id=${encodeURIComponent(c.id)}">${escapeHtml(c.title)}</a>`
  ).join(' ');
}

function renderSiblingNav(modId) {
  const wrap = document.getElementById('mod-siblings');
  const prev = document.getElementById('mod-prev-link');
  const next = document.getElementById('mod-next-link');
  if (!wrap || !prev || !next) return;
  let ids = [];
  try { ids = JSON.parse(sessionStorage.getItem('tz_browse_ids') || '[]'); } catch (_) {}
  const idx = ids.indexOf(modId);
  if (idx < 0 || ids.length < 2) { wrap.style.display = 'none'; return; }
  wrap.style.display = '';
  if (idx > 0) {
    prev.style.visibility = '';
    prev.href = 'mod.html?id=' + encodeURIComponent(ids[idx - 1]);
  } else prev.style.visibility = 'hidden';
  if (idx < ids.length - 1) {
    next.style.visibility = '';
    next.href = 'mod.html?id=' + encodeURIComponent(ids[idx + 1]);
  } else next.style.visibility = 'hidden';
}

async function renderAlsoLiked(mod) {
  const section = document.getElementById('also-liked-section');
  const grid = document.getElementById('also-liked-grid');
  if (!section || !grid || !window.TZ.Store.getAlsoLikedMods) return;
  const mods = await window.TZ.Store.getAlsoLikedMods(mod.id, 4);
  if (!mods.length) { section.style.display = 'none'; return; }
  section.style.display = '';
  const { escapeHtml, formatDate, GAMES } = window.TZ;
  grid.innerHTML = mods.map(m => {
    const href = `mod.html?id=${encodeURIComponent(m.id)}`;
    return `<article class="mod-card" role="listitem">
      <a href="${href}" class="mod-card__hit">
        <div class="mod-card__body">
          <div class="mod-card__tags"><span class="badge badge--filled">${escapeHtml((GAMES[m.game] && GAMES[m.game].name) || m.game)}</span></div>
          <h3 class="mod-card__title">${escapeHtml(m.title)}</h3>
          <div class="mod-card__meta"><span>v${escapeHtml(m.version)}</span><time>${escapeHtml(formatDate(m.createdAt))}</time></div>
        </div>
      </a>
    </article>`;
  }).join('');
}

function bindGallerySwipe() {
  const wrap = document.getElementById('main-img-wrap');
  if (!wrap || wrap.dataset.swipeBound) return;
  wrap.dataset.swipeBound = '1';
  let startX = null;
  wrap.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, { passive: true });
  wrap.addEventListener('touchend', e => {
    if (startX === null) return;
    const dx = e.changedTouches[0].clientX - startX;
    startX = null;
    if (Math.abs(dx) > 50) { dx > 0 ? prevImage() : nextImage(); }
  }, { passive: true });
}

function initStickyDownload() {
  const bar = document.getElementById('mod-sticky-dl');
  const dl = document.getElementById('mod-dl-btn');
  if (!bar || !dl || typeof IntersectionObserver === 'undefined') return;
  const io = new IntersectionObserver(entries => {
    const visible = entries[0] && entries[0].isIntersecting;
    bar.hidden = !!visible;
  }, { threshold: 0.15 });
  io.observe(dl);
}
