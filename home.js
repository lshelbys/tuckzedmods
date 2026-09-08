/**
 * tuckzed mods — Homepage
 * Game selection, search / filter / sort toolbar and the mod grid.
 */

'use strict';

// ── State ──────────────────────────────────────────────────
const state = {
  activeGame:     null,   // 'ac' | 'beamng' | null
  activeCategory: 'all',
  activeTags:     [],     // multi-tag AND filter
  searchQuery:    '',
  sort:           'newest',
  page:           1,
  view:           'grid',
};

const PAGE_SIZE = 12;
let observer = null;

// ── Init ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const { Store } = window.TZ;

  applyFiltersFromUrl();
  applySavedView();
  renderGameCards();
  renderHeroStats();
  renderContinueBrowse();
  renderDiscoveryRails();
  renderMods();
  renderPopularTags();
  renderCollections();
  initSearch();
  initHeroButton();
  initAlertsCta();
  initBrowseShortcuts();
  initBackToTop();

  if (window.TZ_AUTH && window.TZ_AUTH.onChange) {
    window.TZ_AUTH.onChange(() => hydrateCardActions());
  }

  // Fetch live mods from Supabase, then re-render with fresh data
  if (Store.fetchFromRemote) {
    Store.fetchFromRemote().then(() => {
      renderGameCards();
      syncCategoryButtons();
      renderHeroStats();
      renderContinueBrowse();
      renderDiscoveryRails();
      renderMods();
      renderPopularTags();
      renderCollections();
    });
  }

  if (window.location.hash === '#mods') {
    document.getElementById('mods').scrollIntoView({ behavior: 'smooth' });
  }
});

/** Allow deep links like ./?game=ac&category=Cars&tag=drift&q=ferrari */
function applyFiltersFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const { GAMES, CATEGORIES } = window.TZ;
  const game = params.get('game');
  const cat  = params.get('category');
  const tag  = params.get('tag');
  const q    = params.get('q');
  const sort = params.get('sort');
  const view = params.get('view');

  if (game && GAMES[game]) state.activeGame = game;
  if (cat && CATEGORIES.includes(cat)) state.activeCategory = cat;
  if (tag) {
    state.activeTags = tag.split(',').map(t => t.trim()).filter(Boolean);
  }
  if (q) {
    state.searchQuery = q.trim().toLowerCase();
    const input = document.getElementById('search-input');
    if (input) input.value = q.trim();
  }
  if (sort && ['newest', 'popular', 'liked', 'updated', 'title'].includes(sort)) {
    state.sort = sort;
    const select = document.getElementById('sort-select');
    if (select) select.value = sort;
  }
  if (view === 'list' || view === 'grid') state.view = view;

  syncCategoryButtons();
  updateModsTitle();
  updateTagChip();
  document.getElementById('clear-game-btn').style.display = state.activeGame ? '' : 'none';
}

