/**
 * tuckzed mods — Homepage
 * Game selection, search / filter / sort toolbar and the mod grid.
 */

'use strict';

// ── State ──────────────────────────────────────────────────
const state = {
  activeGame:     null,   // 'ac' | 'beamng' | null
  activeCategory: 'all',
  activeTag:      '',     // exact tag filter (set by clicking a #tag)
  searchQuery:    '',
  sort:           'newest',
  page:           1,
};

const PAGE_SIZE = 12;
let observer = null;

// ── Init ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const { Store } = window.TZ;

  applyFiltersFromUrl();
  renderGameCards();
  renderMods();
  initSearch();
  initHeroButton();

  // Fetch live mods from Supabase, then re-render with fresh data
  if (Store.fetchFromRemote) {
    Store.fetchFromRemote().then(() => {
      renderGameCards();
      renderMods();
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

  if (game && GAMES[game]) state.activeGame = game;
  if (cat && CATEGORIES.includes(cat)) state.activeCategory = cat;
  if (tag) state.activeTag = tag.trim();
  if (q) {
    state.searchQuery = q.trim().toLowerCase();
    const input = document.getElementById('search-input');
    if (input) input.value = q.trim();
  }
  if (sort && ['newest', 'popular', 'liked'].includes(sort)) {
    state.sort = sort;
    const select = document.getElementById('sort-select');
    if (select) select.value = sort;
  }

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
  if (state.activeTag) params.set('tag', state.activeTag);
  if (state.searchQuery) params.set('q', state.searchQuery);
  if (state.sort !== 'newest') params.set('sort', state.sort);
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
  if (state.activeTag) parts.push('#' + state.activeTag);
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
      btn.href = 'https://discord.gg/5nE69arMNP';
      btn.target = '_blank';
      btn.rel = 'noopener noreferrer';
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
      btn.href = 'https://discord.gg/5nE69arMNP';
      btn.target = '_blank';
      btn.rel = 'noopener noreferrer';
      btn.textContent = 'Submit a Mod';
    }
  });
}

// ── Game Cards ─────────────────────────────────────────────
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
  let timer;
  const apply = () => {
    state.searchQuery = input.value.trim().toLowerCase();
    renderMods();
  };
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(apply, 200);
  });
  // Fired when the native "clear" (x) button of a search input is used
  input.addEventListener('search', apply);
}

// ── Category Filters ───────────────────────────────────────
const CATEGORY_BUTTON_IDS = {
  all: 'filter-all', Cars: 'filter-cars',
  Tracks: 'filter-tracks', Maps: 'filter-maps', Physics: 'filter-physics',
};

function syncCategoryButtons() {
  Object.entries(CATEGORY_BUTTON_IDS).forEach(([cat, id]) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    const active = cat === state.activeCategory;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
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
  state.activeTag = String(tag || '').trim();
  updateTagChip();
  renderMods();
  document.getElementById('mods').scrollIntoView({ behavior: 'smooth' });
}
window.searchTag = searchTag;

function clearTag() {
  state.activeTag = '';
  updateTagChip();
  renderMods();
}
window.clearTag = clearTag;

function updateTagChip() {
  const wrap = document.getElementById('active-tag-wrap');
  if (!wrap) return;
  if (!state.activeTag) {
    wrap.innerHTML = '';
    wrap.style.display = 'none';
    return;
  }
  wrap.style.display = '';
  wrap.innerHTML = `
    <button type="button" class="active-tag-chip" onclick="clearTag()" aria-label="Remove tag filter ${window.TZ.escapeHtml(state.activeTag)}" title="Remove tag filter">
      #${window.TZ.escapeHtml(state.activeTag)} <span aria-hidden="true">✕</span>
    </button>`;
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
  if (state.activeTag) {
    const wanted = state.activeTag.toLowerCase();
    mods = mods.filter(m => parseTags(m.tags).some(t => t.toLowerCase() === wanted));
  }
  if (state.searchQuery) {
    mods = mods.filter(m => {
      const haystack = `${m.title || ''} ${m.description || ''} ${parseTags(m.tags).join(' ')}`.toLowerCase();
      return haystack.includes(state.searchQuery);
    });
  }

  if (state.sort === 'popular') {
    mods.sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
  } else if (state.sort === 'liked') {
    mods.sort((a, b) => (b.likes || 0) - (a.likes || 0));
  } else {
    mods = Store.sortNewest(mods);
  }

  // Curated featured mods always float to the top of the current view
  const featured = mods.filter(m => m.featured);
  const rest = mods.filter(m => !m.featured);
  return featured.concat(rest);
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
        <div class="mod-card__img-wrap">${imgHtml}${imgBadge}${featuredBadge}</div>
        <div class="mod-card__body">
          <div class="mod-card__tags">
            <span class="badge badge--filled">${escapeHtml(game?.name || mod.game)}</span>
            <span class="badge badge--gray">${escapeHtml(mod.category)}</span>
          </div>
          <h3 class="mod-card__title">${escapeHtml(mod.title)}</h3>
          <p class="mod-card__desc">${escapeHtml(truncateWords(window.TZ.stripMarkdown(mod.description), 40))}</p>
          <div class="mod-card__meta">
            <span class="mod-card__version">v${escapeHtml(mod.version)}</span>
            <time datetime="${escapeHtml(mod.createdAt)}">${escapeHtml(formatDate(mod.createdAt))}</time>
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

  if (mods.length === 0) {
    const hasFilters = state.activeGame || state.activeCategory !== 'all' || state.activeTag || state.searchQuery;
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
  state.activeTag = '';
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

function retryFetch() {
  const { Store } = window.TZ;
  Store.hasFetched = false;
  renderMods();
  Store.fetchFromRemote().then(() => {
    renderGameCards();
    renderMods();
  });
}
window.retryFetch = retryFetch;

// ── Refresh when another tab (e.g. the admin panel) edits mods ──
window.addEventListener('storage', e => {
  if (e.key === 'tuckzed_mods_v2') {
    if (window.TZ && window.TZ.Store) window.TZ.Store._cache = null;
    renderGameCards();
    renderMods();
  }
});
