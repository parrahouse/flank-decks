/**
 * The app's single shared <audio> element for all narration: card read-aloud
 * (useNarration) and Learn More (ElevenLabs, Stage 5). One element means one
 * iOS unlock covers every narrator, and two narrators can never play at once.
 *
 * Ownership protocol:
 * - A narrator is an object with a release() method.
 * - Call claimAudio(owner) immediately before assigning src / handlers and
 *   playing. If a different owner held the element, the element is paused and
 *   its handlers detached, then the previous owner's release() runs so it can
 *   reset its own state. release() must NOT touch the element (it no longer owns it).
 * - Only the current owner may pause, seek, or read the element for its clock:
 *   check isAudioOwner(owner) first, or use releaseAudio(owner), which is a
 *   no-op for non-owners.
 */

// 44-byte silent PCM WAV. Played on the shared element inside a click so iOS
// Safari allows later programmatic play() calls after an async generation.
const SILENT_SRC = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=';

let audio = null;
let unlocked = false;
let owner = null;

export function getSharedAudio() {
  if (!audio) {
    audio = new Audio();
    audio.preload = 'auto';
  }
  return audio;
}

// Must be called synchronously inside a user gesture. Skipped while real audio
// is playing (swapping src would cut it off).
export function unlockSharedAudio() {
  if (unlocked) return;
  const a = getSharedAudio();
  if (!a.paused) return;
  a.src = SILENT_SRC;
  a.play().then(() => { unlocked = true; }).catch(() => {});
}

export function claimAudio(next) {
  const a = getSharedAudio();
  if (owner !== next) {
    const prev = owner;
    if (prev) {
      a.onended = null;
      a.onerror = null;
      a.pause();
      owner = null;
      try { prev.release(); } catch (err) { console.error('narration release failed', err); }
    }
    owner = next;
  }
  return a;
}

export function isAudioOwner(o) {
  return owner != null && owner === o;
}

// Pause and detach, and give up ownership — only if `o` is the current owner.
export function releaseAudio(o) {
  if (!isAudioOwner(o)) return;
  owner = null;
  if (audio) {
    audio.onended = null;
    audio.onerror = null;
    audio.pause();
  }
}