/** Keep the URL in sync with the active filters (without adding history entries) */
function syncUrl() {
  const params = new URLSearchParams();
  if (state.activeGame) params.set('game', state.activeGame);
  if (state.activeCategory !== 'all') params.set('category', state.activeCategory);
  if (state.activeTags.length) params.set('tag', state.activeTags.join(','));
  if (state.searchQuery) params.set('q', state.searchQuery);
  if (state.sort !== 'newest') params.set('sort', state.sort);
  if (state.view === 'list') params.set('view', 'list');
  const qs = params.toString();
  const url = window.location.pathname + (qs ? '?' + qs : '') + (window.location.hash || '#mods');
  try { window.history.replaceState(null, '', url); } catch (_) {}
  try { sessionStorage.setItem('tz_browse', url.startsWith('/') ? url : './' + url.replace(/^\.\//, '')); } catch (_) {}
  updateDocumentTitle();
}

function updateDocumentTitle() {
  const { GAMES } = window.TZ;
  const parts = [];
  if (state.activeGame && GAMES[state.activeGame]) parts.push(GAMES[state.activeGame].name);
  if (state.activeCategory !== 'all') parts.push(state.activeCategory);
  if (state.activeTags.length) parts.push(state.activeTags.map(t => '#' + t).join(' '));
  if (state.searchQuery) parts.push('“' + state.searchQuery + '”');
  document.title = parts.length
    ? `${parts.join(' · ')} — tuckzed mods`
    : 'tuckzed mods — Assetto Corsa & BeamNG.drive Mods';
}

// ── Hero button reflects auth state (admin vs community submit) ──────────
function initHeroButton() {
  const btn = document.getElementById('hero-admin-btn');
  if (!btn || !window.TZ_AUTH || !window.TZ_AUTH.onChange) return;
  window.TZ_AUTH.onChange(user => {
    if (!user) {
      btn.style.display = '';
      btn.href = 'submit.html';
      btn.removeAttribute('target');
      btn.removeAttribute('rel');
      btn.textContent = 'Submit a Mod';
      return;
    }
    const isAdmin = window.TZ_AUTH.isAdmin && window.TZ_AUTH.isAdmin();
    if (isAdmin) {
      btn.style.display = '';
      btn.href = 'admin.html';
      btn.removeAttribute('target');
      btn.removeAttribute('rel');
      btn.textContent = '⚡ Admin Panel';
    } else {
      btn.style.display = '';
      btn.href = 'submit.html';
      btn.removeAttribute('target');
      btn.removeAttribute('rel');
      btn.textContent = 'Submit a Mod';
    }
  });
}

// ── Game Cards ─────────────────────────────────────────────
function renderHeroStats() {
  const { Store, GAMES } = window.TZ;
  const el = document.getElementById('hero-stats');
  if (!el) return;
  const mods = Store.getAll();
  const games = Object.keys(GAMES).filter(id => mods.some(m => m.game === id)).length;
  if (!mods.length) { el.textContent = ''; return; }
  const fresh = mods.filter(isNewMod).length;
  const bits = [
    `${mods.length} ${mods.length === 1 ? 'mod' : 'mods'}`,
    `${games} ${games === 1 ? 'game' : 'games'}`,
  ];
  if (fresh) bits.push(`${fresh} new this week`);
  el.textContent = bits.join(' · ');
}

function renderGameCards() {
  const { Store, GAMES } = window.TZ;
  const counts = Store.countByGame();
  const grid = document.getElementById('game-grid');

  grid.innerHTML = Object.values(GAMES).map(game => `
    <div
      class="game-card${state.activeGame === game.id ? ' selected' : ''}"
      id="game-card-${game.id}"
      role="button"
      tabindex="0"
      aria-pressed="${state.activeGame === game.id}"
      onclick="toggleGame('${game.id}')"
      onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleGame('${game.id}')}"
    >
      <div class="game-card__icon" aria-hidden="true">${game.icon}</div>
      <div class="game-card__name">${game.name}</div>
      <div class="game-card__desc">${game.desc}</div>
      <div class="game-card__footer">
        <span class="game-card__count">${counts[game.id] || 0} ${counts[game.id] === 1 ? 'mod' : 'mods'}</span>
        <span class="badge game-card__badge">${state.activeGame === game.id ? 'Selected ✓' : 'Browse →'}</span>
      </div>
    </div>
  `).join('');
}

function toggleGame(gameId) {
  state.activeGame = state.activeGame === gameId ? null : gameId;
  renderGameCards();
  syncCategoryButtons();
  renderMods();
  updateModsTitle();
  document.getElementById('clear-game-btn').style.display = state.activeGame ? '' : 'none';

  if (state.activeGame) {
    document.getElementById('mods').scrollIntoView({ behavior: 'smooth' });
  }
}

function clearGameFilter() {
  state.activeGame = null;
  renderGameCards();
  syncCategoryButtons();
  renderMods();
  updateModsTitle();
  document.getElementById('clear-game-btn').style.display = 'none';
}

function updateModsTitle() {
  const { GAMES } = window.TZ;
  const titleEl = document.getElementById('mods-title-text');
  if (!titleEl) return;
  titleEl.textContent = state.activeGame ? GAMES[state.activeGame].name + ' Mods' : 'All Mods';
}

// ── Search ─────────────────────────────────────────────────
function initSearch() {
  const input = document.getElementById('search-input');
  const box = document.getElementById('search-suggest');
  let timer;
  const apply = () => {
    state.searchQuery = input.value.trim().toLowerCase();
    renderSearchSuggest();
    renderMods();
  };
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(apply, 160);
  });
  input.addEventListener('search', apply);
  input.addEventListener('focus', renderSearchSuggest);
  document.addEventListener('click', e => {
    if (!box) return;
    if (e.target === input || box.contains(e.target)) return;
    box.hidden = true;
  });
}

function renderSearchSuggest() {
  const { Store, escapeHtml, fuzzyMatch, parseTags } = window.TZ;
  const input = document.getElementById('search-input');
  const box = document.getElementById('search-suggest');
  if (!input || !box) return;
  const q = input.value.trim();
  if (q.length < 2) { box.hidden = true; box.innerHTML = ''; return; }
  const mods = Store.getAll();
  const titles = mods.filter(m => fuzzyMatch(m.title, q)).slice(0, 5);
  const seen = new Set();
  const tags = [];
  mods.forEach(m => parseTags(m.tags).forEach(t => {
    if (seen.has(t.toLowerCase())) return;
    if (t.toLowerCase().includes(q.toLowerCase()) || fuzzyMatch(t, q)) {
      seen.add(t.toLowerCase());
      tags.push(t);
    }
  }));
  const tagHits = tags.slice(0, 5);
  if (!titles.length && !tagHits.length) { box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false;
  box.innerHTML = [
    ...titles.map(m => `<button type="button" class="search-suggest__item" role="option" onclick="pickSearchTitle('${escapeHtml(m.id)}')">${escapeHtml(m.title)}</button>`),
    ...tagHits.map(t => `<button type="button" class="search-suggest__item search-suggest__item--tag" role="option" onclick="searchTag('${escapeHtml(t).replace(/'/g, "\\'")}')">#${escapeHtml(t)}</button>`)
  ].join('');
}

window.pickSearchTitle = function (id) {
  const box = document.getElementById('search-suggest');
  if (box) { box.hidden = true; box.innerHTML = ''; }
  window.location.href = `mod.html?id=${encodeURIComponent(id)}`;
};

// ── Category Filters ───────────────────────────────────────
const CATEGORY_BUTTON_IDS = {
  all: 'filter-all', Cars: 'filter-cars',
  Tracks: 'filter-tracks', Maps: 'filter-maps', Physics: 'filter-physics',
};

function syncCategoryButtons() {
  const { Store } = window.TZ;
  const all = Store.getAll().filter(m => !state.activeGame || m.game === state.activeGame);
  const counts = { all: all.length, Cars: 0, Tracks: 0, Maps: 0, Physics: 0 };
  all.forEach(m => { if (counts[m.category] != null) counts[m.category] += 1; });
  const labels = { all: 'All', Cars: '🚗 Cars', Tracks: '🏁 Tracks', Maps: '🗺️ Maps', Physics: '⚙️ Physics' };
  Object.entries(CATEGORY_BUTTON_IDS).forEach(([cat, id]) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    const active = cat === state.activeCategory;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
    const n = counts[cat] || 0;
    btn.textContent = `${labels[cat]} (${n})`;
    btn.classList.toggle('is-empty', cat !== 'all' && n === 0);
  });
}

function setCategory(cat) {
  state.activeCategory = cat;
  syncCategoryButtons();
  renderMods();
}

function setSort(val) {
  state.sort = val;
  renderMods();
}

// ── Tag filter ─────────────────────────────────────────────
function searchTag(tag) {
  const next = String(tag || '').trim();
  if (!next) return;
  const key = next.toLowerCase();
  const idx = state.activeTags.findIndex(t => t.toLowerCase() === key);
  if (idx >= 0) state.activeTags.splice(idx, 1);
  else state.activeTags.push(next);
  updateTagChip();
  renderMods();
  renderPopularTags();
  document.getElementById('mods').scrollIntoView({ behavior: 'smooth' });
}
window.searchTag = searchTag;

function clearTag(tag) {
  if (tag) {
    const key = String(tag).toLowerCase();
    state.activeTags = state.activeTags.filter(t => t.toLowerCase() !== key);
  } else {
    state.activeTags = [];
  }
  updateTagChip();
  renderMods();
  renderPopularTags();
}
window.clearTag = clearTag;

function updateTagChip() {
  const wrap = document.getElementById('active-tag-wrap');
  if (!wrap) return;
  if (!state.activeTags.length) {
    wrap.innerHTML = '';
    wrap.style.display = 'none';
    return;
  }
  const { escapeHtml } = window.TZ;
  wrap.style.display = '';
  wrap.innerHTML = state.activeTags.map(tag => `
    <button type="button" class="active-tag-chip" onclick="clearTag('${escapeHtml(tag).replace(/'/g, "\\'")}')" aria-label="Remove tag filter ${escapeHtml(tag)}" title="Remove tag filter">
      #${escapeHtml(tag)} <span aria-hidden="true">✕</span>
    </button>`).join('');
}

// ── Downloads ──────────────────────────────────────────────
function handleDownload(e, id, url) {
  e.preventDefault();
  e.stopPropagation();
  if (!url) {
    window.TZ.showToast('No download link is available for this mod.');
    return;
  }
  window.TZ.Store.incrementDownloads(id);
  window.open(url, '_blank', 'noopener,noreferrer');

  // Reflect the new count on the card without re-rendering the whole grid
  const card = document.getElementById('mod-card-' + id);
  const countEl = card ? card.querySelector('[data-downloads]') : null;
  if (countEl) {
    const mod = window.TZ.Store.getById(id);
    countEl.textContent = window.TZ.formatCount(mod ? mod.downloads : (parseInt(countEl.dataset.downloads, 10) || 0) + 1);
  }
}

// ── Helpers ────────────────────────────────────────────────
function truncateWords(text, limit = 40) {
  if (!text) return '';
  const words = text.trim().split(/\s+/);
  if (words.length <= limit) return text;
  return words.slice(0, limit).join(' ') + '…';
}

function goToMod(id, e) {
  if (e && e.target && e.target.closest('.mod-card__dl-btn, .mod-card__tag, .mod-card__footer')) return;
  window.location.href = `mod.html?id=${encodeURIComponent(id)}`;
}
window.goToMod = goToMod;

function onCardImgLoad(img) {
  if (img) img.classList.add('is-loaded');
}
window.onCardImgLoad = onCardImgLoad;

function getFilteredMods() {
  const { Store, parseTags } = window.TZ;
  let mods = Store.getAll();

  if (state.activeGame) {
    mods = mods.filter(m => m.game === state.activeGame);
  }
  if (state.activeCategory !== 'all') {
    mods = mods.filter(m => m.category === state.activeCategory);
  }
  if (state.activeTags.length) {
    const wanted = state.activeTags.map(t => t.toLowerCase());
    mods = mods.filter(m => {
      const have = parseTags(m.tags).map(t => t.toLowerCase());
      return wanted.every(t => have.includes(t));
    });
  }
  if (state.searchQuery) {
    const { fuzzyMatch, parseTags: pt, stripMarkdown } = window.TZ;
    mods = mods.filter(m => {
      const haystack = `${m.title || ''} ${stripMarkdown ? stripMarkdown(m.description || '') : (m.description || '')} ${pt(m.tags).join(' ')} ${m.compatibility || ''}`;
      return fuzzyMatch(haystack, state.searchQuery);
    });
  }

  if (state.sort === 'popular') {
    mods.sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
  } else if (state.sort === 'liked') {
    mods.sort((a, b) => (b.likes || 0) - (a.likes || 0));
  } else if (state.sort === 'updated') {
    mods.sort((a, b) => String(b.updatedAtIso || b.createdAtIso || '').localeCompare(String(a.updatedAtIso || a.createdAtIso || '')));
  } else if (state.sort === 'title') {
    mods.sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), undefined, { sensitivity: 'base' }));
  } else {
    mods = Store.sortNewest(mods);
  }

  return mods;
}

