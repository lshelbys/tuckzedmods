/**
 * tuckzed mods — Admin Panel
 * Dashboard, create/edit form with multi-image gallery, mod management
 * table and moderation queue. Only the configured admin account may enter.
 */

'use strict';

const MANAGE_PAGE_SIZE = 20;
const MAX_IMAGES = 10;

// ── Auth Guard ─────────────────────────────────────────────
// Hide admin content until Firebase confirms the admin identity.
document.querySelector('.admin-layout').style.display = 'none';

function revealAdmin() {
  const loading = document.getElementById('admin-auth-loading');
  if (loading) loading.style.display = 'none';
  const layout = document.querySelector('.admin-layout');
  if (layout) layout.style.display = '';
}

function formatSbError(err) {
  if (!err) return 'Please try again.';
  return err.message || err.details || err.hint || err.error_description || 'Please try again.';
}

window.TZ_AUTH.onChange(user => {
  if (!user) {
    window.location.href = 'auth.html?redirect=upload';
    return;
  }
  if (!user.email || user.email.toLowerCase() !== window.TZ_AUTH.ADMIN_EMAIL.toLowerCase()) {
    window.TZ.showToast('Access restricted to admins.');
    window.location.href = './';
    return;
  }
  revealAdmin();
  Store.fetchFromRemote().then(() => {
    renderOverview();
    if (currentPanel === 'manage') renderManageTable();
    if (currentPanel === 'reports') renderReportsTable();
  });
  if (currentPanel !== 'reports') refreshReportsBadge();
});

/** Show the number of unresolved reports next to the Moderation link */
async function refreshReportsBadge() {
  const badge = document.getElementById('reports-pending-badge');
  if (!badge) return;
  const reports = await Store.getReports();
  const pending = reports.filter(r => r.status !== 'resolved').length;
  badge.textContent = pending;
  badge.style.display = pending > 0 ? '' : 'none';
}

// ── Sidebar Sign Out ───────────────────────────────────────
async function handleSidebarSignOut() {
  const ok = await window.TZ.confirmDialog('You will be signed out of the admin panel.', { title: 'Sign out?', confirmText: 'Sign Out' });
  if (!ok) return;
  await window.TZ_AUTH.signOut();
  window.location.href = './';
}

// ── Panel navigation ───────────────────────────────────────
let currentPanel = 'overview';

function showPanel(name) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.admin-nav-item').forEach(n => {
    n.classList.remove('active');
    n.removeAttribute('aria-current');
  });

  const panel = document.getElementById('panel-' + name);
  const navBtn = document.getElementById('nav-' + name);
  if (panel) panel.classList.add('active');
  if (navBtn) { navBtn.classList.add('active'); navBtn.setAttribute('aria-current', 'page'); }

  currentPanel = name;
  try { window.history.replaceState(null, '', window.location.pathname + '#' + name); } catch (_) {}

  if (name === 'overview')  renderOverview();
  if (name === 'manage')    renderManageTable();
  if (name === 'reports')   renderReportsTable();
  if (name === 'comments')  renderCommentsInbox();
  if (name === 'tags')      renderTagManager();

  // Keep the main column scrolled to the top when switching panels on mobile
  if (window.innerWidth <= 768) window.scrollTo({ top: 0, behavior: 'smooth' });
}

function startNewMod() {
  resetForm();
  showPanel('create');
  const title = document.getElementById('f-title');
  if (title) title.focus();
}

// ── On load ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  renderOverview();
  initModForm();
  initManageSearch();
  initModGallery();

  // Restore the last open panel from the URL hash (e.g. admin#manage)
  // or deep-link into an edit form via ?edit=<id>
  const editId = new URLSearchParams(window.location.search).get('edit');
  const hashPanel = (window.location.hash || '').replace('#', '');
  if (editId) openEdit(editId);
  else if (['overview', 'manage', 'reports', 'comments', 'tags', 'health'].includes(hashPanel)) showPanel(hashPanel);
  else if (hashPanel === 'create') startNewMod();

  document.getElementById('delete-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeDeleteModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.getElementById('delete-modal').classList.contains('open')) closeDeleteModal();
  });

  // Warn before leaving the page with unsaved form changes
  window.addEventListener('beforeunload', e => {
    if (currentPanel === 'create' && formIsDirty()) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
});

