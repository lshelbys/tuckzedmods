/**
 * tuckzed mods — Shared Data Store & Utilities
 * Uses localStorage for persistence across index.html and admin.html
 */

'use strict';

// ── Constants ────────────────────────────────────────────────
const STORAGE_KEY = 'tuckzed_mods_v2';
try {
  localStorage.removeItem('tuckzed_mods_v1');
  localStorage.removeItem('tuckzed_mods');
} catch (_) {}

const GAMES = {
  ac:     { id: 'ac',     name: 'Assetto Corsa',  icon: '🏎️', desc: 'Realistic simulation racing with thousands of car & track mods.' },
  beamng: { id: 'beamng', name: 'BeamNG.drive',   icon: '🚗', desc: 'Soft-body physics sandbox with an enormous modding community.' },
};

const CATEGORIES = ['Cars', 'Tracks', 'Maps', 'Physics'];

// ── Seed Data ────────────────────────────────────────────────
const SEED_MODS = [];

// ── Emoji placeholders by category ──────────────────────────
const CATEGORY_ICONS = {
  Cars:    '🚗',
  Tracks:  '🏁',
  Maps:    '🗺️',
  Physics: '⚙️',
};

// ── Store ────────────────────────────────────────────────────
const Store = {
  _cache: null,

  /** Helper to get the Supabase client */
  getSb() {
    return window.TZ_SUPABASE ? window.TZ_SUPABASE.getClient() : null;
  },

  /** Map database row (snake_case) to client mod object (camelCase) */
  rowToMod(row) {
    let images = [];
    if (Array.isArray(row.images)) {
      images = row.images;
    } else if (typeof row.images === 'string') {
      try { images = JSON.parse(row.images); } catch (_) {}
    }
    if (images.length === 0 && row.cover_image) {
      images = [row.cover_image];
    }
    return {
      id: row.id,
      title: row.title,
      description: row.description || '',
      version: row.version || '1.0.0',
      game: row.game,
      category: row.category,
      downloadUrl: row.download_url || '',
      coverImage: row.cover_image || (images[0] || ''),
      images: images,
      createdAt: row.created_at ? row.created_at.slice(0, 10) : today(),
      createdBy: row.created_by || 'admin'
    };
  },

  /** Map client mod object to database row */
  modToRow(mod, includeImages = true) {
    const images = Array.isArray(mod.images) && mod.images.length > 0
      ? mod.images
      : (mod.coverImage ? [mod.coverImage] : []);

    const row = {
      id: mod.id,
      title: mod.title,
      description: mod.description || '',
      version: mod.version || '1.0.0',
      game: mod.game,
      category: mod.category,
      download_url: mod.downloadUrl || '',
      cover_image: mod.coverImage || (images[0] || ''),
      created_at: mod.createdAt ? new Date(mod.createdAt).toISOString() : new Date().toISOString(),
      created_by: mod.createdBy || 'admin'
    };
    if (includeImages) {
      row.images = images;
    }
    return row;
  },

  /** Load mods synchronously from localStorage cache */
  load() {
    if (this._cache) return this._cache;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        this._cache = Array.isArray(parsed) ? parsed : [];
        return this._cache;
      }
    } catch (_) {}
    this._cache = [];
    return [];
  },

  /** Persist mods array to localStorage */
  save(mods) {
    this._cache = mods;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(mods));
    } catch (_) {}
  },

  /** Extract bucket path from full public URL */
  extractStorageFilename(url) {
    if (!url || typeof url !== 'string') return null;
    const match = url.match(/\/mod-covers\/([^?#]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  },

  /** Delete image files from Supabase Storage */
  async deleteStorageFiles(fileUrls) {
    const sb = this.getSb();
    if (!sb || !fileUrls || !fileUrls.length) return;

    const files = fileUrls
      .map(u => this.extractStorageFilename(u))
      .filter(Boolean);

    if (files.length > 0) {
      try {
        const { error } = await sb.storage.from('mod-covers').remove(files);
        if (error) console.warn('Supabase storage remove error:', error);
      } catch (err) {
        console.warn('Supabase storage remove exception:', err);
      }
    }
  },

  /** Fetch fresh mods from Supabase, updates local cache, and returns mods */
  async fetchFromRemote() {
    const sb = this.getSb();
    if (!sb) return this.getAll();
    try {
      const { data, error } = await sb.from('mods').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      const mods = (data || []).map(this.rowToMod);
      this.save(mods);
      return mods;
    } catch (err) {
      console.warn('Supabase fetch error, using local cache:', err);
      return this.getAll();
    }
  },

  /** Synchronous getter (returns cached data immediately) */
  getAll() {
    return this.load();
  },

  /** Get mod by ID */
  getById(id) {
    return this.getAll().find(m => m.id === id) || null;
  },

  /** Add a new mod (persists to Supabase and cache) */
  async add(mod) {
    const mods = this.getAll();
    mods.unshift(mod);
    this.save(mods);

    const sb = this.getSb();
    if (sb) {
      try {
        const row = this.modToRow(mod, true);
        const { error } = await sb.from('mods').insert([row]);
        if (error) {
          if (error.code === '42703' || error.code === 'PGRST204' || (error.message && error.message.includes('images'))) {
            const fallbackRow = this.modToRow(mod, false);
            await sb.from('mods').insert([fallbackRow]);
          } else {
            console.error('Supabase insert error:', error);
          }
        }
      } catch (err) {
        console.error('Supabase add exception:', err);
      }
    }
    return mod;
  },

  /** Update a mod (persists to Supabase and cache) */
  async update(id, data) {
    const mods = this.getAll();
    const idx = mods.findIndex(m => m.id === id);
    if (idx === -1) return null;

    const oldMod = mods[idx];
    mods[idx] = { ...mods[idx], ...data };
    this.save(mods);

    // Delete any removed images from Supabase Storage so no orphaned files remain
    const oldImages = [oldMod.coverImage, ...(oldMod.images || [])].filter(Boolean);
    const newImages = new Set([mods[idx].coverImage, ...(mods[idx].images || [])].filter(Boolean));
    const removedImages = oldImages.filter(img => !newImages.has(img));
    if (removedImages.length > 0) {
      this.deleteStorageFiles(removedImages);
    }

    const sb = this.getSb();
    if (sb) {
      try {
        const row = this.modToRow(mods[idx], true);
        const { error } = await sb.from('mods').update(row).eq('id', id);
        if (error) {
          if (error.code === '42703' || error.code === 'PGRST204' || (error.message && error.message.includes('images'))) {
            const fallbackRow = this.modToRow(mods[idx], false);
            await sb.from('mods').update(fallbackRow).eq('id', id);
          } else {
            console.error('Supabase update error:', error);
          }
        }
      } catch (err) {
        console.error('Supabase update exception:', err);
      }
    }
    return mods[idx];
  },

  /** Delete a mod (persists to Supabase and cache, and cleans all images from Storage) */
  async delete(id) {
    const mod = this.getById(id);
    if (mod) {
      // 1. Delete all images belonging to this mod from Supabase Storage
      const imagesToDelete = [mod.coverImage, ...(mod.images || [])].filter(Boolean);
      await this.deleteStorageFiles(imagesToDelete);
    }

    // 2. Remove from local cache
    const mods = this.getAll().filter(m => m.id !== id);
    this.save(mods);

    // 3. Delete from database
    const sb = this.getSb();
    if (sb) {
      try {
        const { error } = await sb.from('mods').delete().eq('id', id);
        if (error) console.error('Supabase delete error:', error);
      } catch (err) {
        console.error('Supabase delete exception:', err);
      }
    }
  },

  /** Upload image file to Supabase Storage (max 10MB) */
  async uploadImage(file) {
    const sb = this.getSb();
    if (!sb) throw new Error('Supabase is not configured.');

    const ext = (file.name.split('.').pop() || 'png').toLowerCase();
    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_').slice(0, 30);
    const filename = 'img-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7) + '-' + safeName;

    const { data, error } = await sb.storage.from('mod-covers').upload(filename, file, {
      cacheControl: '3600',
      upsert: false
    });
    if (error) throw error;

    const { data: pubData } = sb.storage.from('mod-covers').getPublicUrl(filename);
    return pubData.publicUrl;
  },

  /** Alias for backwards compatibility */
  async uploadCover(file) {
    return this.uploadImage(file);
  },

  /** Count mods per game */
  countByGame() {
    return this.getAll().reduce((acc, m) => {
      acc[m.game] = (acc[m.game] || 0) + 1;
      return acc;
    }, {});
  },
};

// ── Utilities ────────────────────────────────────────────────
function generateId() {
  return 'mod-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Toast ────────────────────────────────────────────────────
function showToast(message, duration = 3000) {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  container.appendChild(toast);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => { toast.classList.add('show'); });
  });
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ── Export globals ───────────────────────────────────────────
window.TZ = { Store, GAMES, CATEGORIES, CATEGORY_ICONS, generateId, today, escapeHtml, showToast };