function isNewMod(mod) {
  const t = new Date(mod.createdAtIso || mod.createdAt || 0).getTime();
  return t > Date.now() - 7 * 86400000;
}

function isUpdatedMod(mod) {
  const created = String(mod.createdAtIso || mod.createdAt || '').slice(0, 10);
  const updated = String(mod.updatedAtIso || mod.updatedAt || '').slice(0, 10);
  return updated && created && updated !== created;
}

function renderSkeletons(grid, count = 6) {
  grid.innerHTML = Array.from({ length: count }, () => `
    <article class="mod-card mod-card--skeleton" aria-hidden="true">
      <div class="mod-card__img-wrap skeleton"></div>
      <div class="mod-card__body">
        <div class="skeleton-line skeleton-line--short"></div>
        <div class="skeleton-line skeleton-line--title"></div>
        <div class="skeleton-line"></div>
        <div class="skeleton-line"></div>
      </div>
    </article>`).join('');
}

function renderModCard(mod, i) {
  const { GAMES, CATEGORY_ICONS, escapeHtml, formatDate, formatCount, parseTags } = window.TZ;
  const game = GAMES[mod.game];
  const icon = CATEGORY_ICONS[mod.category] || '📦';
  const href = `mod.html?id=${encodeURIComponent(mod.id)}`;
  const imgHtml = mod.coverImage
    ? `<img src="${escapeHtml(mod.coverImage)}" alt="" class="mod-card__img img-fade" loading="lazy" decoding="async" onload="onCardImgLoad(this)" onerror="this.parentElement.innerHTML='<div class=\\'mod-card__img-placeholder\\'>${icon}</div>'" />`
    : `<div class="mod-card__img-placeholder" aria-label="${escapeHtml(mod.category)} mod">${icon}</div>`;
  const imgBadge = (Array.isArray(mod.images) && mod.images.length > 1)
    ? `<span class="mod-card__img-badge">📷 ${mod.images.length}</span>`
    : '';
  const featuredBadge = mod.featured
    ? `<span class="mod-card__featured-badge">★ Featured</span>`
    : '';
  const freshlyAdded = isNewMod(mod);
  const wasUpdated = isUpdatedMod(mod);
  const newBadge = !mod.featured && freshlyAdded
    ? `<span class="mod-card__new-badge">New</span>`
    : '';
  const updatedBadge = !mod.featured && !freshlyAdded && wasUpdated
    ? `<span class="mod-card__updated-badge">Updated</span>`
    : '';
  const dateValue = wasUpdated ? (mod.updatedAtIso || mod.updatedAt || mod.createdAt) : (mod.createdAtIso || mod.createdAt);
  const dateLabel = (wasUpdated ? 'Updated ' : '') + formatDate(wasUpdated ? (mod.updatedAt || mod.updatedAtIso) : mod.createdAt);
  const tagsHtml = parseTags(mod.tags).slice(0, 4).map(t =>
    `<button type="button" class="badge badge--outline mod-card__tag" data-tag="${escapeHtml(t)}" onclick="event.preventDefault(); event.stopPropagation(); searchTag(this.dataset.tag)">#${escapeHtml(t)}</button>`
  ).join(' ');

  return `
    <article
      class="mod-card"
      id="mod-card-${escapeHtml(mod.id)}"
      role="listitem"
      style="animation-delay:${Math.min(i * 40, 400)}ms"
      data-mod-id="${escapeHtml(mod.id)}"
    >
      <a href="${href}" class="mod-card__hit" aria-label="${escapeHtml(mod.title)} — ${escapeHtml(mod.category)} mod for ${escapeHtml(game?.name || mod.game)}">
        <div class="mod-card__img-wrap">${imgHtml}${imgBadge}${featuredBadge}${newBadge}${updatedBadge}</div>
        <div class="mod-card__body">
          <div class="mod-card__tags">
            <span class="badge badge--filled">${escapeHtml(game?.name || mod.game)}</span>
            <span class="badge badge--gray">${escapeHtml(mod.category)}</span>
          </div>
          <h3 class="mod-card__title">${escapeHtml(mod.title)}</h3>
          <p class="mod-card__desc">${escapeHtml(truncateWords(window.TZ.stripMarkdown(mod.description), 40))}</p>
          <div class="mod-card__meta">
            <span class="mod-card__version">v${escapeHtml(mod.version)}</span>
            <time datetime="${escapeHtml(dateValue || '')}">${escapeHtml(dateLabel)}</time>
            <div class="mod-card__stats">
              <span title="${mod.likes || 0} likes">❤️ ${formatCount(mod.likes)}</span>
              <span title="${mod.downloads || 0} downloads" data-downloads="${mod.downloads || 0}">⬇ ${formatCount(mod.downloads)}</span>
            </div>
          </div>
        </div>
      </a>
      ${tagsHtml ? `<div class="mod-card__tag-row">${tagsHtml}</div>` : ''}
      <div class="mod-card__footer">
        <button
          type="button"
          data-mod-id="${escapeHtml(mod.id)}"
          data-dl="${escapeHtml(mod.downloadUrl || '')}"
          onclick="handleDownload(event, this.dataset.modId, this.dataset.dl)"
          class="btn btn--primary mod-card__dl-btn${!mod.downloadUrl ? ' disabled' : ''}"
          id="dl-btn-${escapeHtml(mod.id)}"
          ${!mod.downloadUrl ? 'disabled' : ''}
          aria-label="Download ${escapeHtml(mod.title)}"
        >
          ⬇ Download
        </button>
        <div class="mod-card__quick">
          <button type="button" class="mod-card__icon-btn" data-like-id="${escapeHtml(mod.id)}" onclick="toggleCardLike(event, '${escapeHtml(mod.id)}')" aria-pressed="false" title="Like">🤍</button>
          <button type="button" class="mod-card__icon-btn" data-wish-id="${escapeHtml(mod.id)}" onclick="toggleCardWish(event, '${escapeHtml(mod.id)}')" aria-pressed="false" title="Wishlist">☆</button>
        </div>
      </div>
    </article>`;
}