// ── Overview ───────────────────────────────────────────────
function renderOverview() {
  const mods = Store.getAll();
  const counts = Store.countByGame();
  const totalDownloads = mods.reduce((sum, m) => sum + (Number(m.downloads) || 0), 0);
  const totalLikes = mods.reduce((sum, m) => sum + (Number(m.likes) || 0), 0);

  document.getElementById('stat-grid').innerHTML = `
    <div class="stat-card" id="stat-total">
      <div class="stat-card__label">Total Mods</div>
      <div class="stat-card__value">${mods.length}</div>
      <div class="stat-card__sub">across all games</div>
    </div>
    <div class="stat-card" id="stat-ac">
      <div class="stat-card__label">Assetto Corsa</div>
      <div class="stat-card__value">${counts.ac || 0}</div>
      <div class="stat-card__sub">mods published</div>
    </div>
    <div class="stat-card" id="stat-beamng">
      <div class="stat-card__label">BeamNG.drive</div>
      <div class="stat-card__value">${counts.beamng || 0}</div>
      <div class="stat-card__sub">mods published</div>
    </div>
    <div class="stat-card" id="stat-downloads">
      <div class="stat-card__label">Downloads</div>
      <div class="stat-card__value">${window.TZ.formatCount(totalDownloads)}</div>
      <div class="stat-card__sub">${window.TZ.formatCount(totalLikes)} likes in total</div>
    </div>
  `;

  const recent = Store.sortNewest(mods).slice(0, 5);
  const tbody = document.getElementById('recent-tbody');

  if (recent.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="table__empty">No mods yet. <button type="button" class="btn btn--sm" onclick="startNewMod()">Add one</button></td></tr>`;
    return;
  }

  tbody.innerHTML = recent.map(mod => `
    <tr id="recent-row-${escapeHtml(mod.id)}">
      <td class="table__title-cell table__truncate" title="${escapeHtml(mod.title)}">${mod.featured ? '★ ' : ''}${escapeHtml(mod.title)}</td>
      <td><span class="badge badge--filled">${escapeHtml(GAMES[mod.game]?.name || mod.game)}</span></td>
      <td><span class="badge badge--gray">${escapeHtml(mod.category)}</span></td>
      <td><time datetime="${escapeHtml(mod.createdAt)}">${escapeHtml(window.TZ.formatDate(mod.createdAt))}</time></td>
      <td>
        <div class="table__actions">
          <button type="button" class="btn btn--sm" id="ov-edit-${escapeHtml(mod.id)}" onclick="openEdit('${escapeHtml(mod.id)}')">Edit</button>
          <button type="button" class="btn btn--sm btn--danger" id="ov-del-${escapeHtml(mod.id)}" onclick="openDeleteModal('${escapeHtml(mod.id)}')">Delete</button>
        </div>
      </td>
    </tr>
  `).join('');

  renderOverviewCharts(mods);
  renderDuplicateWarnings(mods);
}

function renderBarChart(title, entries) {
  if (!entries.length) return '';
  const max = Math.max(...entries.map(e => e.count), 1);
  return `
    <div class="admin-chart">
      <h3 class="admin-chart__title">${escapeHtml(title)}</h3>
      <div class="admin-chart__bars">
        ${entries.map(e => `
          <div class="admin-chart__row">
            <span class="admin-chart__label" title="${escapeHtml(e.label)}">${escapeHtml(e.label)}</span>
            <div class="admin-chart__track"><div class="admin-chart__fill" style="width:${Math.round((e.count / max) * 100)}%"></div></div>
            <span class="admin-chart__count">${e.count}</span>
          </div>`).join('')}
      </div>
    </div>`;
}

function renderOverviewCharts(mods) {
  const host = document.getElementById('admin-charts');
  if (!host) return;

  const byCategory = {};
  const byGame = {};
  const byTag = {};
  mods.forEach(m => {
    byCategory[m.category || 'Other'] = (byCategory[m.category || 'Other'] || 0) + 1;
    const g = GAMES[m.game]?.name || m.game || 'Other';
    byGame[g] = (byGame[g] || 0) + 1;
    window.TZ.parseTags(m.tags).forEach(t => { byTag[t] = (byTag[t] || 0) + 1; });
  });

  const top = (obj, n = 6) => Object.entries(obj)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n);

  host.innerHTML = [
    renderBarChart('By category', top(byCategory)),
    renderBarChart('By game', top(byGame)),
    renderBarChart('Top tags', top(byTag, 8))
  ].join('');
}

function renderDuplicateWarnings(mods) {
  const host = document.getElementById('admin-dupes');
  if (!host) return;
  const byTitle = {};
  const byUrl = {};
  mods.forEach(m => {
    const t = String(m.title || '').trim().toLowerCase();
    const u = String(m.downloadUrl || '').trim().toLowerCase();
    if (t) (byTitle[t] = byTitle[t] || []).push(m);
    if (u) (byUrl[u] = byUrl[u] || []).push(m);
  });
  const titleDupes = Object.values(byTitle).filter(g => g.length > 1);
  const urlDupes = Object.values(byUrl).filter(g => g.length > 1);
  if (!titleDupes.length && !urlDupes.length) {
    host.style.display = 'none';
    host.innerHTML = '';
    return;
  }
  host.style.display = '';
  const renderGroup = (label, groups) => groups.length ? `
    <div class="admin-dupes__block">
      <h3 class="admin-chart__title">${label}</h3>
      <ul class="admin-dupes__list">
        ${groups.slice(0, 8).map(g => `
          <li>${g.map(m => `<a href="#" onclick="event.preventDefault();openEdit('${escapeHtml(m.id)}')">${escapeHtml(m.title)}</a>`).join(' · ')}
          <span class="form-hint">(${g.length})</span></li>`).join('')}
      </ul>
    </div>` : '';
  host.innerHTML = `<h2 class="section__title" style="margin-bottom:12px;">Possible duplicates</h2>
    ${renderGroup('Same title', titleDupes)}
    ${renderGroup('Same download URL', urlDupes)}`;
}

// ── Manage Table ───────────────────────────────────────────
let manageFilterQuery = '';
let manageFilterGame  = '';
let manageFilterCategory = '';
let managePreset = '';
let manageSort        = 'newest';
let managePage        = 1;
const manageSelected = new Set();

function getManagedMods() {
  let mods = Store.getAll();
  if (manageFilterGame) mods = mods.filter(m => m.game === manageFilterGame);
  if (manageFilterCategory) mods = mods.filter(m => m.category === manageFilterCategory);
  if (manageFilterQuery) {
    const q = manageFilterQuery.toLowerCase();
    mods = mods.filter(m =>
      String(m.title || '').toLowerCase().includes(q) ||
      String(m.category || '').toLowerCase().includes(q) ||
      String(m.tags || '').toLowerCase().includes(q)
    );
  }
  if (managePreset === 'featured') mods = mods.filter(m => m.featured);
  if (managePreset === 'no-images') mods = mods.filter(m => !(m.coverImage || (m.images && m.images.length)));
  if (managePreset === 'no-tags') mods = mods.filter(m => window.TZ.parseTags(m.tags).length === 0);
  if (managePreset === 'no-download') mods = mods.filter(m => !m.downloadUrl);
  if (managePreset === 'zero-downloads') mods = mods.filter(m => !(m.downloads > 0));

  switch (manageSort) {
    case 'oldest':    return Store.sortNewest(mods).reverse();
    case 'title':     return [...mods].sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));
    case 'downloads': return [...mods].sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
    case 'likes':     return [...mods].sort((a, b) => (b.likes || 0) - (a.likes || 0));
    case 'featured':  return [...mods].sort((a, b) => Number(!!b.featured) - Number(!!a.featured) || String(b.createdAtIso || '').localeCompare(String(a.createdAtIso || '')));
    default:          return Store.sortNewest(mods);
  }
}

function renderManageTable() {
  const tbody = document.getElementById('manage-tbody');
  const emptyEl = document.getElementById('manage-empty');
  const pager = document.getElementById('manage-pagination');
  const mods = getManagedMods();

  const totalPages = Math.max(1, Math.ceil(mods.length / MANAGE_PAGE_SIZE));
  if (managePage > totalPages) managePage = totalPages;
  if (managePage < 1) managePage = 1;

  if (mods.length === 0) {
    tbody.innerHTML = '';
    emptyEl.style.display = '';
    pager.innerHTML = '';
    return;
  }

  emptyEl.style.display = 'none';
  const start = (managePage - 1) * MANAGE_PAGE_SIZE;
  const pageMods = mods.slice(start, start + MANAGE_PAGE_SIZE);

  tbody.innerHTML = pageMods.map(mod => `
    <tr id="manage-row-${escapeHtml(mod.id)}" class="${manageSelected.has(mod.id) ? 'is-selected' : ''}">
      <td class="table__check"><input type="checkbox" ${manageSelected.has(mod.id) ? 'checked' : ''} onchange="toggleManageSelect('${escapeHtml(mod.id)}', this.checked)" aria-label="Select ${escapeHtml(mod.title)}" /></td>
      <td class="table__title-cell table__truncate" title="${escapeHtml(mod.title)}">${mod.featured ? '<span class="badge badge--filled" title="Featured">★</span> ' : ''}${escapeHtml(mod.title)}</td>
      <td><span class="badge badge--filled">${escapeHtml(GAMES[mod.game]?.name || mod.game)}</span></td>
      <td><span class="badge badge--gray">${escapeHtml(mod.category)}</span></td>
      <td>v${escapeHtml(mod.version)}</td>
      <td class="table__nowrap" title="${mod.downloads || 0} downloads · ${mod.likes || 0} likes">⬇ ${window.TZ.formatCount(mod.downloads)} &nbsp; ❤️ ${window.TZ.formatCount(mod.likes)}</td>
      <td><time datetime="${escapeHtml(mod.createdAt)}">${escapeHtml(window.TZ.formatDate(mod.createdAt))}</time></td>
      <td>
        <div class="table__actions">
          <button type="button" class="btn btn--sm btn--ghost" title="${mod.featured ? 'Unfeature' : 'Feature'}" onclick="toggleFeatured('${escapeHtml(mod.id)}')">${mod.featured ? '★' : '☆'}</button>
          <a class="btn btn--sm btn--ghost" href="mod.html?id=${encodeURIComponent(mod.id)}" target="_blank" rel="noopener" title="View on site">👁</a>
          <button type="button" class="btn btn--sm" id="edit-btn-${escapeHtml(mod.id)}" onclick="openEdit('${escapeHtml(mod.id)}')">✏️ Edit</button>
          <button type="button" class="btn btn--sm btn--ghost" id="clone-btn-${escapeHtml(mod.id)}" onclick="cloneMod('${escapeHtml(mod.id)}')">⧉ Clone</button>
          <button type="button" class="btn btn--sm btn--danger" id="delete-btn-${escapeHtml(mod.id)}" onclick="openDeleteModal('${escapeHtml(mod.id)}')">🗑 Delete</button>
        </div>
      </td>
    </tr>
  `).join('');

  updateBulkBar();
  const selectAll = document.getElementById('manage-select-all');
  if (selectAll) selectAll.checked = pageMods.length > 0 && pageMods.every(m => manageSelected.has(m.id));

  if (totalPages <= 1) {
    pager.innerHTML = `<span>Showing ${mods.length} ${mods.length === 1 ? 'mod' : 'mods'}</span>`;
    return;
  }
  pager.innerHTML = `
    <span>Showing ${start + 1}–${Math.min(start + MANAGE_PAGE_SIZE, mods.length)} of ${mods.length} mods</span>
    <div class="pagination__controls">
      <button type="button" class="btn btn--sm btn--ghost" onclick="setManagePage(${managePage - 1})" ${managePage === 1 ? 'disabled' : ''} aria-label="Previous page">← Prev</button>
      <span class="pagination__page">Page ${managePage} / ${totalPages}</span>
      <button type="button" class="btn btn--sm btn--ghost" onclick="setManagePage(${managePage + 1})" ${managePage === totalPages ? 'disabled' : ''} aria-label="Next page">Next →</button>
    </div>`;
}

function setManagePage(page) {
  managePage = page;
  renderManageTable();
  const table = document.getElementById('manage-table');
  if (table) table.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function initManageSearch() {
  let timer;
  const searchInput = document.getElementById('manage-search');
  function applySearch() {
    manageFilterQuery = (searchInput.value || '').trim();
    managePage = 1;
    renderManageTable();
  }
  searchInput.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(applySearch, 200);
  });
  searchInput.addEventListener('search', applySearch);

  document.getElementById('manage-game-filter').addEventListener('change', e => {
    manageFilterGame = e.target.value;
    managePage = 1;
    renderManageTable();
  });
  const cat = document.getElementById('manage-category-filter');
  if (cat) cat.addEventListener('change', e => {
    manageFilterCategory = e.target.value;
    managePage = 1;
    renderManageTable();
  });
  document.getElementById('manage-sort').addEventListener('change', e => {
    manageSort = e.target.value;
    managePage = 1;
    renderManageTable();
  });
}

window.setManagePreset = function (preset, btn) {
  managePreset = preset || '';
  managePage = 1;
  if (btn && btn.parentElement) {
    btn.parentElement.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }
  renderManageTable();
};

// ── Reports Table ──────────────────────────────────────────
let reportsFilter = 'pending';

function setReportsFilter(val, btn) {
  reportsFilter = val;
  if (btn && btn.parentElement) {
    btn.parentElement.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }
  renderReportsTable();
}

async function renderReportsTable() {
  const tbody = document.getElementById('reports-tbody');
  tbody.innerHTML = '<tr><td colspan="6" class="table__empty">Loading reports…</td></tr>';

  const all = await Store.getReports();
  const pendingCount = all.filter(r => r.status !== 'resolved').length;
  const badge = document.getElementById('reports-pending-badge');
  if (badge) {
    badge.textContent = pendingCount;
    badge.style.display = pendingCount > 0 ? '' : 'none';
  }

  const reports = reportsFilter === 'all' ? all : all.filter(r => (reportsFilter === 'resolved') === (r.status === 'resolved'));
  if (reports.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="table__empty">${reportsFilter === 'pending' ? 'No pending reports. 🎉' : 'No reports found.'}</td></tr>`;
    return;
  }

  tbody.innerHTML = reports.map(r => {
    let targetLink = `<small>${escapeHtml(r.target_id)}</small>`;
    if (r.target_type === 'mod') {
      targetLink = `<a href="mod.html?id=${encodeURIComponent(r.target_id)}" target="_blank" rel="noopener">${escapeHtml(r.target_id)}</a>`;
    } else if (r.target_type === 'comment') {
      const modId = r.context_id || '';
      targetLink = modId
        ? `<a href="mod.html?id=${encodeURIComponent(modId)}#comment-${encodeURIComponent(r.target_id)}" target="_blank" rel="noopener">Comment #${escapeHtml(r.target_id)}</a>`
        : `<small>Comment #${escapeHtml(r.target_id)}</small>`;
    }
    const deleteBtn = (r.status !== 'resolved' && r.target_type === 'comment')
      ? `<button type="button" class="btn btn--sm btn--danger" onclick="deleteReportedComment('${escapeHtml(r.target_id)}','${escapeHtml(r.id)}')">Delete comment</button>`
      : '';
    return `
    <tr>
      <td class="table__nowrap"><time datetime="${escapeHtml(r.created_at || '')}" title="${r.created_at ? new Date(r.created_at).toLocaleString() : ''}">${escapeHtml(window.TZ.timeAgo(r.created_at))}</time></td>
      <td><span class="badge badge--gray">${escapeHtml(r.target_type)}</span><br/>${targetLink}</td>
      <td class="table__truncate" title="${escapeHtml(r.reported_by)}">${escapeHtml(r.reported_by)}</td>
      <td class="table__wrap">${escapeHtml(r.reason)}</td>
      <td>
        ${r.status === 'resolved'
          ? '<span class="badge badge--filled badge--success">Resolved</span>'
          : '<span class="badge badge--gray">Pending</span>'}
      </td>
      <td class="table__nowrap">
        ${r.status !== 'resolved' ? `<button type="button" class="btn btn--sm" onclick="resolveReport('${escapeHtml(r.id)}')">Resolve</button>` : ''}
        ${deleteBtn}
      </td>
    </tr>`;
  }).join('');
}

