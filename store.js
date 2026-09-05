/**
 * tuckzed mods — Shared Data Store & Utilities
 * Uses localStorage for persistence across index.html and admin.html
 */

'use strict';

// ── Constants ────────────────────────────────────────────────
const STORAGE_KEY = 'tuckzed_mods_v1';

const GAMES = {
  ac:     { id: 'ac',     name: 'Assetto Corsa',  icon: '🏎️', desc: 'Realistic simulation racing with thousands of car & track mods.' },
  beamng: { id: 'beamng', name: 'BeamNG.drive',   icon: '🚗', desc: 'Soft-body physics sandbox with an enormous modding community.' },
};

const CATEGORIES = ['Cars', 'Tracks', 'Maps', 'Physics'];

// ── Seed Data ────────────────────────────────────────────────
const SEED_MODS = [
  {
    id: 'seed-1',
    title: 'Ferrari 488 GT3 EVO 2020',
    description: 'Full GT3-specification Ferrari 488 with accurate aero data, tyre model refinements, and livery support for 12 real-world teams.',
    version: '2.4.1',
    category: 'Cars',
    game: 'ac',
    downloadUrl: 'https://assettocorsa.club/mods/car/ferrari-488-gt3',
    coverImage: '',
    createdAt: '2024-01-10',
  },
  {
    id: 'seed-2',
    title: 'Nordschleife Extended 2024',
    description: 'The legendary Nürburgring Nordschleife with updated 2024 track surface, guard rails, marshalling zones, and 4K textures.',
    version: '3.1.0',
    category: 'Tracks',
    game: 'ac',
    downloadUrl: 'https://assettocorsa.club/mods/track/nordschleife',
    coverImage: '',
    createdAt: '2024-03-05',
  },
  {
    id: 'seed-3',
    title: 'Porsche 911 GT3 RS Street',
    description: 'Road-legal GT3 RS with correct road tyre compounds, suspension geometry, and exhaust audio capture from real dyno sessions.',
    version: '1.8.2',
    category: 'Cars',
    game: 'ac',
    downloadUrl: 'https://assettocorsa.club/mods/car/porsche-911-gt3rs',
    coverImage: '',
    createdAt: '2024-04-22',
  },
  {
    id: 'seed-4',
    title: 'Advanced Tyre Physics Pack',
    description: 'Overhauls AC\'s default tyre model with temperature-sensitive grip falloff, realistic flat-spot simulation, and compound blending.',
    version: '1.0.5',
    category: 'Physics',
    game: 'ac',
    downloadUrl: 'https://assettocorsa.club/mods/physics/tyre-physics',
    coverImage: '',
    createdAt: '2024-06-01',
  },
  {
    id: 'seed-5',
    title: 'Gavril D-Series Lifted Offroad',
    description: 'Heavy-duty lifted Gavril D-Series with aggressive all-terrain tyres, raised suspension, skid plates, and custom off-road lighting.',
    version: '2.0.0',
    category: 'Cars',
    game: 'beamng',
    downloadUrl: 'https://www.beamng.com/resources/gavril-d-series-lifted.12345/',
    coverImage: '',
    createdAt: '2024-02-14',
  },
  {
    id: 'seed-6',
    title: 'Hawaii Mega Map',
    description: 'A sprawling 64 km² open-world Hawaii island with highways, mountain passes, beach roads, and hidden dirt tracks to explore.',
    version: '1.5.3',
    category: 'Maps',
    game: 'beamng',
    downloadUrl: 'https://www.beamng.com/resources/hawaii-map.67890/',
    coverImage: '',
    createdAt: '2024-03-30',
  },
  {
    id: 'seed-7',
    title: 'ETK K-Series Racing Edition',
    description: 'Track-prepped ETK K-Series with sequential gearbox, adjustable aero package, roll cage, and bucket seats. Includes 6 liveries.',
    version: '1.2.1',
    category: 'Cars',
    game: 'beamng',
    downloadUrl: 'https://www.beamng.com/resources/etk-k-racing.54321/',
    coverImage: '',
    createdAt: '2024-05-18',
  },
  {
    id: 'seed-8',
    title: 'Realistic Crash Physics v3',
    description: 'Fine-tuned soft-body parameters for more cinematic and realistic deformation — crumple zones, glass shattering, and panel intrusion.',
    version: '3.0.0',
    category: 'Physics',
    game: 'beamng',
    downloadUrl: 'https://www.beamng.com/resources/realistic-crash.11111/',
    coverImage: '',
    createdAt: '2024-07-02',
  },
  {
    id: 'seed-9',
    title: 'Spa-Francorchamps 2023',
    description: 'Full laser-scanned Spa circuit with 2023 chicane, updated run-off areas, and seasonal weather texture variants.',
    version: '2.0.3',
    category: 'Tracks',
    game: 'ac',
    downloadUrl: 'https://assettocorsa.club/mods/track/spa-2023',
    coverImage: '',
    createdAt: '2024-08-10',
  },
  {
    id: 'seed-10',
    title: 'Bruckell Moonhawk Resto-Mod',
    description: 'Classic Moonhawk body on a modern chassis with LS swap, pro-touring suspension, and wide-body kit. Six colour options.',
    version: '1.1.0',
    category: 'Cars',
    game: 'beamng',
    downloadUrl: 'https://www.beamng.com/resources/moonhawk-restomod.22222/',
    coverImage: '',
    createdAt: '2024-09-01',
  },
];

// ── Emoji placeholders by category ──────────────────────────
const CATEGORY_ICONS = {
  Cars:    '🚗',
  Tracks:  '🏁',
  Maps:    '🗺️',
  Physics: '⚙️',
};

// ── Store ────────────────────────────────────────────────────
const Store = {
  /** Load mods from localStorage, seeding if first visit */
  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (_) { /* corrupt — reseed */ }
    this.save(SEED_MODS);
    return [...SEED_MODS];
  },

  /** Persist mods array */
  save(mods) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mods));
  },

  /** Get all mods */
  getAll() { return this.load(); },

  /** Get mod by id */
  getById(id) { return this.getAll().find(m => m.id === id) || null; },

  /** Add a new mod */
  add(mod) {
    const mods = this.getAll();
    mods.unshift(mod);
    this.save(mods);
    return mod;
  },

  /** Update a mod by id */
  update(id, data) {
    const mods = this.getAll();
    const idx = mods.findIndex(m => m.id === id);
    if (idx === -1) return null;
    mods[idx] = { ...mods[idx], ...data };
    this.save(mods);
    return mods[idx];
  },

  /** Delete a mod by id */
  delete(id) {
    const mods = this.getAll().filter(m => m.id !== id);
    this.save(mods);
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