function renderMods(append = false) {
  const { Store } = window.TZ;
  const grid = document.getElementById('mod-grid');
  const countEl = document.getElementById('mods-count');

  if (!append) {
    state.page = 1;
    syncUrl();
    renderDiscoveryRails();
    renderHeroStats();
  }

  const mods = getFilteredMods();
  const totalInStore = Store.getAll().length;

  // First visit with an empty cache: show placeholders until the fetch finishes
  if (!append && totalInStore === 0 && !Store.hasFetched && Store.fetchFromRemote) {
    countEl.textContent = '';
    renderSkeletons(grid);
    return;
  }

  countEl.textContent = `${mods.length} ${mods.length === 1 ? 'mod' : 'mods'}`;
  updateResultsBar(mods.length);
  try { sessionStorage.setItem('tz_browse_ids', JSON.stringify(mods.map(m => m.id))); } catch (_) {}

  if (mods.length === 0) {
    const hasFilters = hasActiveFilters();
    updateResultsBar(0);
    if (totalInStore === 0 && Store.lastFetchError) {
      grid.innerHTML = `
        <div class="empty-state" role="status">
          <div class="empty-state__icon">📡</div>
          <div class="empty-state__title">Couldn't load mods</div>
          <div class="empty-state__desc">Check your connection and try again.</div>
          <div class="mt-24"><button type="button" class="btn btn--primary" onclick="retryFetch()">Retry</button></div>
        </div>`;
    } else if (hasFilters) {
      grid.innerHTML = `
        <div class="empty-state" role="status">
          <div class="empty-state__icon">🔍</div>
          <div class="empty-state__title">No mods found</div>
          <div class="empty-state__desc">Try adjusting your search or filters.</div>
          <div class="mt-24"><button type="button" class="btn" onclick="resetFilters()">Clear all filters</button></div>
          ${renderEmptySuggestions()}
        </div>`;
    } else {
      grid.innerHTML = `
        <div class="empty-state" role="status">
          <div class="empty-state__icon">📦</div>
          <div class="empty-state__title">No mods yet</div>
          <div class="empty-state__desc">Check back soon — new mods are on the way.</div>
        </div>`;
    }
    return;
  }

  const pageMods = mods.slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE);
  const html = pageMods.map(renderModCard).join('');

  applyViewClass();
  if (!append) {
    grid.innerHTML = html;
  } else {
    const oldSentinel = document.getElementById('scroll-sentinel');
    if (oldSentinel) oldSentinel.remove();
    grid.insertAdjacentHTML('beforeend', html);
  }

  if (observer) { observer.disconnect(); observer = null; }
  const existingMore = document.getElementById('load-more-wrap');
  if (existingMore) existingMore.remove();

  if (state.page * PAGE_SIZE < mods.length) {
    grid.insertAdjacentHTML('beforeend', `
      <div id="scroll-sentinel" class="scroll-sentinel" aria-hidden="true"></div>
      <div id="load-more-wrap" class="load-more-wrap">
        <button type="button" class="btn btn--ghost" id="load-more-btn" onclick="loadMoreMods()">Load more mods</button>
      </div>`);
    observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) loadMoreMods();
    }, { rootMargin: '240px' });
    observer.observe(document.getElementById('scroll-sentinel'));
  }
  hydrateCardActions();
}