window.resolveReport = async function (id) {
  const ok = await window.TZ.confirmDialog('The report will be marked as handled.', { title: 'Resolve report?', confirmText: 'Resolve' });
  if (!ok) return;
  const success = await Store.resolveReport(id);
  showToast(success ? '✅ Report resolved.' : '❌ Could not resolve report.');
  renderReportsTable();
};

window.deleteReportedComment = async function (commentId, reportId) {
  const ok = await window.TZ.confirmDialog('This deletes the comment (and its replies) and resolves the report.', {
    title: 'Delete reported comment?',
    confirmText: 'Delete comment',
    danger: true
  });
  if (!ok) return;
  const success = await Store.deleteCommentAndResolve(commentId, reportId);
  showToast(success ? '✅ Comment deleted and report resolved.' : '❌ Could not delete comment.');
  renderReportsTable();
};

// ── Description Auto-expansion ──────────────────────────────
function autoExpandDesc(el) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = Math.max(el.scrollHeight, 120) + 'px';
}

// ── Multi-Image Gallery ────────────────────────────────────
let currentImages = []; // Array of { id, preview, file, url }
let coverId = null;     // ID of designated cover image

function newImageId() {
  return 'img_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
}

function revokePreview(item) {
  if (item && item.file && item.preview && item.preview.startsWith('blob:')) {
    URL.revokeObjectURL(item.preview);
  }
}

