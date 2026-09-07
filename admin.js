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

  if (name === 'overview') renderOverview();
  if (name === 'manage')   renderManageTable();
  if (name === 'reports')  renderReportsTable();

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
  else if (['overview', 'manage', 'reports'].includes(hashPanel)) showPanel(hashPanel);
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
      <td class="table__title-cell table__truncate" title="${escapeHtml(mod.title)}">${escapeHtml(mod.title)}</td>
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
}

// ── Manage Table ───────────────────────────────────────────
let manageFilterQuery = '';
let manageFilterGame  = '';
let manageSort        = 'newest';
let managePage        = 1;

function getManagedMods() {
  let mods = Store.getAll();
  if (manageFilterGame) mods = mods.filter(m => m.game === manageFilterGame);
  if (manageFilterQuery) {
    const q = manageFilterQuery.toLowerCase();
    mods = mods.filter(m =>
      String(m.title || '').toLowerCase().includes(q) ||
      String(m.category || '').toLowerCase().includes(q) ||
      String(m.tags || '').toLowerCase().includes(q)
    );
  }
  switch (manageSort) {
    case 'oldest':    return Store.sortNewest(mods).reverse();
    case 'title':     return [...mods].sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));
    case 'downloads': return [...mods].sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
    case 'likes':     return [...mods].sort((a, b) => (b.likes || 0) - (a.likes || 0));
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
    <tr id="manage-row-${escapeHtml(mod.id)}">
      <td class="table__title-cell table__truncate" title="${escapeHtml(mod.title)}">${escapeHtml(mod.title)}</td>
      <td><span class="badge badge--filled">${escapeHtml(GAMES[mod.game]?.name || mod.game)}</span></td>
      <td><span class="badge badge--gray">${escapeHtml(mod.category)}</span></td>
      <td>v${escapeHtml(mod.version)}</td>
      <td class="table__nowrap" title="${mod.downloads || 0} downloads · ${mod.likes || 0} likes">⬇ ${window.TZ.formatCount(mod.downloads)} &nbsp; ❤️ ${window.TZ.formatCount(mod.likes)}</td>
      <td><time datetime="${escapeHtml(mod.createdAt)}">${escapeHtml(window.TZ.formatDate(mod.createdAt))}</time></td>
      <td>
        <div class="table__actions">
          <a class="btn btn--sm btn--ghost" href="mod.html?id=${encodeURIComponent(mod.id)}" target="_blank" rel="noopener" title="View on site">👁</a>
          <button type="button" class="btn btn--sm" id="edit-btn-${escapeHtml(mod.id)}" onclick="openEdit('${escapeHtml(mod.id)}')">✏️ Edit</button>
          <button type="button" class="btn btn--sm btn--danger" id="delete-btn-${escapeHtml(mod.id)}" onclick="openDeleteModal('${escapeHtml(mod.id)}')">🗑 Delete</button>
        </div>
      </td>
    </tr>
  `).join('');

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
  document.getElementById('manage-sort').addEventListener('change', e => {
    manageSort = e.target.value;
    managePage = 1;
    renderManageTable();
  });
}

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
    const targetLink = r.target_type === 'mod'
      ? `<a href="mod.html?id=${encodeURIComponent(r.target_id)}" target="_blank" rel="noopener">${escapeHtml(r.target_id)}</a>`
      : `<small>${escapeHtml(r.target_id)}</small>`;
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
      <td>
        ${r.status !== 'resolved' ? `<button type="button" class="btn btn--sm" onclick="resolveReport('${escapeHtml(r.id)}')">Resolve</button>` : ''}
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
          <img src="${escapeHtml(item.preview)}" alt="Mod image ${idx + 1}" class="image-card__thumb" onerror="this.src='https://placehold.co/600x400?text=Broken+Image'" />
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
  const toAdd = files.slice(0, remainingSlots);
  if (files.length > remainingSlots) {
    showToast(`⚠️ Only adding ${remainingSlots} image(s) to stay within the ${MAX_IMAGES}-image limit.`);
  }

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
  if (descEl) descEl.addEventListener('input', () => autoExpandDesc(descEl));

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

  document.getElementById('f-dl').value = mod.downloadUrl || '';

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