function loadMoreMods() {
  if (observer) { observer.disconnect(); observer = null; }
  const wrap = document.getElementById('load-more-wrap');
  const sentinel = document.getElementById('scroll-sentinel');
  if (wrap) wrap.remove();
  if (sentinel) sentinel.remove();
  state.page++;
  renderMods(true);
}
window.loadMoreMods = loadMoreMods;

function resetFilters() {
  state.activeGame = null;
  state.activeCategory = 'all';
  state.activeTags = [];
  state.searchQuery = '';
  const input = document.getElementById('search-input');
  if (input) input.value = '';
  syncCategoryButtons();
  updateTagChip();
  updateModsTitle();
  document.getElementById('clear-game-btn').style.display = 'none';
  renderGameCards();
  renderMods();
}
window.resetFilters = resetFilters;

function initAlertsCta() {
  const btn = document.getElementById('alerts-subscribe-btn');
  if (!btn || !window.TZ_AUTH || !window.TZ_AUTH.onChange) return;
  window.TZ_AUTH.onChange(user => {
    if (user) {
      btn.href = 'profile.html#card-notif-title';
      btn.textContent = 'Manage alerts';
    } else {
      const { authRedirectUrl } = window.TZ;
      btn.href = authRedirectUrl ? authRedirectUrl('profile.html#card-notif-title') : 'auth.html?redirect=' + encodeURIComponent('profile.html');
      btn.textContent = 'Sign in to subscribe';
    }
  });
}