function renderImageGallery() {
  const grid = document.getElementById('img-gallery-grid');
  const empty = document.getElementById('img-gallery-empty');
  const countBadge = document.getElementById('img-count-badge');
  const pickBtn = document.getElementById('btn-pick-imgs');

  if (countBadge) countBadge.textContent = `(${currentImages.length} / ${MAX_IMAGES} max)`;
  if (pickBtn) pickBtn.disabled = currentImages.length >= MAX_IMAGES;

  if (currentImages.length > 0 && (!coverId || !currentImages.some(item => item.id === coverId))) {
    coverId = currentImages[0].id;
  } else if (currentImages.length === 0) {
    coverId = null;
  }

  if (currentImages.length === 0) {
    grid.innerHTML = '';
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';
  grid.innerHTML = currentImages.map((item, idx) => {
    const isCover = item.id === coverId;
    const isPending = !!item.file;
    return `
      <div class="image-card ${isCover ? 'is-cover' : ''}" id="img-card-${idx}">
        <div class="image-card__thumb-wrap">
          <img src="${escapeHtml(item.preview)}" alt="Mod image ${idx + 1}" class="image-card__thumb" onerror="this.style.opacity='0.35'" />
          ${isCover ? '<span class="image-card__badge">★ COVER</span>' : ''}
          <span class="image-card__order">#${idx + 1}</span>
          ${isPending ? '<span class="image-card__pending">💾 Pending upload</span>' : ''}
        </div>
        <div class="image-card__controls">
          <button type="button" class="btn btn--sm" title="Move left" aria-label="Move image left" onclick="moveImage(${idx}, -1)" ${idx === 0 ? 'disabled' : ''}>◀</button>
          <button type="button" class="btn btn--sm" title="Move right" aria-label="Move image right" onclick="moveImage(${idx}, 1)" ${idx === currentImages.length - 1 ? 'disabled' : ''}>▶</button>
          <button type="button" class="btn btn--sm btn--danger" title="Remove image" aria-label="Remove image" onclick="removeImage(${idx})">🗑</button>
        </div>
        <button type="button" class="image-card__cover-btn" onclick="setAsCover(${idx})" ${isCover ? 'disabled' : ''}>
          ${isCover ? '✓ Main Cover' : 'Set as Cover'}
        </button>
      </div>`;
  }).join('');
}

function setAsCover(idx) {
  if (!currentImages[idx]) return;
  const item = currentImages.splice(idx, 1)[0];
  currentImages.unshift(item);
  coverId = item.id;
  renderImageGallery();
}

function moveImage(idx, delta) {
  const newIdx = idx + delta;
  if (newIdx < 0 || newIdx >= currentImages.length) return;
  [currentImages[idx], currentImages[newIdx]] = [currentImages[newIdx], currentImages[idx]];
  renderImageGallery();
}

function removeImage(idx) {
  const item = currentImages[idx];
  if (!item) return;
  revokePreview(item);
  currentImages.splice(idx, 1);
  if (coverId === item.id) coverId = currentImages[0] ? currentImages[0].id : null;
  renderImageGallery();
}

function addImageFromUrl() {
  const input = document.getElementById('f-img-url-input');
  const url = input.value.trim();
  if (!url) return;
  if (!isValidUrl(url)) {
    showToast('⚠️ Please enter a valid URL starting with http:// or https://');
    return;
  }
  if (currentImages.length >= MAX_IMAGES) {
    showToast(`⚠️ Maximum ${MAX_IMAGES} images allowed per mod.`);
    return;
  }
  if (currentImages.some(item => item.url === url)) {
    showToast('That image is already in the gallery.');
    return;
  }
  const item = { id: newImageId(), preview: url, file: null, url };
  currentImages.push(item);
  if (!coverId) coverId = item.id;
  input.value = '';
  renderImageGallery();
}

/** Downscale large images client-side before upload (max 1920px wide, JPEG 82%) */
function compressImage(file) {
  return new Promise(resolve => {
    if (!file || !String(file.type || '').startsWith('image/')) {
      resolve(null);
      return;
    }
    // GIFs would lose animation and SVGs are already tiny
    if (file.type === 'image/gif' || file.type === 'image/svg+xml') {
      resolve(file);
      return;
    }
    const img = new Image();
    const objUrl = URL.createObjectURL(file);
    const finish = result => { URL.revokeObjectURL(objUrl); resolve(result); };
    img.onerror = () => finish(file);
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        const MAX_WIDTH = 1920;
        if (width > MAX_WIDTH) {
          height = Math.round((height * MAX_WIDTH) / width);
          width = MAX_WIDTH;
        }
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        canvas.toBlob(blob => {
          if (!blob) { finish(file); return; }
          // Only keep the compressed version if it is actually smaller
          if (blob.size >= file.size) { finish(file); return; }
          finish(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
        }, 'image/jpeg', 0.82);
      } catch (_) {
        finish(file);
      }
    };
    img.src = objUrl;
  });
}

