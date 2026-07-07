/**
 * A skin bundles everything that varies between art sets for the progress game.
 * Adding new art = appending one object to SKINS. No logic changes.
 *
 * Shape:
 *   id        string   stable key; THIS is what gets persisted (localStorage / profile). Never reuse or rename.
 *   name      string   label shown in the picker
 *   cell      number   source sprite grid size (px, square)
 *   baseline  number   row inside the cell the character's feet rest on
 *   scale     integer  display multiplier — INTEGER ONLY (no fractional scaling)
 *   sprites   nested per-state, per-variant:
 *             {
 *               idle:  { happy: {src, frames}, sad?: {src, frames} },
 *               walk:  { happy: {src, frames}, sad?: {src, frames} },
 *               react: { right?: {src, frames}, wrong?: {src, frames} },
 *             }
 *             - `sad` missing → falls back to `happy`
 *             - `react.*` missing → no reaction (skip)
 *             - any resolved sprite with empty `src` or `frames: 0` → treat as absent
 *   flag?     optional per-skin flag set; omit to inherit DEFAULT_FLAG
 *             { cell, baseline, inactive:{src}, activate:{src,frames}, wave:{src,frames} }
 *   ground?   optional per-skin ground; omit to inherit DEFAULT_GROUND
 *             { src, tileW, tileH }
 */

// Shared defaults a skin inherits when it omits `ground` / `flag`.
export const DEFAULT_GROUND = {
  src:   'https://media.base44.com/images/public/69fd6153088222f7245f34d6/5e5dbe4f0_groundtile.png',
  tileW: 64,
  tileH: 16,
};

export const DEFAULT_FLAG = {
  cell:     32,
  baseline: 29,
  inactive: { src:    'https://media.base44.com/images/public/69fd6153088222f7245f34d6/6cec62a7e_flaginactive.png' },
  activate: { src:    'https://media.base44.com/images/public/69fd6153088222f7245f34d6/7ebf67c3a_flagactivation.png', frames: 4 },
  wave:     { src:    'https://media.base44.com/images/public/69fd6153088222f7245f34d6/c6323ddf5_flagwaving.png',     frames: 3 },
};

const CAT = {
  id:       'cat',
  name:     'Cat',
  cell:     32,
  baseline: 29,
  scale:    1,
  sprites: {
    idle:  { happy: { src: 'https://media.base44.com/images/public/69fd6153088222f7245f34d6/f2e415cfd_catidle.png', frames: 4 } },
    walk:  { happy: { src: 'https://media.base44.com/images/public/69fd6153088222f7245f34d6/6ede5faf0_catwalk.png', frames: 4 } },
    react: { wrong: { src: '', frames: 4 } }, // placeholder — no wrong sprite uploaded yet
  },
  // no flag/ground → inherits DEFAULT_FLAG and DEFAULT_GROUND
};

const EGG = {
  id:       'egg',
  name:     'Egg',
  cell:     48,
  baseline: 47,
  scale:    1,
  sprites: {
    idle:  { happy: { src: 'https://media.base44.com/images/public/69fd6153088222f7245f34d6/facafef11_EggIdle.png',  frames: 6 } },
    walk:  { happy: { src: 'https://media.base44.com/images/public/69fd6153088222f7245f34d6/48422f385_EggWalk.png',  frames: 6 } },
    react: { wrong: { src: 'https://media.base44.com/images/public/69fd6153088222f7245f34d6/61e0a8336_EggWrong.png', frames: 6 } },
  },
  flag: {   // egg ships 48px flags so they match its grid
    cell:     48,
    baseline: 47,
    inactive: { src: '', },
    activate: { src: '', frames: 4 },
    wave:     { src: '', frames: 3 },
  },
  // no ground → inherits DEFAULT_GROUND
};

const SWAB = {
  id:       'swab',
  name:     'Swab',
  cell:     32,
  baseline: 31,
  scale:    2,
  sprites: {
    idle: { happy: { src: 'https://media.base44.com/images/public/69fd6153088222f7245f34d6/02953bbd9_Swab-Idle-Happy.png', frames: 10 } },
    // idle.sad omitted → resolveSprite falls back to idle.happy
    walk: {
      happy: { src: 'https://media.base44.com/images/public/69fd6153088222f7245f34d6/d607b43cb_Swab-Walk-Happy.png', frames: 8 },
      sad:   { src: 'https://media.base44.com/images/public/69fd6153088222f7245f34d6/3a67e6caf_Swab-Walk-Sad.png', frames: 8 },
    },
    react: {
      right: { src: 'https://media.base44.com/images/public/69fd6153088222f7245f34d6/6221bf3b9_Swab-Right.png', frames: 11 },
      wrong: { src: 'https://media.base44.com/images/public/69fd6153088222f7245f34d6/f0f4305d8_Swab-Wrong.png', frames: 8 },
    },
  },
  ground: {
    src:   'https://media.base44.com/images/public/69fd6153088222f7245f34d6/8c86d6208_Ground-1.png',
    tileW: 64,
    tileH: 7,
  },
  // no flag → inherits DEFAULT_FLAG (32px)
};

export const SKINS = [SWAB, CAT, EGG];
export const DEFAULT_SKIN_ID = 'swab';

// Lookup with a safety fallback: an unknown/retired id resolves to the default
// rather than rendering a broken scene.
export const getSkin = (id) =>
  SKINS.find((s) => s.id === id) || SKINS.find((s) => s.id === DEFAULT_SKIN_ID);

/**
 * resolveSprite(skin, state, variant) — resolve a sprite through the fallback rules.
 * Returns the { src, frames } object or null when absent.
 *   - `sad` missing → falls back to `happy`
 *   - any resolved sprite with empty `src` or `frames: 0` → treated as absent (null)
 */
export function resolveSprite(skin, state, variant) {
  const stateObj = skin?.sprites?.[state];
  if (!stateObj) return null;
  let s = stateObj[variant];
  if (!s && variant === 'sad') s = stateObj.happy; // sad → happy fallback
  if (!s) return null;
  if (!s.src || !s.frames || s.frames <= 0) return null;
  return s;
}