function retryFetch() {
  const { Store } = window.TZ;
  Store.hasFetched = false;
  renderMods();
  Store.fetchFromRemote().then(() => {
    renderGameCards();
    syncCategoryButtons();
    renderMods();
  });
}
window.retryFetch = retryFetch;

function renderPopularTags() {
  const { Store, escapeHtml } = window.TZ;
  const el = document.getElementById('popular-tags');
  if (!el) return;
  const tags = Store.getPopularTags(14);
  if (!tags.length) {
    el.style.display = 'none';
    el.innerHTML = '';
    return;
  }
  el.style.display = '';
  el.innerHTML = `<span class="popular-tags__label">Popular tags</span>` + tags.map(t =>
    `<button type="button" class="popular-tags__chip${state.activeTags.some(x => x.toLowerCase() === t.tag.toLowerCase()) ? ' is-active' : ''}" onclick="searchTag('${escapeHtml(t.tag).replace(/'/g, "\\'")}')">#${escapeHtml(t.tag)} <span class="popular-tags__count">${t.count}</span></button>`
  ).join('');
}

async function renderCollections() {
  const { Store, escapeHtml } = window.TZ;
  const section = document.getElementById('collections');
  const grid = document.getElementById('collections-grid');
  if (!section || !grid) return;
  const cols = await Store.listCollections();
  if (!cols.length) {
    section.style.display = 'none';
    return;
  }
  section.style.display = '';
  grid.innerHTML = cols.slice(0, 8).map(c => {
    const cover = c.cover_image
      ? `<img src="${escapeHtml(c.cover_image)}" alt="" class="collection-card__img" loading="lazy" />`
      : `<div class="collection-card__img collection-card__img--empty" aria-hidden="true">📦</div>`;
    return `<a class="collection-card" href="collection.html?id=${encodeURIComponent(c.id)}" role="listitem">
      <div class="collection-card__media">${cover}</div>
      <div class="collection-card__body">
        <h3 class="collection-card__title">${escapeHtml(c.title)}</h3>
        <p class="collection-card__desc">${escapeHtml((c.description || '').slice(0, 120))}</p>
      </div>
    </a>`;
  }).join('');
}

function hasActiveFilters() {
  return !!(state.activeGame || state.activeCategory !== 'all' || state.activeTags.length || state.searchQuery);
}

function updateResultsBar(count) {
  const bar = document.getElementById('results-bar');
  const text = document.getElementById('results-bar-text');
  if (!bar || !text) return;
  if (!hasActiveFilters()) {
    bar.style.display = 'none';
    return;
  }
  bar.style.display = '';
  const bits = [`${count} ${count === 1 ? 'result' : 'results'}`];
  if (state.activeGame) bits.push(window.TZ.GAMES[state.activeGame]?.name || state.activeGame);
  if (state.activeCategory !== 'all') bits.push(state.activeCategory);
  if (state.activeTags.length) bits.push(state.activeTags.map(t => '#' + t).join(' '));
  if (state.searchQuery) bits.push(`“${state.searchQuery}”`);
  text.textContent = bits.join(' · ');
}

function renderEmptySuggestions() {
  const { Store, escapeHtml, fuzzyMatch } = window.TZ;
  const tags = Store.getPopularTags(6);
  const q = state.searchQuery;
  let close = [];
  if (q) {
    close = Store.getAll()
      .map(m => ({ m, d: window.TZ ? 0 : 0 }))
      .filter(({ m }) => fuzzyMatch(m.title, q) || fuzzyMatch((m.tags || ''), q))
      .slice(0, 3)
      .map(x => x.m);
    if (!close.length) close = Store.sortNewest(Store.getAll()).slice(0, 3);
  }
  const tagHtml = tags.length
    ? `<div class="empty-suggest">${tags.map(t => `<button type="button" class="popular-tags__chip" onclick="resetFilters(); searchTag('${escapeHtml(t.tag).replace(/'/g, "\\'")}')">#${escapeHtml(t.tag)}</button>`).join('')}</div>`
    : '';
  const closeHtml = close.length
    ? `<p class="form-hint" style="margin-top:16px;">Closest matches</p><ul class="empty-close">${close.map(m => `<li><a href="mod.html?id=${encodeURIComponent(m.id)}">${escapeHtml(m.title)}</a></li>`).join('')}</ul>`
    : '';
  return tagHtml + closeHtml;
}