function addFiles(files) {
  const remainingSlots = MAX_IMAGES - currentImages.length;
  if (remainingSlots <= 0) {
    showToast(`⚠️ Maximum ${MAX_IMAGES} images allowed per mod.`);
    return;
  }
  const MAX_BYTES = 10 * 1024 * 1024;
  const oversized = files.filter(f => f && f.size > MAX_BYTES);
  const eligible = files.filter(f => f && f.size <= MAX_BYTES);
  if (oversized.length) {
    showToast(`⚠️ Skipped ${oversized.length} file(s) over 10MB.`);
  }
  const toAdd = eligible.slice(0, remainingSlots);
  if (eligible.length > remainingSlots) {
    showToast(`⚠️ Only adding ${remainingSlots} image(s) to stay within the ${MAX_IMAGES}-image limit.`);
  }
  if (!toAdd.length) return;

  Promise.all(toAdd.map(compressImage)).then(results => {
    const skipped = results.filter(r => r === null).length;
    results.filter(Boolean).forEach(file => {
      const item = { id: newImageId(), preview: URL.createObjectURL(file), file, url: null };
      currentImages.push(item);
      if (!coverId) coverId = item.id;
    });
    renderImageGallery();
    const added = results.length - skipped;
    if (added > 0) showToast(`📷 Added ${added} image(s). They upload when you publish.`);
    if (skipped > 0) showToast(`⚠️ Skipped ${skipped} file(s) that were not images.`);
  }).catch(() => {
    showToast('❌ Could not process one or more images. Please try a different file.');
  });
}

function initModGallery() {
  const fileInput = document.getElementById('f-img-files');
  if (fileInput) {
    fileInput.addEventListener('change', e => {
      const files = Array.from(e.target.files || []);
      fileInput.value = '';
      if (files.length) addFiles(files);
    });
  }

  // Drag & drop onto the image field
  const dropZone = document.getElementById('field-img');
  if (dropZone) {
    ['dragenter', 'dragover'].forEach(evt => dropZone.addEventListener(evt, e => {
      e.preventDefault();
      dropZone.classList.add('is-dragover');
    }));
    ['dragleave', 'drop'].forEach(evt => dropZone.addEventListener(evt, e => {
      e.preventDefault();
      dropZone.classList.remove('is-dragover');
    }));
    dropZone.addEventListener('drop', e => {
      const files = Array.from((e.dataTransfer && e.dataTransfer.files) || []);
      if (files.length) addFiles(files);
    });
  }

  const descEl = document.getElementById('f-desc');
  if (descEl) {
    descEl.addEventListener('input', () => {
      autoExpandDesc(descEl);
      updateDescPreview();
    });
    updateDescPreview();
  }

  renderImageGallery();
}

// ── Form ───────────────────────────────────────────────────
let formSnapshot = '';

function initModForm() {
  document.getElementById('mod-form').addEventListener('submit', handleFormSubmit);
  formSnapshot = serializeForm();
}

function serializeForm() {
  return JSON.stringify({
    title: document.getElementById('f-title').value,
    version: document.getElementById('f-version').value,
    game: document.getElementById('f-game').value,
    category: document.getElementById('f-category').value,
    tags: document.getElementById('f-tags').value,
    desc: document.getElementById('f-desc').value,
    dl: document.getElementById('f-dl').value,
    featured: !!(document.getElementById('f-featured') && document.getElementById('f-featured').checked),
    images: currentImages.map(i => i.url || i.preview),
    cover: coverId
  });
}

function formIsDirty() {
  return serializeForm() !== formSnapshot;
}

function resetForm() {
  const form = document.getElementById('mod-form');
  form.reset();

  currentImages.forEach(revokePreview);
  currentImages = [];
  coverId = null;
  renderImageGallery();

  const descEl = document.getElementById('f-desc');
  if (descEl) descEl.style.height = 'auto';
  updateDescPreview();

  document.getElementById('edit-id').value = '';
  document.getElementById('form-panel-title').textContent = 'New Mod';
  document.getElementById('form-panel-sub').textContent = 'Fill in the details below to publish a new mod.';
  document.getElementById('form-submit-btn').disabled = false;
  document.getElementById('form-submit-btn').textContent = 'Publish Mod';
  document.getElementById('form-cancel-btn').style.display = 'none';

  ['title', 'version', 'game', 'category', 'desc', 'dl', 'img'].forEach(clearFieldError);
  formSnapshot = serializeForm();
}

function openEdit(id) {
  const mod = Store.getById(id);
  if (!mod) { showToast('Mod not found.'); return; }

  currentImages.forEach(revokePreview);

  document.getElementById('edit-id').value = id;
  document.getElementById('f-title').value    = mod.title;
  document.getElementById('f-version').value  = mod.version;
  document.getElementById('f-game').value     = mod.game;
  document.getElementById('f-category').value = mod.category;
  document.getElementById('f-tags').value     = mod.tags || '';

  const descEl = document.getElementById('f-desc');
  descEl.value = mod.description || '';
  autoExpandDesc(descEl);
  updateDescPreview();

  document.getElementById('f-dl').value = mod.downloadUrl || '';
  const featuredEl = document.getElementById('f-featured');
  if (featuredEl) featuredEl.checked = !!mod.featured;

  const existingUrls = (Array.isArray(mod.images) && mod.images.length > 0)
    ? mod.images
    : (mod.coverImage ? [mod.coverImage] : []);
  currentImages = existingUrls.map(url => ({ id: newImageId(), preview: url, file: null, url }));

  const coverItem = mod.coverImage ? currentImages.find(item => item.url === mod.coverImage) : null;
  coverId = coverItem ? coverItem.id : (currentImages[0] ? currentImages[0].id : null);
  renderImageGallery();

  document.getElementById('form-panel-title').textContent = 'Edit Mod';
  document.getElementById('form-panel-sub').textContent   = 'Update the details below and save changes.';
  document.getElementById('form-submit-btn').textContent  = 'Save Changes';
  document.getElementById('form-cancel-btn').style.display = '';

  ['title', 'version', 'game', 'category', 'desc', 'dl', 'img'].forEach(clearFieldError);
  showPanel('create');
  autoExpandDesc(descEl);
  formSnapshot = serializeForm();
}

async function cancelEdit() {
  if (formIsDirty()) {
    const ok = await window.TZ.confirmDialog('Your unsaved changes will be lost.', { title: 'Discard changes?', confirmText: 'Discard', danger: true });
    if (!ok) return;
  }
  resetForm();
  showPanel('manage');
}

