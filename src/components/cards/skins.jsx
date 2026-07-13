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
 *   eggLay?   optional character one-shot sprite: { src, frames } (character grid, uses SCALE)
 *   death?    optional character one-shot sprite: { src, frames } (character grid, uses SCALE)
 *             plays once when hearts empty in Game Mode; final frame is fully transparent by design
 *   zombie?   optional sub-skin overlay used after death in Game Mode. Flat slots; anything
 *             missing falls back to the base skin's equivalent:
 *             {
 *               enter?:  { src, frames },   // one-shot rise-from-grave; FIRST frame transparent by design
 *               idle?:   { src, frames },
 *               walk?:   { src, frames },
 *               react?:  { right?: {src,frames}, wrong?: {src,frames} },
 *               eggLay?: { src, frames },
 *               egg?:    { src, frames, cell, baseline },  // world element, same convention as skin.egg
 *             }
 *             A skin with no `death` or no `zombie.walk` cannot be zombified (see canZombify).
 *   egg?      optional world element: { src, frames, cell, baseline } (scales with SCALE)
 *   marker?   optional world element: { src, frames, tileW, tileH, baseline } (NEVER scales)
 *   finish?   optional world element at m === total: { src, frames, tileW, tileH, baseline } (scales with SCALE)
 *   ground?   optional per-skin ground; omit to inherit DEFAULT_GROUND
 *             { src, tileW, tileH }
 */

// Shared defaults a skin inherits when it omits `ground` / `flag`.
export const DEFAULT_GROUND = {
  src:   'https://media.base44.com/images/public/69fd6153088222f7245f34d6/5e5dbe4f0_groundtile.png',
  tileW: 64,
  tileH: 16,
};

// Flag system retired — replaced by the egg-laying waypoint system.

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
  // no ground → inherits DEFAULT_GROUND
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
  // no ground → inherits DEFAULT_GROUND
};

const SWAB = {
  id:       'swab',
  name:     'Swab',
  cell:     32,
  baseline: 31,
  scale:    2,
  sprites: {
    idle: {
      happy: { src: 'https://media.base44.com/images/public/69fd6153088222f7245f34d6/02953bbd9_Swab-Idle-Happy.png', frames: 10 },
      sad:   { src: 'https://media.base44.com/images/public/69fd6153088222f7245f34d6/013b738b5_Swab-Idle-Sad.png', frames: 8 },
    },
    walk: {
      happy: { src: 'https://media.base44.com/images/public/69fd6153088222f7245f34d6/d607b43cb_Swab-Walk-Happy.png', frames: 8 },
      sad:   { src: 'https://media.base44.com/images/public/69fd6153088222f7245f34d6/3a67e6caf_Swab-Walk-Sad.png', frames: 8 },
    },
    react: {
      right: { src: 'https://media.base44.com/images/public/69fd6153088222f7245f34d6/6221bf3b9_Swab-Right.png', frames: 11 },
      wrong: { src: 'https://media.base44.com/images/public/69fd6153088222f7245f34d6/f0f4305d8_Swab-Wrong.png', frames: 8 },
    },
    eggLay: { src: 'https://media.base44.com/images/public/69fd6153088222f7245f34d6/5cdfc4db7_Swab-Waypoint.png', frames: 15 },
    death:  { src: 'https://media.base44.com/images/public/69fd6153088222f7245f34d6/5a19e9fde_Swab-Death.png', frames: 24 },
  },
  egg: {
    src:      'https://media.base44.com/images/public/69fd6153088222f7245f34d6/9d9672e00_Swab-Waypoint-Ready.png',
    frames:    6,
    cell:      32,
    baseline:  32,
  },
  marker: {
    src:      'https://media.base44.com/images/public/69fd6153088222f7245f34d6/ca356d1c4_Swab-Waypoint-Marker.png',
    frames:   15,
    tileW:     32,
    tileH:     50,
    baseline:  50,
  },
  finish: {
    src:      'https://media.base44.com/images/public/69fd6153088222f7245f34d6/04c51513e_Swab-Marker-Finish.png',
    frames:    9,
    tileW:     32,
    tileH:     60,
    baseline:  60,
  },
  zombie: {
    enter:  { src: 'https://media.base44.com/images/public/69fd6153088222f7245f34d6/58e1a2754_Swab-Enter-Zombie.png', frames: 14 },
    idle:   { src: 'https://media.base44.com/images/public/69fd6153088222f7245f34d6/3859d3c20_Swab-Idle-Zombie.png', frames: 12 },
    walk:   { src: 'https://media.base44.com/images/public/69fd6153088222f7245f34d6/6e3f924b3_Swab-Walk-Zombie.png', frames: 8 },
    react: {
      right: { src: 'https://media.base44.com/images/public/69fd6153088222f7245f34d6/337595768_Swab-Right-Zombie.png', frames: 8 },
      wrong: { src: 'https://media.base44.com/images/public/69fd6153088222f7245f34d6/8acf0dc04_Swab-Wrong-Zombie.png', frames: 8 },
    },
    eggLay: { src: 'https://media.base44.com/images/public/69fd6153088222f7245f34d6/20939d025_Swab-Waypoint-Zombie.png', frames: 12 },
    egg: {
      src:      'https://media.base44.com/images/public/69fd6153088222f7245f34d6/6a25b1ed4_Swab-Waypoint-Ready-Zombie.png',
      frames:    6,
      cell:      32,
      baseline:  32,
    },
  },
  ground: {
    src:   'https://media.base44.com/images/public/69fd6153088222f7245f34d6/463335540_Ground-1.png',
    tileW: 64,
    tileH: 7,
  },
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

/**
 * canZombify(skin) — a skin supports Game Mode's death sequence only if it has
 * both a death one-shot and at least a zombie walk. Skins without them (Cat, Egg)
 * are Progress-only until that art exists.
 */
export const canZombify = (skin) => !!(skin?.sprites?.death?.src && skin?.zombie?.walk?.src);

/**
 * getEffectiveSkin(skin, zombified) — returns the skin the band should render.
 * When zombified, zombie slots overlay the base skin; missing zombie slots fall
 * back to the base sprite so partial zombie art degrades gracefully.
 *
 * Zombie idle/walk are wrapped as { happy: ... } deliberately: the zombie has one
 * mood, so both the 'happy' and 'sad' variant requests resolve to the zombie sprite
 * through resolveSprite's existing sad → happy fallback. No consumer logic changes.
 */
export function getEffectiveSkin(skin, zombified = false) {
  if (!zombified || !skin?.zombie) return skin;
  const z = skin.zombie;
  return {
    ...skin,
    sprites: {
      ...skin.sprites,
      idle: z.idle?.src ? { happy: z.idle } : skin.sprites.idle,
      walk: z.walk?.src ? { happy: z.walk } : skin.sprites.walk,
      react: {
        right: z.react?.right?.src ? z.react.right : skin.sprites.react?.right,
        wrong: z.react?.wrong?.src ? z.react.wrong : skin.sprites.react?.wrong,
      },
      eggLay: z.eggLay?.src ? z.eggLay : skin.sprites.eggLay,
    },
    egg: z.egg?.src ? z.egg : skin.egg,
  };
}