function applySavedView() {
  // Only honor an explicit ?view= list; default to grid so cards stay intact
  applyViewClass();
}

function applyViewClass() {
  const grid = document.getElementById('mod-grid');
  if (grid) grid.classList.toggle('mod-grid--list', state.view === 'list');
  const g = document.getElementById('view-grid-btn');
  const l = document.getElementById('view-list-btn');
  if (g) { g.classList.toggle('is-active', state.view === 'grid'); g.setAttribute('aria-pressed', String(state.view === 'grid')); }
  if (l) { l.classList.toggle('is-active', state.view === 'list'); l.setAttribute('aria-pressed', String(state.view === 'list')); }
}

window.setView = function (view) {
  state.view = view === 'list' ? 'list' : 'grid';
  try { localStorage.setItem('tz_view', state.view); } catch (_) {}
  applyViewClass();
  syncUrl();
};

function renderContinueBrowse() {
  const wrap = document.getElementById('continue-browse');
  if (!wrap) return;
  let last = null;
  try { last = JSON.parse(sessionStorage.getItem('tz_last_mod') || 'null'); } catch (_) {}
  if (!last || !last.id || !window.TZ.Store.getById(last.id)) {
    wrap.style.display = 'none';
    wrap.innerHTML = '';
    return;
  }
  wrap.style.display = '';
  wrap.innerHTML = `<a class="continue-browse__chip" href="mod.html?id=${encodeURIComponent(last.id)}">Continue browsing: ${window.TZ.escapeHtml(last.title || 'last mod')}</a>`;
}

function railCard(mod) {
  const { escapeHtml, CATEGORY_ICONS } = window.TZ;
  const icon = (CATEGORY_ICONS && CATEGORY_ICONS[mod.category]) || '📦';
  const media = mod.coverImage
    ? `<img src="${escapeHtml(mod.coverImage)}" alt="" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\\'home-rail__card-ph\\'>${icon}</div>'" />`
    : `<div class="home-rail__card-ph" aria-hidden="true">${icon}</div>`;
  return `<a class="home-rail__card" href="mod.html?id=${encodeURIComponent(mod.id)}">
    <div class="home-rail__card-media">${media}</div>
    <div class="home-rail__card-body">
      <span class="home-rail__card-title">${escapeHtml(mod.title)}</span>
      <span class="home-rail__card-meta">${escapeHtml(mod.category)} · v${escapeHtml(mod.version)}</span>
    </div>
  </a>`;
}

function renderDiscoveryRails() {
  const { Store } = window.TZ;
  const all = applyLightFilters(Store.getAll());
  const featured = all.filter(m => m.featured).slice(0, 8);
  const weekAgo = Date.now() - 7 * 86400000;
  const newest = Store.sortNewest(all).filter(m => new Date(m.createdAtIso || m.createdAt).getTime() >= weekAgo).slice(0, 8);

  fillRail('featured-rail', 'featured-rail-row', featured);
  fillRail('new-rail', 'new-rail-row', newest);
  const updated = [...all]
    .filter(isUpdatedMod)
    .sort((a, b) => String(b.updatedAtIso || '').localeCompare(String(a.updatedAtIso || '')))
    .slice(0, 8);
  fillRail('updated-rail', 'updated-rail-row', updated);
  const recent = (Store.getRecentMods ? Store.getRecentMods() : []).filter(m => all.some(x => x.id === m.id)).slice(0, 8);
  fillRail('recent-rail', 'recent-rail-row', recent);
}

function applyLightFilters(mods) {
  if (state.activeGame) mods = mods.filter(m => m.game === state.activeGame);
  if (state.activeCategory !== 'all') mods = mods.filter(m => m.category === state.activeCategory);
  return mods;
}

function fillRail(sectionId, rowId, mods) {
  const section = document.getElementById(sectionId);
  const row = document.getElementById(rowId);
  if (!section || !row) return;
  if (!mods.length) { section.style.display = 'none'; row.innerHTML = ''; return; }
  section.style.display = '';
  row.innerHTML = mods.map(railCard).join('');
}

function requireHomeSignIn(message) {
  const href = window.TZ.authRedirectUrl ? window.TZ.authRedirectUrl() : 'auth.html';
  window.TZ.showToast(message, { action: { label: 'Sign in', href } });
}

window.toggleCardLike = async function (e, id) {
  e.preventDefault();
  e.stopPropagation();
  if (!window.TZ_AUTH || !window.TZ_AUTH.currentUser()) {
    requireHomeSignIn('Sign in to like mods.');
    return;
  }
  const btn = document.querySelector(`[data-like-id="${id}"]`);
  const next = !btn || btn.getAttribute('aria-pressed') !== 'true';
  if (btn) {
    btn.setAttribute('aria-pressed', String(next));
    btn.textContent = next ? '❤️' : '🤍';
  }
  const result = await window.TZ.Store.toggleLike(id, next);
  if (!result || !result.ok) {
    if (btn) { btn.setAttribute('aria-pressed', String(!next)); btn.textContent = next ? '🤍' : '❤️'; }
    window.TZ.showToast('Could not update like.');
  }
};