async function handleFormSubmit(e) {
  e.preventDefault();
  if (!validateForm()) {
    const firstError = document.querySelector('.form-field.error .input');
    if (firstError) firstError.focus();
    return;
  }

  const editId = document.getElementById('edit-id').value;
  const submitBtn = document.getElementById('form-submit-btn');
  const idleLabel = editId ? 'Save Changes' : 'Publish Mod';
  submitBtn.disabled = true;

  // Step 1: upload pending images to Supabase Storage
  const pendingItems = currentImages.filter(item => item.file && !item.url);
  for (let i = 0; i < pendingItems.length; i++) {
    const item = pendingItems[i];
    submitBtn.textContent = `Uploading image ${i + 1} of ${pendingItems.length}…`;
    try {
      const publicUrl = await Store.uploadImage(item.file);
      revokePreview(item);
      item.url = publicUrl;
      item.preview = publicUrl;
      item.file = null;
    } catch (err) {
      console.error('Image upload failed:', err);
      showToast(`❌ Failed to upload image: ${formatSbError(err)}`);
      submitBtn.disabled = false;
      submitBtn.textContent = idleLabel;
      renderImageGallery();
      return;
    }
  }
  renderImageGallery();

  submitBtn.textContent = editId ? 'Saving…' : 'Publishing…';

  // Step 2: assemble the mod record
  const finalImageUrls = currentImages.map(item => item.url).filter(Boolean);
  const coverItem = currentImages.find(item => item.id === coverId);
  const finalCoverUrl = (coverItem && coverItem.url) ? coverItem.url : (finalImageUrls[0] || '');

  const data = {
    title:       document.getElementById('f-title').value.trim(),
    version:     document.getElementById('f-version').value.trim(),
    game:        document.getElementById('f-game').value,
    category:    document.getElementById('f-category').value,
    tags:        window.TZ.parseTags(document.getElementById('f-tags').value).join(', '),
    description: document.getElementById('f-desc').value.trim(),
    downloadUrl: document.getElementById('f-dl').value.trim(),
    featured:    !!(document.getElementById('f-featured') && document.getElementById('f-featured').checked),
    coverImage:  finalCoverUrl,
    images:      finalImageUrls,
  };

  try {
    if (editId) {
      await Store.update(editId, data);
      showToast('✅ Mod updated successfully!');
      formSnapshot = serializeForm();
      resetForm();
      showPanel('manage');
    } else {
      const now = new Date();
      const newMod = {
        id: generateId(),
        createdAt: now.toISOString().slice(0, 10),
        createdAtIso: now.toISOString(),
        createdBy: 'admin',
        downloads: 0,
        likes: 0,
        ...data,
      };
      await Store.add(newMod);
      showToast('🚀 Mod published live!');
      formSnapshot = serializeForm();
      resetForm();
      showPanel('overview');
    }
  } catch (err) {
    showToast(`❌ Failed to ${editId ? 'update' : 'publish'} mod: ${formatSbError(err)}`);
    submitBtn.disabled = false;
    submitBtn.textContent = idleLabel;
    return;
  }

  submitBtn.disabled = false;
  submitBtn.textContent = 'Publish Mod';
  renderOverview();
  if (currentPanel === 'manage') renderManageTable();
}

// ── Form Validation ────────────────────────────────────────
function validateForm() {
  let valid = true;
  const check = (name, ok) => { if (ok) clearFieldError(name); else { setFieldError(name); valid = false; } };

  check('title',    document.getElementById('f-title').value.trim().length > 0);
  check('version',  document.getElementById('f-version').value.trim().length > 0);
  check('game',     !!document.getElementById('f-game').value);
  check('category', !!document.getElementById('f-category').value);
  check('desc',     document.getElementById('f-desc').value.trim().length > 0);
  check('dl',       isValidUrl(document.getElementById('f-dl').value.trim()));

  if (currentImages.length > MAX_IMAGES) {
    showToast(`⚠️ Maximum ${MAX_IMAGES} images allowed per mod.`);
    valid = false;
  }
  return valid;
}

function isValidUrl(str) {
  return /^https?:\/\/.+/.test(str);
}
function setFieldError(name) {
  document.getElementById('field-' + name)?.classList.add('error');
}
function clearFieldError(name) {
  document.getElementById('field-' + name)?.classList.remove('error');
}

// ── Delete Modal ───────────────────────────────────────────
let pendingDeleteId = null;

function openDeleteModal(id) {
  const mod = Store.getById(id);
  const title = mod && mod.title ? mod.title : 'this mod';
  pendingDeleteId = id;
  document.getElementById('modal-sub').textContent =
    `"${title}" will be permanently removed along with its images. This cannot be undone.`;
  document.getElementById('delete-modal').classList.add('open');
  document.getElementById('modal-confirm-btn').focus();
}

function closeDeleteModal() {
  pendingDeleteId = null;
  document.getElementById('delete-modal').classList.remove('open');
}

async function confirmDelete() {
  if (!pendingDeleteId) return;
  const idToDelete = pendingDeleteId;
  closeDeleteModal();

  // Optimistically remove the row so the UI feels instant
  document.getElementById('manage-row-' + idToDelete)?.remove();
  document.getElementById('recent-row-' + idToDelete)?.remove();

  try {
    await Store.delete(idToDelete);
    showToast('🗑 Mod deleted.');
  } catch (err) {
    showToast('❌ Failed to delete mod: ' + formatSbError(err));
  }
  renderOverview();
  if (currentPanel === 'manage') renderManageTable();
}

function updateDescPreview() {
  const src = document.getElementById('f-desc');
  const preview = document.getElementById('desc-preview');
  if (!src || !preview) return;
  const raw = src.value.trim();
  if (!raw) {
    preview.innerHTML = '<p class="form-hint">Markdown preview will appear here.</p>';
    return;
  }
  try {
    const html = (window.marked && marked.parse)
      ? marked.parse(raw, { breaks: true })
      : raw.replace(/</g, '&lt;');
    preview.innerHTML = (window.DOMPurify && DOMPurify.sanitize)
      ? DOMPurify.sanitize(html)
      : html;
  } catch (_) {
    preview.textContent = raw;
  }
}

