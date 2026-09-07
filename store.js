/**
 * tuckzed mods — Shared Data Store & Utilities
 * Supabase is the source of truth; localStorage is a read cache so pages
 * can render instantly while fresh data is fetched.
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
    let changelog = [];
    if (Array.isArray(row.changelog)) {
      changelog = row.changelog;
    } else if (typeof row.changelog === 'string') {
      try { changelog = JSON.parse(row.changelog); } catch (_) { changelog = []; }
    }
    const createdAtIso = toIsoDate(row.created_at);
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
      featured: !!row.featured,
      compatibility: row.compatibility || '',
      changelog: Array.isArray(changelog) ? changelog : [],
      deletedAt: row.deleted_at || null,
      createdAt: createdAtIso.slice(0, 10),
      createdAtIso: createdAtIso,
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
      featured: !!mod.featured,
      compatibility: mod.compatibility || '',
      changelog: Array.isArray(mod.changelog) ? mod.changelog : [],
      deleted_at: mod.deletedAt || null,
      created_at: toIsoDate(mod.createdAtIso || mod.createdAt),
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

    const full = this.modToRow(mod, true);
    const optionalKeys = ['images', 'featured', 'compatibility', 'changelog', 'deleted_at', 'tags', 'likes', 'downloads'];
    const payloads = [full];
    // Progressively strip optional columns for older schemas
    let cur = { ...full };
    for (const key of optionalKeys) {
      if (!(key in cur)) continue;
      cur = { ...cur };
      delete cur[key];
      payloads.push(cur);
    }

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
          || optionalKeys.some(k => msg.includes(k.replace(/_/g, ' ')) || msg.includes(k));
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

  /** Error from the most recent fetchFromRemote(), or null if it succeeded */
  lastFetchError: null,

  /** True once fetchFromRemote() has completed at least once this page load */
  hasFetched: false,

  /** Fetch fresh mods from Supabase (paginated), updates local cache, and returns mods */
  async fetchFromRemote(opts = {}) {
    const sb = this.getSb();
    if (!sb) { this.hasFetched = true; return this.getAll(); }
    const includeDeleted = !!opts.includeDeleted;
    const pageSize = 500;
    try {
      const allRows = [];
      let from = 0;
      let schemaSupportsDeleted = true;
      for (;;) {
        let query = sb.from('mods').select('*').order('created_at', { ascending: false }).range(from, from + pageSize - 1);
        if (!includeDeleted && schemaSupportsDeleted) {
          query = query.is('deleted_at', null);
        }
        let { data, error } = await query;
        if (error && schemaSupportsDeleted && (error.code === '42703' || error.code === 'PGRST204' || /deleted_at/i.test(error.message || ''))) {
          schemaSupportsDeleted = false;
          ({ data, error } = await sb.from('mods').select('*').order('created_at', { ascending: false }).range(from, from + pageSize - 1));
        }
        if (error) throw error;
        const batch = data || [];
        allRows.push(...batch);
        if (batch.length < pageSize) break;
        from += pageSize;
      }
      let mods = allRows.map(r => this.rowToMod(r));
      if (!includeDeleted) mods = mods.filter(m => !m.deletedAt);
      this.save(mods);
      this.lastFetchError = null;
      return mods;
    } catch (err) {
      console.warn('Supabase fetch error, using local cache:', err);
      this.lastFetchError = err;
      return this.getAll();
    } finally {
      this.hasFetched = true;
    }
  },

  /** Synchronous getter (returns cached active mods) */
  getAll() {
    return this.load().filter(m => !m.deletedAt);
  },

  /** All cached mods including soft-deleted (admin trash) */
  getAllIncludingDeleted() {
    return this.load();
  },

  /** Get mod by ID */
  getById(id) {
    return this.getAll().find(m => m.id === id) || null;
  },

  /** Newest-first ordering, using the full timestamp when available */
  sortNewest(mods) {
    return [...mods].sort((a, b) =>
      String(b.createdAtIso || b.createdAt || '').localeCompare(String(a.createdAtIso || a.createdAt || ''))
    );
  },

  /** Add a new mod (persists to Supabase and cache) */
  async add(mod) {
    if (!mod.createdAtIso) mod.createdAtIso = new Date().toISOString();
    if (!mod.createdAt) mod.createdAt = mod.createdAtIso.slice(0, 10);
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

  /** Soft-delete a mod (moves to trash). Falls back to hard delete if column missing. */
  async softDelete(id) {
    const mod = this.getById(id) || this.getAllIncludingDeleted().find(m => m.id === id);
    if (!mod) return false;
    const deletedAt = new Date().toISOString();
    const sb = this.getSb();
    if (sb) {
      const { error } = await sb.from('mods').update({ deleted_at: deletedAt }).eq('id', id);
      if (error && (error.code === '42703' || error.code === 'PGRST204' || /deleted_at/i.test(error.message || ''))) {
        return this.hardDelete(id);
      }
      if (error) { console.error('softDelete error:', error); throw error; }
    }
    const all = this.load().map(m => m.id === id ? { ...m, deletedAt } : m);
    this.save(all);
    return true;
  },

  /** Restore a soft-deleted mod from trash */
  async restoreMod(id) {
    const mod = this.getAllIncludingDeleted().find(m => m.id === id);
    if (!mod) return false;
    const sb = this.getSb();
    if (sb) {
      const { error } = await sb.from('mods').update({ deleted_at: null }).eq('id', id);
      if (error) { console.error('restoreMod error:', error); throw error; }
    }
    const all = this.load().map(m => m.id === id ? { ...m, deletedAt: null } : m);
    this.save(all);
    return true;
  },

  /** Permanently delete a mod (and related rows + images) */
  async hardDelete(id) {
    const mod = this.getById(id) || this.getAllIncludingDeleted().find(m => m.id === id);
    const sb = this.getSb();
    if (sb) {
      try {
        const { data: commentRows } = await sb.from('mod_comments').select('id').eq('mod_id', id);
        const commentIds = (commentRows || []).map(r => String(r.id));

        await Promise.all([
          sb.from('mod_likes').delete().eq('mod_id', id),
          sb.from('mod_wishlists').delete().eq('mod_id', id),
          sb.from('mod_comments').delete().eq('mod_id', id),
          sb.from('collection_mods').delete().eq('mod_id', id),
          sb.from('reports').delete().eq('target_type', 'mod').eq('target_id', id),
          sb.from('reports').delete().eq('context_id', id)
        ]);
        if (commentIds.length) {
          await sb.from('reports').delete().eq('target_type', 'comment').in('target_id', commentIds);
        }

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

    this.save(this.load().filter(m => m.id !== id));
  },

  /** Alias: soft-delete by default (trash) */
  async delete(id) {
    return this.softDelete(id);
  },

  /** Fetch soft-deleted mods for admin trash */
  async fetchTrash() {
    const sb = this.getSb();
    if (!sb) return this.load().filter(m => m.deletedAt);
    try {
      const { data, error } = await sb.from('mods').select('*').not('deleted_at', 'is', null).order('deleted_at', { ascending: false });
      if (error) throw error;
      const trash = (data || []).map(r => this.rowToMod(r));
      const byId = Object.fromEntries(this.load().map(m => [m.id, m]));
      trash.forEach(m => { byId[m.id] = m; });
      this.save(Object.values(byId));
      return trash;
    } catch (err) {
      console.warn('fetchTrash error:', err);
      return this.load().filter(m => m.deletedAt);
    }
  },

  /** Upload image file to Supabase Storage (max 10MB) */
  async uploadImage(file) {
    const sb = this.getSb();
    if (!sb) throw new Error('Supabase is not configured.');
    if (!file) throw new Error('No file provided.');
    if (file.size > 10 * 1024 * 1024) throw new Error('Image must be 10MB or smaller.');

    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_').slice(0, 30);
    const filename = 'img-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7) + '-' + safeName;

    const { error } = await sb.storage.from('mod-covers').upload(filename, file, {
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

  extractAvatarFilename(url) {
    if (!url || typeof url !== 'string') return null;
    const match = url.match(/\/avatars\/([^?#]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  },

  async deleteAvatarFiles(fileUrls) {
    const sb = this.getSb();
    if (!sb || !fileUrls || !fileUrls.length) return;
    const files = fileUrls.map(u => this.extractAvatarFilename(u)).filter(Boolean);
    if (!files.length) return;
    try {
      const { error } = await sb.storage.from('avatars').remove(files);
      if (error) console.warn('Avatar storage remove error:', error);
    } catch (err) {
      console.warn('Avatar storage remove exception:', err);
    }
  },

  /** Upload Avatar to Supabase (optionally removes the previous avatar file) */
  async uploadAvatar(file, previousUrl) {
    const sb = this.getSb();
    if (!sb) throw new Error('Supabase is not configured.');
    if (!file) throw new Error('No file provided.');
    if (file.size > 5 * 1024 * 1024) throw new Error('Avatar must be 5MB or smaller.');

    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_').slice(0, 30);
    const filename = 'avatar-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7) + '-' + safeName;

    const { error } = await sb.storage.from('avatars').upload(filename, file, {
      cacheControl: '3600',
      upsert: false
    });
    if (error) throw error;

    const { data: pubData } = sb.storage.from('avatars').getPublicUrl(filename);
    if (previousUrl) await this.deleteAvatarFiles([previousUrl]);
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

  /** Migrate profile + likes when a user changes email */
  async migrateUserEmail(oldEmail, newEmail) {
    const sb = this.getSb();
    if (!sb || !oldEmail || !newEmail || oldEmail === newEmail) return false;
    try {
      const profile = await this.getProfile(oldEmail);
      if (profile) {
        await sb.from('profiles').upsert([{
          email: newEmail,
          display_name: profile.display_name || '',
          avatar_url: profile.avatar_url || '',
          updated_at: new Date().toISOString()
        }]);
        await sb.from('profiles').delete().eq('email', oldEmail);
      }
      // Re-key likes (ignore duplicates on new email)
      const { data: likes } = await sb.from('mod_likes').select('mod_id').eq('user_email', oldEmail);
      if (likes && likes.length) {
        await sb.from('mod_likes').upsert(
          likes.map(l => ({ mod_id: l.mod_id, user_email: newEmail })),
          { onConflict: 'mod_id,user_email', ignoreDuplicates: true }
        );
        await sb.from('mod_likes').delete().eq('user_email', oldEmail);
      }
      const { data: wishes } = await sb.from('mod_wishlists').select('mod_id').eq('user_email', oldEmail);
      if (wishes && wishes.length) {
        await sb.from('mod_wishlists').upsert(
          wishes.map(w => ({ mod_id: w.mod_id, user_email: newEmail })),
          { onConflict: 'mod_id,user_email', ignoreDuplicates: true }
        );
        await sb.from('mod_wishlists').delete().eq('user_email', oldEmail);
      }
      await sb.from('mod_comments').update({ user_email: newEmail }).eq('user_email', oldEmail);
      await sb.from('comment_reactions').update({ user_email: newEmail }).eq('user_email', oldEmail);
      await sb.from('notifications').update({ user_email: newEmail }).eq('user_email', oldEmail);
      return true;
    } catch (err) {
      console.error('migrateUserEmail error:', err);
      return false;
    }
  },

  /** Wipe likes/profile/avatar for account deletion (comments stay anonymized) */
  async deleteAccountData(email) {
    const sb = this.getSb();
    if (!sb || !email) return false;
    try {
      const profile = await this.getProfile(email);
      await sb.from('mod_likes').delete().eq('user_email', email);
      await sb.from('mod_wishlists').delete().eq('user_email', email);
      await sb.from('comment_reactions').delete().eq('user_email', email);
      await sb.from('notifications').delete().eq('user_email', email);
      await sb.from('profiles').delete().eq('email', email);
      if (profile && profile.avatar_url) await this.deleteAvatarFiles([profile.avatar_url]);
      // Soft-anonymize comments rather than deleting community history
      await sb.from('mod_comments').update({
        user_email: 'deleted',
        username: 'Deleted user'
      }).eq('user_email', email);
      return true;
    } catch (err) {
      console.error('deleteAccountData error:', err);
      return false;
    }
  },

  /** Increment downloads counter (atomic RPC when available) */
  async incrementDownloads(id) {
    const mod = this.getById(id);
    if (mod) {
      mod.downloads = (mod.downloads || 0) + 1;
      this.save(this.getAll());
    }
    const sb = this.getSb();
    if (!sb) return mod ? mod.downloads : 0;
    try {
      const { data, error } = await sb.rpc('increment_mod_downloads', { p_id: id });
      if (!error && data != null) {
        const next = Number(data) || 0;
        if (mod) {
          mod.downloads = next;
          this.save(this.getAll());
        }
        return next;
      }
      // Fallback for DBs that have not run the latest SQL yet
      const { data: row } = await sb.from('mods').select('downloads').eq('id', id).maybeSingle();
      const next = ((row && Number(row.downloads)) || (mod ? Math.max(0, mod.downloads - 1) : 0)) + 1;
      await sb.from('mods').update({ downloads: next }).eq('id', id);
      if (mod) {
        mod.downloads = next;
        this.save(this.getAll());
      }
      return next;
    } catch (e) {
      console.error('Increment downloads error:', e);
      return mod ? mod.downloads : 0;
    }
  },

  /** Mods liked by a user email */
  async getLikedMods(email) {
    const sb = this.getSb();
    if (!sb || !email) return [];
    try {
      const { data, error } = await sb
        .from('mod_likes')
        .select('mod_id, created_at')
        .eq('user_email', email)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const ids = (data || []).map(r => r.mod_id);
      if (!ids.length) return [];
      const cached = this.getAll();
      const byId = Object.fromEntries(cached.map(m => [m.id, m]));
      const missing = ids.filter(id => !byId[id]);
      if (missing.length) {
        const { data: rows } = await sb.from('mods').select('*').in('id', missing);
        (rows || []).forEach(row => { byId[row.id] = this.rowToMod(row); });
      }
      return ids.map(id => byId[id]).filter(Boolean);
    } catch (err) {
      console.error('getLikedMods error:', err);
      return [];
    }
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
    // Prefer reading the trigger-maintained column; still write as a fallback for older DBs
    const { data: row } = await sb.from('mods').select('likes').eq('id', modId).maybeSingle();
    const remoteLikes = row && Number.isFinite(Number(row.likes)) ? Number(row.likes) : likes;
    if (remoteLikes !== likes) {
      await sb.from('mods').update({ likes }).eq('id', modId);
    }
    const finalLikes = likes;
    const mod = this.getById(modId);
    if (mod) {
      mod.likes = finalLikes;
      this.save(this.getAll());
    }
    return finalLikes;
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
      // Short delay so DB trigger can update mods.likes, then sync
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

  /**
   * Submit a report. Dedupes pending reports from the same user/target.
   * @param {string} targetId
   * @param {'mod'|'comment'} targetType
   * @param {string} reason
   * @param {string} [contextId] mod id for comment reports (admin deep-links)
   */
  async submitReport(targetId, targetType, reason, contextId = '') {
    const sb = this.getSb();
    const user = window.TZ_AUTH ? window.TZ_AUTH.currentUser() : null;
    if (!sb) return false;
    const reportedBy = user ? user.email : 'anonymous';

    try {
      const { data: existingRows } = await sb.from('reports')
        .select('id')
        .eq('target_type', targetType)
        .eq('target_id', String(targetId))
        .eq('status', 'pending')
        .eq('reported_by', reportedBy)
        .limit(1);
      if (existingRows && existingRows.length) return true; // already reported — treat as success

      const row = {
        target_id: String(targetId),
        target_type: targetType,
        reported_by: reportedBy,
        reason: reason || '',
        context_id: contextId || (targetType === 'mod' ? String(targetId) : '')
      };
      let { error } = await sb.from('reports').insert([row]);
      if (error && (error.code === '42703' || error.code === 'PGRST204' || /context_id/i.test(error.message || ''))) {
        delete row.context_id;
        ({ error } = await sb.from('reports').insert([row]));
      }
      if (error) { console.error('Report error:', error); return false; }
      return true;
    } catch (err) {
      console.error('Report exception:', err);
      return false;
    }
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

  /** Delete a reported comment (and its replies) then resolve the report */
  async deleteCommentAndResolve(commentId, reportId) {
    const deleted = await this.deleteComment(commentId);
    if (!deleted) return false;
    if (reportId) await this.resolveReport(reportId);
    return true;
  },

  /** Add a comment (and notify parent author on replies) */
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

    if (parentId && data) {
      try {
        const { data: parent } = await sb.from('mod_comments').select('user_email, id').eq('id', parentId).maybeSingle();
        if (parent && parent.user_email && parent.user_email !== 'anonymous' && parent.user_email !== userEmail) {
          const mod = this.getById(modId);
          const title = mod ? mod.title : 'a mod';
          await this.createNotification({
            userEmail: parent.user_email,
            type: 'reply',
            message: `${username || 'Someone'} replied to your comment on ${title}`,
            link: `mod.html?id=${encodeURIComponent(modId)}#comment-${data.id}`,
            contextId: String(data.id),
            fromUser: userEmail
          });
        }
      } catch (err) {
        console.warn('Reply notification skipped:', err);
      }
    }
    return data;
  },

  /** Edit a comment (marks it as edited when the column exists) */
  async editComment(commentId, newText) {
    const sb = this.getSb();
    if (!sb) return false;
    let { error } = await sb.from('mod_comments')
      .update({ comment: newText, updated_at: new Date().toISOString() })
      .eq('id', commentId);
    if (error && (error.code === '42703' || error.code === 'PGRST204' || /updated_at/i.test(error.message || ''))) {
      ({ error } = await sb.from('mod_comments').update({ comment: newText }).eq('id', commentId));
    }
    if (error) { console.error('Edit comment error:', error); return false; }
    return true;
  },

  /** Delete a comment and its replies */
  async deleteComment(commentId) {
    const sb = this.getSb();
    if (!sb) return false;
    // Delete replies first (works even without FK CASCADE)
    const { error: replyErr } = await sb.from('mod_comments').delete().eq('parent_id', commentId);
    if (replyErr) console.warn('Delete comment replies warning:', replyErr);
    const { error } = await sb.from('mod_comments').delete().eq('id', commentId);
    if (error) { console.error('Delete comment error:', error); return false; }
    // Clean related comment reports
    await sb.from('reports').delete().eq('target_type', 'comment').eq('target_id', String(commentId));
    return true;
  },

  /**
   * Get comments for a mod.
   * @param {string} modId
   * @param {{ limit?: number, offset?: number }} [opts]
   * @returns {Promise<Array|null|{comments:Array, total:number, hasMore:boolean}>}
   */
  async getComments(modId, opts = {}) {
    const sb = this.getSb();
    if (!sb) return [];
    const limit = Number.isFinite(opts.limit) ? opts.limit : null;
    const offset = Number(opts.offset) || 0;

    try {
      // Load all comments for the mod (replies need parents). For large threads,
      // paginate root comments and always include their replies.
      const { data: all, error } = await sb
        .from('mod_comments')
        .select('*')
        .eq('mod_id', modId)
        .order('created_at', { ascending: true });
      if (error) { console.error('Get comments error:', error); return null; }
      if (!all || all.length === 0) {
        return limit == null ? [] : { comments: [], total: 0, hasMore: false };
      }

      const emails = [...new Set(all.map(c => c.user_email).filter(Boolean))];
      let profiles = {};
      if (emails.length > 0) {
        const { data: profs } = await sb.from('profiles').select('*').in('email', emails);
        if (profs) profs.forEach(p => { profiles[p.email] = p; });
      }

      const enriched = all.map(c => {
        const p = profiles[c.user_email];
        return {
          ...c,
          display_name: p?.display_name || c.username,
          avatar_url: p?.avatar_url || null
        };
      });

      if (limit == null) return enriched;

      const roots = enriched.filter(c => !c.parent_id);
      const total = roots.length;
      const pageRoots = roots.slice(offset, offset + limit);
      const rootIds = new Set(pageRoots.map(c => c.id));
      const page = enriched.filter(c => rootIds.has(c.id) || rootIds.has(c.parent_id));
      return {
        comments: page,
        total,
        hasMore: offset + limit < total
      };
    } catch (err) {
      console.error('Get comments exception:', err);
      return null;
    }
  },

  /** Build a sitemap.xml string for all known mods */
  buildSitemapXml(origin = 'https://tuckzed.com') {
    const base = String(origin || 'https://tuckzed.com').replace(/\/$/, '');
    const urls = [`${base}/`].concat(
      this.getAll().map(m => `${base}/mod?id=${encodeURIComponent(m.id)}`)
    );
    const body = urls.map(u => `  <url><loc>${u}</loc></url>`).join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
  },

  /** Build an RSS 2.0 feed for newest mods */
  buildRssXml(origin = 'https://tuckzed.com') {
    const base = String(origin || 'https://tuckzed.com').replace(/\/$/, '');
    const mods = this.sortNewest(this.getAll()).slice(0, 40);
    const items = mods.map(m => {
      const link = `${base}/mod.html?id=${encodeURIComponent(m.id)}`;
      const desc = escapeXml(stripMarkdown(m.description || '').slice(0, 280));
      const title = escapeXml(m.title || 'Untitled');
      const pub = new Date(m.createdAtIso || m.createdAt || Date.now()).toUTCString();
      return `    <item>\n      <title>${title}</title>\n      <link>${link}</link>\n      <guid isPermaLink="true">${link}</guid>\n      <pubDate>${pub}</pubDate>\n      <description>${desc}</description>\n    </item>`;
    }).join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0">\n  <channel>\n    <title>tuckzed mods — What's New</title>\n    <link>${base}/</link>\n    <description>Latest Assetto Corsa &amp; BeamNG.drive mods from tuckzed</description>\n    <language>en</language>\n${items}\n  </channel>\n</rss>\n`;
  },

  /** Popular tags across the catalog (by frequency) */
  getPopularTags(limit = 16) {
    const counts = {};
    this.getAll().forEach(m => {
      parseTags(m.tags).forEach(t => {
        const key = t.toLowerCase();
        if (!counts[key]) counts[key] = { tag: t, count: 0 };
        counts[key].count += 1;
      });
    });
    return Object.values(counts).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag)).slice(0, limit);
  },

  // ── Wishlists ────────────────────────────────────────────
  async getWishlistStatus(modId) {
    const sb = this.getSb();
    const user = window.TZ_AUTH ? window.TZ_AUTH.currentUser() : null;
    if (!sb || !user) return false;
    const { data } = await sb.from('mod_wishlists').select('mod_id').eq('mod_id', modId).eq('user_email', user.email).maybeSingle();
    return !!data;
  },

  async toggleWishlist(modId, isAdding) {
    const sb = this.getSb();
    const user = window.TZ_AUTH ? window.TZ_AUTH.currentUser() : null;
    if (!sb || !user) return { ok: false };
    let error = null;
    if (isAdding) {
      ({ error } = await sb.from('mod_wishlists').insert([{ mod_id: modId, user_email: user.email }]));
      if (error && (error.code === '23505' || /duplicate/i.test(error.message || ''))) error = null;
    } else {
      ({ error } = await sb.from('mod_wishlists').delete().eq('mod_id', modId).eq('user_email', user.email));
    }
    if (error) { console.error('toggleWishlist error:', error); return { ok: false }; }
    return { ok: true };
  },

  async getWishlistMods(email) {
    const sb = this.getSb();
    if (!sb || !email) return [];
    try {
      const { data, error } = await sb.from('mod_wishlists').select('mod_id, created_at').eq('user_email', email).order('created_at', { ascending: false });
      if (error) throw error;
      const ids = (data || []).map(r => r.mod_id);
      if (!ids.length) return [];
      const byId = Object.fromEntries(this.getAll().map(m => [m.id, m]));
      const missing = ids.filter(id => !byId[id]);
      if (missing.length) {
        const { data: rows } = await sb.from('mods').select('*').in('id', missing);
        (rows || []).forEach(row => { byId[row.id] = this.rowToMod(row); });
      }
      return ids.map(id => byId[id]).filter(Boolean);
    } catch (err) {
      console.error('getWishlistMods error:', err);
      return [];
    }
  },

  // ── Comment reactions ────────────────────────────────────
  async getCommentReactionCounts(commentIds) {
    const sb = this.getSb();
    if (!sb || !commentIds || !commentIds.length) return {};
    try {
      const { data, error } = await sb.from('comment_reactions').select('comment_id, user_email').in('comment_id', commentIds);
      if (error) throw error;
      const user = window.TZ_AUTH ? window.TZ_AUTH.currentUser() : null;
      const map = {};
      (data || []).forEach(r => {
        if (!map[r.comment_id]) map[r.comment_id] = { count: 0, mine: false };
        map[r.comment_id].count += 1;
        if (user && r.user_email === user.email) map[r.comment_id].mine = true;
      });
      return map;
    } catch (err) {
      console.warn('getCommentReactionCounts:', err);
      return {};
    }
  },

  async toggleCommentReaction(commentId, isAdding) {
    const sb = this.getSb();
    const user = window.TZ_AUTH ? window.TZ_AUTH.currentUser() : null;
    if (!sb || !user) return { ok: false };
    let error = null;
    if (isAdding) {
      ({ error } = await sb.from('comment_reactions').insert([{ comment_id: commentId, user_email: user.email }]));
      if (error && (error.code === '23505' || /duplicate/i.test(error.message || ''))) error = null;
    } else {
      ({ error } = await sb.from('comment_reactions').delete().eq('comment_id', commentId).eq('user_email', user.email));
    }
    if (error) { console.error('toggleCommentReaction:', error); return { ok: false }; }
    return { ok: true };
  },

  // ── Notifications ────────────────────────────────────────
  async createNotification({ userEmail, type, message, link, contextId, fromUser }) {
    const sb = this.getSb();
    if (!sb || !userEmail) return false;
    const { error } = await sb.from('notifications').insert([{
      user_email: userEmail,
      type: type || 'reply',
      message: message || '',
      link: link || '',
      context_id: contextId || '',
      from_user: fromUser || '',
      read: false
    }]);
    if (error) { console.warn('createNotification:', error); return false; }
    return true;
  },

  async getNotifications(email, { unreadOnly = false, limit = 40 } = {}) {
    const sb = this.getSb();
    if (!sb || !email) return [];
    try {
      let q = sb.from('notifications').select('*').eq('user_email', email).order('created_at', { ascending: false }).limit(limit);
      if (unreadOnly) q = q.eq('read', false);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    } catch (err) {
      console.warn('getNotifications:', err);
      return [];
    }
  },

  async getUnreadNotificationCount(email) {
    const sb = this.getSb();
    if (!sb || !email) return 0;
    try {
      const { count, error } = await sb.from('notifications').select('*', { count: 'exact', head: true }).eq('user_email', email).eq('read', false);
      if (error) throw error;
      return count || 0;
    } catch (_) { return 0; }
  },

  async markNotificationsRead(email, ids = null) {
    const sb = this.getSb();
    if (!sb || !email) return false;
    let q = sb.from('notifications').update({ read: true }).eq('user_email', email);
    if (ids && ids.length) q = q.in('id', ids);
    const { error } = await q;
    return !error;
  },

  // ── Collections ──────────────────────────────────────────
  async listCollections() {
    const sb = this.getSb();
    if (!sb) return [];
    try {
      const { data, error } = await sb.from('collections').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    } catch (err) {
      console.warn('listCollections:', err);
      return [];
    }
  },

  async getCollection(id) {
    const sb = this.getSb();
    if (!sb || !id) return null;
    try {
      const { data: col, error } = await sb.from('collections').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      if (!col) return null;
      const { data: links } = await sb.from('collection_mods').select('mod_id, position').eq('collection_id', id).order('position', { ascending: true });
      const ids = (links || []).map(l => l.mod_id);
      const byId = Object.fromEntries(this.getAll().map(m => [m.id, m]));
      const missing = ids.filter(x => !byId[x]);
      if (missing.length) {
        const { data: rows } = await sb.from('mods').select('*').in('id', missing);
        (rows || []).forEach(r => { byId[r.id] = this.rowToMod(r); });
      }
      return { ...col, mods: ids.map(x => byId[x]).filter(Boolean) };
    } catch (err) {
      console.warn('getCollection:', err);
      return null;
    }
  },

  async saveCollection(col, modIds = []) {
    const sb = this.getSb();
    if (!sb) return false;
    const row = {
      id: col.id,
      title: col.title,
      description: col.description || '',
      cover_image: col.cover_image || col.coverImage || '',
      created_by: col.created_by || col.createdBy || 'admin',
      updated_at: new Date().toISOString()
    };
    if (!col.created_at && !col.createdAt) row.created_at = new Date().toISOString();
    const { error } = await sb.from('collections').upsert([row]);
    if (error) { console.error('saveCollection:', error); return false; }
    await sb.from('collection_mods').delete().eq('collection_id', col.id);
    if (modIds.length) {
      const links = modIds.map((modId, i) => ({ collection_id: col.id, mod_id: modId, position: i }));
      const { error: linkErr } = await sb.from('collection_mods').insert(links);
      if (linkErr) { console.error('saveCollection links:', linkErr); return false; }
    }
    return true;
  },

  async deleteCollection(id) {
    const sb = this.getSb();
    if (!sb) return false;
    await sb.from('collection_mods').delete().eq('collection_id', id);
    const { error } = await sb.from('collections').delete().eq('id', id);
    return !error;
  },

  // ── Community submissions ────────────────────────────────
  async submitModProposal(payload) {
    const sb = this.getSb();
    if (!sb) return { ok: false, error: 'Database unavailable' };
    const user = window.TZ_AUTH ? window.TZ_AUTH.currentUser() : null;
    const row = {
      title: payload.title,
      description: payload.description || '',
      version: payload.version || '1.0.0',
      game: payload.game,
      category: payload.category,
      tags: normalizeTags(payload.tags),
      download_url: payload.downloadUrl || '',
      compatibility: payload.compatibility || '',
      cover_image: payload.coverImage || '',
      status: 'pending',
      submitted_by: user ? user.email : 'anonymous',
      submitter_name: payload.submitterName || (user && user.displayName) || ''
    };
    const { data, error } = await sb.from('mod_submissions').insert([row]).select().single();
    if (error) { console.error('submitModProposal:', error); return { ok: false, error }; }
    return { ok: true, data };
  },

  async listSubmissions(status = 'pending') {
    const sb = this.getSb();
    if (!sb) return [];
    try {
      let q = sb.from('mod_submissions').select('*').order('created_at', { ascending: false });
      if (status && status !== 'all') q = q.eq('status', status);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    } catch (err) {
      console.warn('listSubmissions:', err);
      return [];
    }
  },

  async updateSubmissionStatus(id, status, notes = '') {
    const sb = this.getSb();
    if (!sb) return false;
    const { error } = await sb.from('mod_submissions').update({
      status,
      admin_notes: notes || '',
      reviewed_at: new Date().toISOString()
    }).eq('id', id);
    return !error;
  },

  /** Import mods from parsed CSV/JSON rows (admin). Returns { ok, added, skipped, errors } */
  async importMods(rows) {
    const results = { ok: true, added: 0, skipped: 0, errors: [] };
    if (!Array.isArray(rows)) return { ok: false, added: 0, skipped: 0, errors: ['Invalid payload'] };
    for (const raw of rows) {
      try {
        const title = String(raw.title || '').trim();
        const game = String(raw.game || '').trim();
        const category = String(raw.category || '').trim();
        if (!title || !game || !category) {
          results.skipped += 1;
          results.errors.push(`Skipped row missing title/game/category: ${title || '(untitled)'}`);
          continue;
        }
        const id = String(raw.id || '').trim() || generateId();
        if (this.getById(id)) {
          results.skipped += 1;
          continue;
        }
        let changelog = raw.changelog;
        if (typeof changelog === 'string') {
          try { changelog = JSON.parse(changelog); } catch (_) { changelog = []; }
        }
        const mod = {
          id,
          title,
          description: raw.description || '',
          version: raw.version || '1.0.0',
          game,
          category,
          tags: normalizeTags(raw.tags),
          downloadUrl: raw.downloadUrl || raw.download_url || '',
          downloads: Number(raw.downloads) || 0,
          likes: Number(raw.likes) || 0,
          coverImage: raw.coverImage || raw.cover_image || '',
          images: Array.isArray(raw.images) ? raw.images : [],
          featured: raw.featured === true || raw.featured === 'true' || raw.featured === '1',
          compatibility: raw.compatibility || '',
          changelog: Array.isArray(changelog) ? changelog : [],
          createdAtIso: toIsoDate(raw.createdAtIso || raw.created_at || raw.createdAt),
          createdBy: raw.createdBy || raw.created_by || 'import'
        };
        await this.add(mod);
        results.added += 1;
      } catch (err) {
        results.errors.push(String(err.message || err));
      }
    }
    results.ok = results.errors.length === 0 || results.added > 0;
    return results;
  },

  /** Recent comments across all mods (admin inbox) */
  async listRecentComments(limit = 40) {
    const sb = this.getSb();
    if (!sb) return [];
    try {
      const { data, error } = await sb
        .from('mod_comments')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      const modsById = Object.fromEntries(this.getAll().map(m => [m.id, m]));
      return (data || []).map(c => ({
        ...c,
        mod_title: (modsById[c.mod_id] && modsById[c.mod_id].title) || c.mod_id
      }));
    } catch (err) {
      console.error('listRecentComments error:', err);
      return [];
    }
  },

  /** Toggle featured flag (falls back to local-only if column missing) */
  async setFeatured(id, featured) {
    const mod = this.getById(id);
    if (!mod) return false;
    try {
      await this.update(id, { featured: !!featured });
      return true;
    } catch (err) {
      console.error('setFeatured error:', err);
      mod.featured = !!featured;
      this.save(this.getAll());
      return true;
    }
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

/** Split a comma-separated tag string into a clean, de-duplicated array */
function parseTags(tags) {
  const list = Array.isArray(tags) ? tags : String(tags || '').split(',');
  const seen = new Set();
  return list
    .map(t => String(t).trim().replace(/^#/, ''))
    .filter(t => t && !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()));
}

/** "2026-09-07" / ISO string → "7 Sep 2026" */
function formatDate(value) {
  if (!value) return '';
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? value + 'T00:00:00' : value);
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** ISO string → "just now" / "5 min ago" / "3 days ago" / formatted date */
function timeAgo(value) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value);
  const diff = Math.max(0, Date.now() - d.getTime());
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return min + ' min ago';
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return hrs + (hrs === 1 ? ' hour ago' : ' hours ago');
  const days = Math.floor(hrs / 24);
  if (days < 7) return days + (days === 1 ? ' day ago' : ' days ago');
  return formatDate(d.toISOString());
}

/** Reduce Markdown to plain text for card excerpts and meta descriptions */
function stripMarkdown(text) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+[.)])\s+/gm, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/^\s*([-*_]){3,}\s*$/gm, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Format large counts compactly: 1200 → "1.2k" */
function formatCount(n) {
  n = Number(n) || 0;
  if (n < 1000) return String(n);
  if (n < 1000000) return (n / 1000).toFixed(n < 10000 ? 1 : 0).replace(/\.0$/, '') + 'k';
  return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Simple fuzzy match: true if query tokens roughly appear in haystack */
function fuzzyMatch(haystack, query) {
  const h = String(haystack || '').toLowerCase();
  const q = String(query || '').toLowerCase().trim();
  if (!q) return true;
  if (h.includes(q)) return true;
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.every(t => h.includes(t))) return true;
  // Character-sequence fuzzy: each token must appear in order as subsequence
  return tokens.every(token => {
    if (h.includes(token)) return true;
    let i = 0;
    for (const ch of h) {
      if (ch === token[i]) i += 1;
      if (i >= token.length) return true;
    }
    // Edit distance for short tokens/titles
    if (token.length <= 12) {
      const words = h.split(/[^a-z0-9]+/).filter(Boolean);
      return words.some(w => levenshtein(w, token) <= Math.max(1, Math.floor(token.length / 4)));
    }
    return false;
  });
}

function levenshtein(a, b) {
  a = String(a); b = String(b);
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = i - 1;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return row[b.length];
}

// ── Auth redirect helper ─────────────────────────────────────
/** Build auth.html?redirect=… pointing back to the current (or given) page. */
function authRedirectUrl(returnTo) {
  let target = returnTo;
  if (!target) {
    const file = (window.location.pathname.split('/').pop() || 'index.html').replace(/\/$/, '');
    const page = (!file || file === 'index') ? './' : (file.endsWith('.html') ? file : file + '.html');
    target = page === './' ? './' : page + (window.location.search || '') + (window.location.hash || '');
  }
  if (target === './' || target === '/' || target === 'index.html') return 'auth.html';
  return 'auth.html?redirect=' + encodeURIComponent(target);
}

// ── Toast ────────────────────────────────────────────────────
/**
 * Show a toast notification.
 * @param {string} message
 * @param {number|{duration?:number, action?:{label:string, href?:string, onClick?:Function}}} [opts]
 */
function showToast(message, opts = 3000) {
  const options = typeof opts === 'number' ? { duration: opts } : (opts || {});
  const duration = options.duration != null ? options.duration : (options.action ? 5500 : 3000);

  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    container.setAttribute('aria-live', 'polite');
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = 'toast' + (options.action ? ' toast--action' : '');
  toast.setAttribute('role', 'status');

  const text = document.createElement('span');
  text.className = 'toast__text';
  text.textContent = message;
  toast.appendChild(text);

  if (options.action && options.action.label) {
    const btn = document.createElement(options.action.href ? 'a' : 'button');
    btn.className = 'toast__action';
    btn.textContent = options.action.label;
    if (options.action.href) {
      btn.href = options.action.href;
    } else {
      btn.type = 'button';
      btn.addEventListener('click', () => {
        toast.classList.remove('show');
        if (typeof options.action.onClick === 'function') options.action.onClick();
      });
    }
    toast.appendChild(btn);
  }

  container.appendChild(toast);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => { toast.classList.add('show'); });
  });
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 280);
  }, duration);
}

// ── Dialogs (replacement for window.confirm / window.prompt) ─
let dialogCounter = 0;

/**
 * Opens an accessible modal dialog.
 * Resolves with `true` / `false` for confirm dialogs, or with the entered
 * string / `null` when `input` options are supplied.
 */
function openDialog(opts = {}) {
  return new Promise(resolve => {
    const id = 'tz-dialog-' + (++dialogCounter);
    const hasInput = !!opts.input;
    const input = opts.input || {};
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = id;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', id + '-title');

    const inputHtml = !hasInput ? '' : (input.multiline
      ? `<textarea class="input modal__input" id="${id}-input" rows="3" placeholder="${escapeHtml(input.placeholder || '')}" maxlength="${Number(input.maxlength) || 2000}"></textarea>`
      : `<input type="${input.type === 'password' ? 'password' : 'text'}" class="input modal__input" id="${id}-input" placeholder="${escapeHtml(input.placeholder || '')}" maxlength="${Number(input.maxlength) || 300}" autocomplete="${input.type === 'password' ? 'current-password' : 'off'}" />`);

    overlay.innerHTML = `
      <div class="modal">
        <h2 class="modal__title" id="${id}-title">${escapeHtml(opts.title || 'Are you sure?')}</h2>
        ${opts.message ? `<p class="modal__sub">${escapeHtml(opts.message)}</p>` : ''}
        ${inputHtml}
        <div class="modal__actions">
          <button type="button" class="btn btn--ghost" data-action="cancel">${escapeHtml(opts.cancelText || 'Cancel')}</button>
          <button type="button" class="btn btn--primary${opts.danger ? ' btn--danger' : ''}" data-action="confirm">${escapeHtml(opts.confirmText || 'OK')}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const inputEl = hasInput ? overlay.querySelector('.modal__input') : null;
    if (inputEl && input.defaultValue) inputEl.value = input.defaultValue;
    const previouslyFocused = document.activeElement;
    const modalEl = overlay.querySelector('.modal');
    let settled = false;

    function onFocusTrap(e) {
      if (e.key !== 'Tab' || !modalEl) return;
      const focusables = modalEl.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      const list = Array.prototype.filter.call(focusables, el => !el.disabled && el.offsetParent !== null);
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }

    function close(result) {
      if (settled) return;
      settled = true;
      overlay.classList.remove('open');
      document.body.classList.remove('modal-open');
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('keydown', onFocusTrap);
      setTimeout(() => overlay.remove(), 200);
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        try { previouslyFocused.focus(); } catch (_) {}
      }
      resolve(result);
    }
    function confirm() {
      if (!hasInput) return close(true);
      const val = inputEl.value.trim();
      if (input.required !== false && !val) {
        inputEl.classList.add('modal__input--error');
        inputEl.focus();
        return;
      }
      close(val);
    }
    function cancel() { close(hasInput ? null : false); }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); cancel(); }
      else if (e.key === 'Enter' && (!hasInput || !input.multiline || e.ctrlKey || e.metaKey)) {
        if (!hasInput || document.activeElement === inputEl) { e.preventDefault(); confirm(); }
      }
    }

    overlay.querySelector('[data-action="confirm"]').addEventListener('click', confirm);
    overlay.querySelector('[data-action="cancel"]').addEventListener('click', cancel);
    overlay.addEventListener('click', e => { if (e.target === overlay) cancel(); });
    document.addEventListener('keydown', onKey);
    document.addEventListener('keydown', onFocusTrap);
    if (inputEl) inputEl.addEventListener('input', () => inputEl.classList.remove('modal__input--error'));

    requestAnimationFrame(() => {
      overlay.classList.add('open');
      document.body.classList.add('modal-open');
      const focusTarget = inputEl || overlay.querySelector('[data-action="confirm"]');
      if (focusTarget) focusTarget.focus();
      if (inputEl && typeof inputEl.select === 'function' && !input.multiline) inputEl.select();
    });
  });
}

/** Promise<boolean> replacement for window.confirm() */
function confirmDialog(message, opts = {}) {
  return openDialog({ title: opts.title || 'Are you sure?', message, confirmText: opts.confirmText || 'Confirm', cancelText: opts.cancelText, danger: !!opts.danger });
}

/** Promise<string|null> replacement for window.prompt() */
function promptDialog(message, opts = {}) {
  return openDialog({
    title: opts.title || message,
    message: opts.title ? message : '',
    confirmText: opts.confirmText || 'Submit',
    cancelText: opts.cancelText,
    input: { placeholder: opts.placeholder || '', defaultValue: opts.defaultValue || '', multiline: !!opts.multiline, maxlength: opts.maxlength, required: opts.required, type: opts.type }
  });
}

// ── Export globals ───────────────────────────────────────────
window.TZ = {
  Store, GAMES, CATEGORIES, CATEGORY_ICONS,
  generateId, today, escapeHtml, escapeXml, showToast, normalizeTags, parseTags,
  formatDate, timeAgo, formatCount, stripMarkdown, confirmDialog, promptDialog,
  authRedirectUrl, fuzzyMatch
};
