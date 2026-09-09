/**
 * tuckzed mods — Collection detail page
 */
'use strict';

document.addEventListener('DOMContentLoaded', async () => {
  const year = document.querySelector('[data-year]');
  if (year) year.textContent = String(new Date().getFullYear());

  const { Store, escapeHtml, formatDate, formatCount, parseTags, CATEGORY_ICONS, GAMES, stripMarkdown } = window.TZ;
  const id = new URLSearchParams(window.location.search).get('id');
  const loading = document.getElementById('collection-loading');
  const missing = document.getElementById('collection-not-found');
  const content = document.getElementById('collection-content');

  if (!id) {
    if (loading) loading.style.display = 'none';
    if (missing) missing.style.display = 'block';
    return;
  }

  await Store.fetchFromRemote();
  const col = await Store.getCollection(id);
  if (!col) {
    if (loading) loading.style.display = 'none';
    if (missing) missing.style.display = 'block';
    return;
  }

  document.title = `${col.title} — tuckzed mods`;
  document.getElementById('collection-title').textContent = col.title;
  document.getElementById('collection-desc').textContent = col.description || '';
  const countEl = document.getElementById('collection-count');
  const grid = document.getElementById('collection-grid');
  const mods = col.mods || [];
  if (countEl) countEl.textContent = `${mods.length} ${mods.length === 1 ? 'mod' : 'mods'}`;
  if (!mods.length) {
    grid.innerHTML = '<p class="empty-state__desc">This collection has no mods yet.</p>';
  } else {
    grid.innerHTML = mods.map(mod => {
      const game = GAMES[mod.game];
      const icon = CATEGORY_ICONS[mod.category] || '📦';
      const href = `mod.html?id=${encodeURIComponent(mod.id)}`;
      const imgHtml = mod.coverImage
        ? `<img src="${escapeHtml(mod.coverImage)}" alt="" class="mod-card__img" loading="lazy" />`
        : `<div class="mod-card__img-placeholder">${icon}</div>`;
      return `<article class="mod-card" role="listitem">
        <a href="${href}" class="mod-card__hit">
          <div class="mod-card__img-wrap">${imgHtml}</div>
          <div class="mod-card__body">
            <div class="mod-card__tags">
              <span class="badge badge--filled">${escapeHtml(game ? game.name : mod.game)}</span>
              <span class="badge badge--gray">${escapeHtml(mod.category)}</span>
            </div>
            <h3 class="mod-card__title">${escapeHtml(mod.title)}</h3>
            <p class="mod-card__desc">${escapeHtml((stripMarkdown(mod.description) || '').split(/\s+/).slice(0, 28).join(' '))}</p>
            <div class="mod-card__meta">
              <span>v${escapeHtml(mod.version)}</span>
              <span>⬇ ${formatCount(mod.downloads)}</span>
              <time>${escapeHtml(formatDate(mod.createdAt))}</time>
            </div>
          </div>
        </a>
      </article>`;
    }).join('');
  }

  if (loading) loading.style.display = 'none';
  if (content) content.style.display = 'block';
});