window.cloneMod = function (id) {
  const mod = Store.getById(id);
  if (!mod) { showToast('Mod not found.'); return; }
  startNewMod();
  document.getElementById('f-title').value = (mod.title || '') + ' (Copy)';
  document.getElementById('f-version').value = mod.version || '1.0.0';
  document.getElementById('f-game').value = mod.game || '';
  document.getElementById('f-category').value = mod.category || '';
  document.getElementById('f-tags').value = mod.tags || '';
  document.getElementById('f-desc').value = mod.description || '';
  document.getElementById('f-dl').value = mod.downloadUrl || '';
  autoExpandDesc(document.getElementById('f-desc'));
  updateDescPreview();
  // Keep image URLs (shared assets) so a version bump is quick
  const existingUrls = (Array.isArray(mod.images) && mod.images.length > 0)
    ? mod.images
    : (mod.coverImage ? [mod.coverImage] : []);
  currentImages = existingUrls.map(url => ({ id: newImageId(), preview: url, file: null, url }));
  coverId = currentImages[0] ? currentImages[0].id : null;
  renderImageGallery();
  formSnapshot = serializeForm();
  document.getElementById('form-panel-title').textContent = 'Clone Mod';
  document.getElementById('form-panel-sub').textContent = 'Review the copied details, then publish as a new mod.';
  showToast('⧉ Mod cloned into the form — publish when ready.');
};

