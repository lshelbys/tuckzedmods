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
      tags: normalizeTags(row.tags),
      downloadUrl: row.download_url || '',
      downloads: Number(row.downloads) || 0,
      likes: Number(row.likes) || 0,
      coverImage: row.cover_image || (images[0] || ''),
      images: images,
      createdAt: row.created_at ? String(row.created_at).slice(0, 10) : today(),
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
      tags: normalizeTags(mod.tags),
      download_url: mod.downloadUrl || '',
      downloads: Number(mod.downloads) || 0,
      likes: Number(mod.likes) || 0,
      cover_image: mod.coverImage || (images[0] || ''),
      created_at: toIsoDate(mod.createdAt),
      created_by: mod.createdBy || 'admin'
    };
    if (includeImages) {
      row.images = images;
    }
    return row;
  },

  /** Write a mod row, retrying without optional columns if the schema is older */
  async persistRow(mode, mod) {
    const sb = this.getSb();
    if (!sb) return { ok: true, localOnly: true };

    const payloads = [
      this.modToRow(mod, true),
      this.modToRow(mod, false)
    ];
    const slim = this.modToRow(mod, false);
    delete slim.tags;
    delete slim.likes;
    delete slim.downloads;
    payloads.push(slim);

    let lastError = null;
    try {
      for (const row of payloads) {
        let result;
        if (mode === 'insert') {
          result = await sb.from('mods').insert([row]);
        } else {
          const { id, ...rest } = row;
          result = await sb.from('mods').update(rest).eq('id', mod.id);
        }
        if (!result.error) return { ok: true };
        lastError = result.error;
        const msg = ((result.error.message || '') + ' ' + (result.error.code || '')).toLowerCase();
        const schemaMiss = result.error.code === '42703' || result.error.code === 'PGRST204'
          || msg.includes('images') || msg.includes('likes') || msg.includes('tags') || msg.includes('downloads');
        if (!schemaMiss) break;
      }
    } catch (err) {
      return { ok: false, error: err };
    }
    return { ok: false, error: lastError };
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
    const result = await this.persistRow('insert', mod);
    if (!result.ok) {
      console.error('Supabase insert error:', result.error);
      throw result.error || new Error('Failed to publish mod.');
    }
    const mods = this.getAll().filter(m => m.id !== mod.id);
    mods.unshift(mod);
    this.save(mods);
    return mod;
  },

  /** Update a mod (persists to Supabase and cache) */
  async update(id, data) {
    const mods = this.getAll();
    const idx = mods.findIndex(m => m.id === id);
    if (idx === -1) return null;

    const oldMod = mods[idx];
    const next = { ...oldMod, ...data };

    const result = await this.persistRow('update', next);
    if (!result.ok) {
      console.error('Supabase update error:', result.error);
      throw result.error || new Error('Failed to update mod.');
    }

    mods[idx] = next;
    this.save(mods);

    const oldImages = [oldMod.coverImage, ...(oldMod.images || [])].filter(Boolean);
    const newImages = new Set([next.coverImage, ...(next.images || [])].filter(Boolean));
    const removedImages = oldImages.filter(img => !newImages.has(img));
    if (removedImages.length > 0) {
      this.deleteStorageFiles(removedImages);
    }
    return next;
  },

  /** Delete a mod (persists to Supabase and cache, and cleans all images from Storage) */
  async delete(id) {
    const mod = this.getById(id);
    const sb = this.getSb();
    if (sb) {
      try {
        const { error } = await sb.from('mods').delete().eq('id', id);
        if (error) {
          console.error('Supabase delete error:', error);
          throw error;
        }
      } catch (err) {
        console.error('Supabase delete exception:', err);
        throw err;
      }
    }

    if (mod) {
      const imagesToDelete = [mod.coverImage, ...(mod.images || [])].filter(Boolean);
      await this.deleteStorageFiles(imagesToDelete);
    }

    this.save(this.getAll().filter(m => m.id !== id));
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

  /** Upload Avatar to Supabase */
  async uploadAvatar(file) {
    const sb = this.getSb();
    if (!sb) throw new Error('Supabase is not configured.');

    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_').slice(0, 30);
    const filename = 'avatar-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7) + '-' + safeName;

    const { data, error } = await sb.storage.from('avatars').upload(filename, file, {
      cacheControl: '3600',
      upsert: false
    });
    if (error) throw error;

    const { data: pubData } = sb.storage.from('avatars').getPublicUrl(filename);
    return pubData.publicUrl;
  },

  /** Get Profile */
  async getProfile(email) {
    const sb = this.getSb();
    if (!sb) return null;
    const { data, error } = await sb.from('profiles').select('*').eq('email', email).single();
    if (error) return null;
    return data;
  },

  /** Update Profile */
  async updateProfile(profileData) {
    const sb = this.getSb();
    if (!sb) return null;
    profileData.updated_at = new Date().toISOString();
    const { error } = await sb.from('profiles').upsert([profileData]);
    if (error) {
      console.error('Update profile error:', error);
      throw error;
    }
    return true;
  },

  /** Increment downloads counter */
  async incrementDownloads(id) {
    const mod = this.getById(id);
    if (mod) {
      mod.downloads = (mod.downloads || 0) + 1;
      this.save(this.getAll());
    }
    const sb = this.getSb();
    if (!sb) return;
    try {
      const { data } = await sb.from('mods').select('downloads').eq('id', id).maybeSingle();
      const next = ((data && Number(data.downloads)) || (mod ? mod.downloads - 1 : 0)) + 1;
      await sb.from('mods').update({ downloads: next }).eq('id', id);
      if (mod && mod.downloads !== next) {
        mod.downloads = next;
        this.save(this.getAll());
      }
    } catch (e) { console.error('Increment downloads error:', e); }
  },

  /** Mod Likes */
  async getModLikeStatus(modId) {
    const sb = this.getSb();
    const user = window.TZ_AUTH ? window.TZ_AUTH.currentUser() : null;
    if (!sb || !user) return false;
    
    const { data } = await sb.from('mod_likes').select('mod_id').eq('mod_id', modId).eq('user_email', user.email).maybeSingle();
    return !!data;
  },

  async syncLikeCount(modId) {
    const sb = this.getSb();
    if (!sb) return 0;
    const { count, error } = await sb.from('mod_likes').select('*', { count: 'exact', head: true }).eq('mod_id', modId);
    if (error) throw error;
    const likes = count || 0;
    await sb.from('mods').update({ likes }).eq('id', modId);
    const mod = this.getById(modId);
    if (mod) {
      mod.likes = likes;
      this.save(this.getAll());
    }
    return likes;
  },

  async toggleLike(modId, isLiking) {
    const sb = this.getSb();
    const user = window.TZ_AUTH ? window.TZ_AUTH.currentUser() : null;
    if (!sb || !user) return { ok: false, likes: 0 };

    let error = null;
    if (isLiking) {
      ({ error } = await sb.from('mod_likes').insert([{ mod_id: modId, user_email: user.email }]));
      if (error && (error.code === '23505' || (error.message && error.message.toLowerCase().includes('duplicate')))) {
        error = null; // already liked
      }
    } else {
      ({ error } = await sb.from('mod_likes').delete().eq('mod_id', modId).eq('user_email', user.email));
    }
    if (error) {
      console.error('Toggle like error:', error);
      return { ok: false, likes: (this.getById(modId) || {}).likes || 0 };
    }
    try {
      const likes = await this.syncLikeCount(modId);
      return { ok: true, likes };
    } catch (err) {
      console.error('Sync like count error:', err);
      const mod = this.getById(modId);
      const fallback = Math.max(0, (mod && mod.likes || 0) + (isLiking ? 1 : -1));
      if (mod) {
        mod.likes = fallback;
        this.save(this.getAll());
      }
      return { ok: true, likes: fallback };
    }
  },

  /** Reporting System */
  async submitReport(targetId, targetType, reason) {
    const sb = this.getSb();
    const user = window.TZ_AUTH ? window.TZ_AUTH.currentUser() : null;
    if (!sb) return false;
    
    const { error } = await sb.from('reports').insert([{
      target_id: targetId,
      target_type: targetType,
      reported_by: user ? user.email : 'anonymous',
      reason: reason
    }]);
    if (error) { console.error('Report error:', error); return false; }
    return true;
  },

  async getReports() {
    const sb = this.getSb();
    if (!sb) return [];
    const { data, error } = await sb.from('reports').select('*').order('created_at', { ascending: false });
    if (error) { console.error('Get reports error:', error); return []; }
    return data || [];
  },

  async resolveReport(reportId) {
    const sb = this.getSb();
    if (!sb) return false;
    const { error } = await sb.from('reports').update({ status: 'resolved' }).eq('id', reportId);
    return !error;
  },

  /** Add a comment */
  async addComment(modId, username, text, parentId = null) {
    const sb = this.getSb();
    if (!sb) return null;
    const user = window.TZ_AUTH ? window.TZ_AUTH.currentUser() : null;
    const userEmail = user ? user.email : 'anonymous';
    const { data, error } = await sb.from('mod_comments').insert([{
      mod_id: modId,
      user_email: userEmail,
      username: username,
      comment: text,
      parent_id: parentId
    }]).select().single();
    if (error) { console.error('Add comment error:', error); return null; }
    return data;
  },

  /** Edit a comment */
  async editComment(commentId, newText) {
    const sb = this.getSb();
    if (!sb) return false;
    const { error } = await sb.from('mod_comments').update({ comment: newText }).eq('id', commentId);
    if (error) { console.error('Edit comment error:', error); return false; }
    return true;
  },

  /** Delete a comment */
  async deleteComment(commentId) {
    const sb = this.getSb();
    if (!sb) return false;
    const { error } = await sb.from('mod_comments').delete().eq('id', commentId);
    if (error) { console.error('Delete comment error:', error); return false; }
    return true;
  },

  /** Get comments for a mod */
  async getComments(modId) {
    const sb = this.getSb();
    if (!sb) return [];
    const { data: comments, error } = await sb.from('mod_comments').select('*').eq('mod_id', modId).order('created_at', { ascending: true });
    if (error) { console.error('Get comments error:', error); return null; }
    if (!comments || comments.length === 0) return [];

    const emails = [...new Set(comments.map(c => c.user_email).filter(Boolean))];
    let profiles = {};
    if (emails.length > 0) {
      const { data: profs } = await sb.from('profiles').select('*').in('email', emails);
      if (profs) {
        profs.forEach(p => { profiles[p.email] = p; });
      }
    }

    return comments.map(c => {
      const p = profiles[c.user_email];
      return {
        ...c,
        display_name: p?.display_name || c.username,
        avatar_url: p?.avatar_url || null
      };
    });
  }
};

// ── Utilities ────────────────────────────────────────────────
function generateId() {
  return 'mod-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function toIsoDate(value) {
  if (!value) return new Date().toISOString();
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value) + 'T00:00:00.000Z';
  const d = new Date(value);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function normalizeTags(tags) {
  if (!tags) return '';
  if (Array.isArray(tags)) return tags.map(t => String(t).trim()).filter(Boolean).join(', ');
  return String(tags);
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
window.TZ = { Store, GAMES, CATEGORIES, CATEGORY_ICONS, generateId, today, escapeHtml, showToast, normalizeTags };