window.toggleCardWish = async function (e, id) {
  e.preventDefault();
  e.stopPropagation();
  if (!window.TZ_AUTH || !window.TZ_AUTH.currentUser()) {
    requireHomeSignIn('Sign in to save a wishlist.');
    return;
  }
  const btn = document.querySelector(`[data-wish-id="${id}"]`);
  const next = !btn || btn.getAttribute('aria-pressed') !== 'true';
  if (btn) {
    btn.setAttribute('aria-pressed', String(next));
    btn.textContent = next ? '★' : '☆';
  }
  const result = await window.TZ.Store.toggleWishlist(id, next);
  if (!result || !result.ok) {
    if (btn) { btn.setAttribute('aria-pressed', String(!next)); btn.textContent = next ? '☆' : '★'; }
    window.TZ.showToast('Could not update wishlist.');
  }
};

async function hydrateCardActions() {
  const user = window.TZ_AUTH && window.TZ_AUTH.currentUser();
  if (!user) return;
  const likeBtns = [...document.querySelectorAll('[data-like-id]')];
  const wishBtns = [...document.querySelectorAll('[data-wish-id]')];
  await Promise.all(likeBtns.slice(0, 24).map(async btn => {
    const liked = await window.TZ.Store.getModLikeStatus(btn.dataset.likeId);
    btn.setAttribute('aria-pressed', String(!!liked));
    btn.textContent = liked ? '❤️' : '🤍';
  }));
  await Promise.all(wishBtns.slice(0, 24).map(async btn => {
    const wished = await window.TZ.Store.getWishlistStatus(btn.dataset.wishId);
    btn.setAttribute('aria-pressed', String(!!wished));
    btn.textContent = wished ? '★' : '☆';
  }));
}

// ── Refresh when another tab (e.g. the admin panel) edits mods ──
window.addEventListener('storage', e => {
  if (e.key === 'tuckzed_mods_v2') {
    if (window.TZ && window.TZ.Store) window.TZ.Store._cache = null;
    renderGameCards();
    syncCategoryButtons();
    renderHeroStats();
    renderDiscoveryRails();
    renderMods();
    renderPopularTags();
  }
});

function showSortedMods(sort) {
  state.sort = sort;
  const select = document.getElementById('sort-select');
  if (select) select.value = sort;
  renderMods();
  const grid = document.getElementById('mod-grid');
  if (grid) grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
window.showSortedMods = showSortedMods;

function clearRecentViewed() {
  const { Store } = window.TZ;
  if (Store.clearRecentMods) Store.clearRecentMods();
  renderContinueBrowse();
  renderDiscoveryRails();
  if (window.TZ.showToast) window.TZ.showToast('Recently viewed cleared');
}
window.clearRecentViewed = clearRecentViewed;

function surpriseMe() {
  const pool = getFilteredMods();
  const mods = pool.length ? pool : window.TZ.Store.getAll();
  if (!mods.length) {
    window.TZ.showToast('No mods to surprise you with yet.');
    return;
  }
  const pick = mods[Math.floor(Math.random() * mods.length)];
  window.location.href = `mod.html?id=${encodeURIComponent(pick.id)}`;
}
window.surpriseMe = surpriseMe;

async function copyBrowseLink() {
  const url = window.location.href;
  if (navigator.share) {
    try {
      await navigator.share({ title: document.title, url });
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') return;
    }
  }
  const ok = await copyTextToClipboard(url);
  window.TZ.showToast(ok ? '🔗 Browse link copied' : 'Could not copy link');
}
window.copyBrowseLink = copyBrowseLink;

function copyTextToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text).then(() => true).catch(() => copyTextFallback(text));
  }
  return Promise.resolve(copyTextFallback(text));
}

function copyTextFallback(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.top = '0';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  ta.setSelectionRange(0, ta.value.length);
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (_) {}
  ta.remove();
  return ok;
}

function initBrowseShortcuts() {
  document.addEventListener('keydown', e => {
    const tag = (e.target && e.target.tagName) || '';
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(tag) || !!(e.target && e.target.isContentEditable);
    if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      const input = document.getElementById('search-input');
      if (input) {
        input.focus();
        input.select();
      }
      return;
    }
    if (e.key !== 'Escape') return;
    const box = document.getElementById('search-suggest');
    if (box && !box.hidden) {
      box.hidden = true;
      return;
    }
    const input = document.getElementById('search-input');
    if (input && document.activeElement === input) {
      if (input.value) {
        input.value = '';
        state.searchQuery = '';
        renderSearchSuggest();
        renderMods();
      } else {
        input.blur();
      }
    }
  });
}

function initBackToTop() {
  const btn = document.getElementById('back-to-top');
  if (!btn) return;
  const onScroll = () => {
    btn.hidden = window.scrollY < 480;
  };
  btn.addEventListener('click', e => {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}