window.downloadSitemap = function () {
  const xml = Store.buildSitemapXml('https://tuckzed.com');
  const blob = new Blob([xml], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'sitemap.xml';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast('📄 Sitemap downloaded — replace the file in the repo if needed.');
};

// ── Selection / bulk actions ───────────────────────────────
function updateBulkBar() {
  const bar = document.getElementById('manage-bulk-bar');
  const count = document.getElementById('manage-bulk-count');
  if (!bar || !count) return;
  const n = manageSelected.size;
  bar.style.display = n ? '' : 'none';
  count.textContent = n + ' selected';
}

window.toggleManageSelect = function (id, checked) {
  if (checked) manageSelected.add(id); else manageSelected.delete(id);
  updateBulkBar();
};

window.toggleSelectAllManaged = function (checked) {
  const mods = getManagedMods();
  const start = (managePage - 1) * MANAGE_PAGE_SIZE;
  const pageMods = mods.slice(start, start + MANAGE_PAGE_SIZE);
  pageMods.forEach(m => { if (checked) manageSelected.add(m.id); else manageSelected.delete(m.id); });
  renderManageTable();
};

window.clearManageSelection = function () {
  manageSelected.clear();
  renderManageTable();
};

window.toggleFeatured = async function (id) {
  const mod = Store.getById(id);
  if (!mod) return;
  const next = !mod.featured;
  await Store.setFeatured(id, next);
  showToast(next ? '★ Featured on homepage.' : 'Removed from featured.');
  renderManageTable();
  if (currentPanel === 'overview') renderOverview();
};

window.bulkSetFeatured = async function (featured) {
  if (!manageSelected.size) return;
  const ids = [...manageSelected];
  for (const id of ids) await Store.setFeatured(id, featured);
  showToast((featured ? '★ Featured ' : 'Unfeatured ') + ids.length + ' mod(s).');
  clearManageSelection();
  renderManageTable();
};

window.bulkAppendTag = async function () {
  if (!manageSelected.size) return;
  const tag = await window.TZ.promptDialog('Tag to add to the selected mods:', {
    title: 'Add tag',
    placeholder: 'e.g. drift',
    confirmText: 'Add tag'
  });
  if (!tag) return;
  const clean = window.TZ.parseTags(tag)[0];
  if (!clean) return;
  const ids = [...manageSelected];
  for (const id of ids) {
    const mod = Store.getById(id);
    if (!mod) continue;
    const tags = window.TZ.parseTags(mod.tags);
    if (!tags.map(t => t.toLowerCase()).includes(clean.toLowerCase())) tags.push(clean);
    await Store.update(id, { tags: tags.join(', ') });
  }
  showToast('Tagged ' + ids.length + ' mod(s) with #' + clean);
  clearManageSelection();
  renderManageTable();
};

window.bulkDeleteSelected = async function () {
  if (!manageSelected.size) return;
  const ok = await window.TZ.confirmDialog('Permanently delete ' + manageSelected.size + ' selected mod(s)?', {
    title: 'Bulk delete?',
    confirmText: 'Delete all',
    danger: true
  });
  if (!ok) return;
  const ids = [...manageSelected];
  for (const id of ids) {
    try { await Store.delete(id); } catch (_) {}
  }
  showToast('🗑 Deleted ' + ids.length + ' mod(s).');
  clearManageSelection();
  renderManageTable();
  renderOverview();
};

// ── Export CSV ─────────────────────────────────────────────
window.exportModsCsv = function () {
  const mods = Store.getAll();
  const cols = ['id','title','game','category','version','tags','downloads','likes','featured','downloadUrl','createdAt','coverImage'];
  const esc = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const lines = [cols.join(',')].concat(mods.map(m => cols.map(c => esc(m[c])).join(',')));
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'tuckzed-mods.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast('⬇ Exported ' + mods.length + ' mods to CSV.');
};

// ── Comments inbox ─────────────────────────────────────────
async function renderCommentsInbox() {
  const tbody = document.getElementById('comments-inbox-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="5" class="table__empty">Loading comments…</td></tr>';
  const comments = await Store.listRecentComments(50);
  if (!comments.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="table__empty">No comments yet.</td></tr>';
    return;
  }
  tbody.innerHTML = comments.map(c => `
    <tr>
      <td class="table__nowrap"><time datetime="${escapeHtml(c.created_at || '')}">${escapeHtml(window.TZ.timeAgo(c.created_at))}</time></td>
      <td class="table__truncate" title="${escapeHtml(c.mod_title || '')}">
        <a href="mod.html?id=${encodeURIComponent(c.mod_id)}#comment-${encodeURIComponent(c.id)}" target="_blank" rel="noopener">${escapeHtml(c.mod_title || c.mod_id)}</a>
      </td>
      <td class="table__truncate">${escapeHtml(c.username || c.user_email || '?')}</td>
      <td class="table__wrap">${escapeHtml(String(c.comment || '').slice(0, 180))}</td>
      <td class="table__nowrap">
        <button type="button" class="btn btn--sm btn--danger" onclick="adminDeleteComment('${escapeHtml(c.id)}')">Delete</button>
      </td>
    </tr>`).join('');
}

window.adminDeleteComment = async function (id) {
  const ok = await window.TZ.confirmDialog('Delete this comment and its replies?', {
    title: 'Delete comment?',
    confirmText: 'Delete',
    danger: true
  });
  if (!ok) return;
  const success = await Store.deleteComment(id);
  showToast(success ? 'Comment deleted.' : 'Could not delete comment.');
  renderCommentsInbox();
};

// ── Tag manager ────────────────────────────────────────────
function getTagInventory() {
  const map = {};
  Store.getAll().forEach(m => {
    window.TZ.parseTags(m.tags).forEach(t => {
      const key = t.toLowerCase();
      if (!map[key]) map[key] = { label: t, count: 0, ids: [] };
      map[key].count += 1;
      map[key].ids.push(m.id);
    });
  });
  return Object.values(map).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function renderTagManager() {
  const host = document.getElementById('tag-manager-list');
  if (!host) return;
  const q = ((document.getElementById('tag-search') || {}).value || '').trim().toLowerCase();
  let tags = getTagInventory();
  if (q) tags = tags.filter(t => t.label.toLowerCase().includes(q));
  if (!tags.length) {
    host.innerHTML = '<p class="form-hint">No tags found.</p>';
    return;
  }
  host.innerHTML = tags.map(t => `
    <div class="tag-manager-row">
      <div>
        <strong>#${escapeHtml(t.label)}</strong>
        <span class="form-hint"> · ${t.count} mod${t.count === 1 ? '' : 's'}</span>
      </div>
      <div class="table__actions">
        <button type="button" class="btn btn--sm" onclick="renameTag('${escapeHtml(t.label)}')">Rename</button>
        <button type="button" class="btn btn--sm btn--ghost" onclick="mergeTag('${escapeHtml(t.label)}')">Merge into…</button>
        <button type="button" class="btn btn--sm btn--ghost" onclick="filterManageByTag('${escapeHtml(t.label)}')">View mods</button>
      </div>
    </div>`).join('');

  const search = document.getElementById('tag-search');
  if (search && !search._bound) {
    search._bound = true;
    search.addEventListener('input', () => renderTagManager());
  }
}

window.filterManageByTag = function (tag) {
  manageFilterQuery = tag;
  const input = document.getElementById('manage-search');
  if (input) input.value = tag;
  showPanel('manage');
};

window.renameTag = async function (fromTag) {
  const toTag = await window.TZ.promptDialog('Rename #' + fromTag + ' to:', {
    title: 'Rename tag',
    defaultValue: fromTag,
    confirmText: 'Rename'
  });
  if (!toTag) return;
  const next = window.TZ.parseTags(toTag)[0];
  if (!next || next.toLowerCase() === fromTag.toLowerCase()) return;
  await rewriteTag(fromTag, next);
  showToast('Renamed #' + fromTag + ' → #' + next);
  renderTagManager();
};

window.mergeTag = async function (fromTag) {
  const toTag = await window.TZ.promptDialog('Merge #' + fromTag + ' into this existing tag:', {
    title: 'Merge tag',
    placeholder: 'target-tag',
    confirmText: 'Merge'
  });
  if (!toTag) return;
  const next = window.TZ.parseTags(toTag)[0];
  if (!next) return;
  await rewriteTag(fromTag, next);
  showToast('Merged #' + fromTag + ' into #' + next);
  renderTagManager();
};

async function rewriteTag(fromTag, toTag) {
  const from = fromTag.toLowerCase();
  const mods = Store.getAll();
  for (const mod of mods) {
    const tags = window.TZ.parseTags(mod.tags);
    let changed = false;
    const next = [];
    const seen = new Set();
    tags.forEach(t => {
      const value = t.toLowerCase() === from ? toTag : t;
      const key = value.toLowerCase();
      if (seen.has(key)) { changed = true; return; }
      seen.add(key);
      if (value !== t) changed = true;
      next.push(value);
    });
    if (changed) await Store.update(mod.id, { tags: next.join(', ') });
  }
}

// ── Health checks ──────────────────────────────────────────
function probeImage(url, timeoutMs = 8000) {
  return new Promise(resolve => {
    if (!url) return resolve(false);
    const img = new Image();
    const timer = setTimeout(() => { img.src = ''; resolve(false); }, timeoutMs);
    img.onload = () => { clearTimeout(timer); resolve(true); };
    img.onerror = () => { clearTimeout(timer); resolve(false); };
    img.referrerPolicy = 'no-referrer';
    img.src = url + (url.includes('?') ? '&' : '?') + 'tz_cb=' + Date.now();
  });
}

window.runLinkHealthCheck = async function () {
  const host = document.getElementById('health-results');
  if (!host) return;
  const mods = Store.getAll();
  host.innerHTML = '<p class="form-hint">Checking ' + mods.length + ' download URLs…</p>';
  const issues = [];
  for (const mod of mods) {
    const url = (mod.downloadUrl || '').trim();
    if (!url) {
      issues.push({ mod, kind: 'Missing download URL' });
      continue;
    }
    if (!/^https:\/\//i.test(url)) {
      issues.push({ mod, kind: 'Not HTTPS', detail: url });
      continue;
    }
    try {
      await fetch(url, { method: 'HEAD', mode: 'no-cors' });
      // Opaque success — we can only confirm the request was sent.
    } catch (_) {
      issues.push({ mod, kind: 'Request failed', detail: url });
    }
  }
  renderHealthResults(host, 'Download link scan', issues, true);
};

window.runImageHealthCheck = async function () {
  const host = document.getElementById('health-results');
  if (!host) return;
  const mods = Store.getAll();
  host.innerHTML = '<p class="form-hint">Probing cover images…</p>';
  const issues = [];
  for (const mod of mods) {
    const urls = [mod.coverImage].concat(Array.isArray(mod.images) ? mod.images : []).filter(Boolean);
    if (!urls.length) {
      issues.push({ mod, kind: 'No images' });
      continue;
    }
    const coverOk = await probeImage(mod.coverImage || urls[0]);
    if (!coverOk) issues.push({ mod, kind: 'Cover failed to load', detail: mod.coverImage || urls[0] });
  }
  renderHealthResults(host, 'Image scan', issues, false);
};

function renderHealthResults(host, title, issues, isLink) {
  if (!issues.length) {
    host.innerHTML = '<p class="form-hint">✅ ' + title + ' found no obvious problems.</p>';
    return;
  }
  host.innerHTML = `
    <h3 class="admin-chart__title">${escapeHtml(title)} — ${issues.length} issue${issues.length === 1 ? '' : 's'}</h3>
    <div class="table-wrap"><table class="table"><thead><tr><th>Mod</th><th>Issue</th><th>Detail</th><th></th></tr></thead>
    <tbody>
      ${issues.map(i => `
        <tr>
          <td class="table__truncate">${escapeHtml(i.mod.title)}</td>
          <td>${escapeHtml(i.kind)}</td>
          <td class="table__truncate" title="${escapeHtml(i.detail || '')}">${escapeHtml(i.detail || '—')}</td>
          <td><button type="button" class="btn btn--sm" onclick="openEdit('${escapeHtml(i.mod.id)}')">Edit</button>
          ${isLink && i.mod.downloadUrl ? ` <a class="btn btn--sm btn--ghost" href="${escapeHtml(i.mod.downloadUrl)}" target="_blank" rel="noopener">Open</a>` : ''}
          </td>
        </tr>`).join('')}
    </tbody></table></div>`;
}
