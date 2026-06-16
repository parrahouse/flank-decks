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
 *   sprites   { idle, walk, wrong }  each { src, frames }   frames = strip width ÷ cell
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
    idle:  { src: 'https://media.base44.com/images/public/69fd6153088222f7245f34d6/f2e415cfd_catidle.png', frames: 4 },
    walk:  { src: 'https://media.base44.com/images/public/69fd6153088222f7245f34d6/6ede5faf0_catwalk.png', frames: 4 },
    wrong: { src: '', frames: 4 }, // placeholder — no wrong sprite uploaded yet
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
    idle:  { src: 'https://media.base44.com/images/public/69fd6153088222f7245f34d6/facafef11_EggIdle.png',  frames: 6 },
    walk:  { src: 'https://media.base44.com/images/public/69fd6153088222f7245f34d6/48422f385_EggWalk.png',  frames: 6 },
    wrong: { src: 'https://media.base44.com/images/public/69fd6153088222f7245f34d6/61e0a8336_EggWrong.png', frames: 6 },
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

export const SKINS = [CAT, EGG];
export const DEFAULT_SKIN_ID = 'egg';

// Lookup with a safety fallback: an unknown/retired id resolves to the default
// rather than rendering a broken scene.
export const getSkin = (id) =>
  SKINS.find((s) => s.id === id) || SKINS.find((s) => s.id === DEFAULT_SKIN_ID);