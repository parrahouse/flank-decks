import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// ElevenLabs narration for Learn More explanations.
// Input:  { text }  — SwabbieSpeechBubble's plainText(nodes), verbatim.
// Output: { audio_url, words: [{ text, from, to, start, end }], duration_s, cached }
//   from/to are UTF-16 offsets into the input text (same units as the bubble's
//   page {from, to}); start/end are seconds from audio start.
// Shared cache: NarrationClip (admin-only RLS), read/written via service role.

const VOICE_ID = 'bAq8AI9QURijOtmeFFqT';
const MODEL_ID = 'eleven_turbo_v2_5';
const OUTPUT_FORMAT = 'mp3_44100_128';
const MAX_CHARS = 3000; // hard cap per request — bounds cost of any single call

const WS = /\s/;

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Map ElevenLabs character alignment (over the whitespace-collapsed spoken text)
// back onto the ORIGINAL text by pairing non-whitespace characters in order.
// Whitespace may differ between the two; every non-whitespace character must
// match exactly or the mapping is rejected.
function buildWords(text: string, alignment: any) {
  const chars: string[] = alignment?.characters || [];
  const starts: number[] = alignment?.character_start_times_seconds || [];
  const ends: number[] = alignment?.character_end_times_seconds || [];

  // Timing indices of non-whitespace characters in the alignment.
  const alignNws: number[] = [];
  for (let k = 0; k < chars.length; k++) if (!WS.test(chars[k])) alignNws.push(k);

  // Walk the original text by code point, tracking UTF-16 offsets.
  const textNws: { ch: string; off: number; len: number }[] = [];
  let off = 0;
  for (const ch of text) {
    if (!WS.test(ch)) textNws.push({ ch, off, len: ch.length });
    off += ch.length;
  }

  if (alignNws.length !== textNws.length) {
    return { error: `non-whitespace length mismatch: text=${textNws.length} alignment=${alignNws.length}` };
  }
  for (let j = 0; j < textNws.length; j++) {
    if (chars[alignNws[j]] !== textNws[j].ch) {
      return { error: `char mismatch at non-ws index ${j}: text=${JSON.stringify(textNws[j].ch)} alignment=${JSON.stringify(chars[alignNws[j]])}` };
    }
  }

  // Group consecutive non-whitespace characters (adjacent in the original text) into words.
  const words: { text: string; from: number; to: number; start: number; end: number }[] = [];
  let j = 0;
  while (j < textNws.length) {
    let k = j;
    while (k + 1 < textNws.length && textNws[k + 1].off === textNws[k].off + textNws[k].len) k++;
    const from = textNws[j].off;
    const to = textNws[k].off + textNws[k].len;
    words.push({
      text: text.slice(from, to),
      from,
      to,
      start: starts[alignNws[j]],
      end: ends[alignNws[k]],
    });
    j = k + 1;
  }
  const lastEnd = ends.length ? ends[ends.length - 1] : 0;
  return { words, duration_s: lastEnd };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { text } = await req.json().catch(() => ({}));
    if (typeof text !== 'string' || !text.trim()) {
      return Response.json({ error: 'text is required' }, { status: 400 });
    }
    if (text.length > MAX_CHARS) {
      return Response.json({ error: `text exceeds ${MAX_CHARS} characters` }, { status: 413 });
    }

    const svc = base44.asServiceRole;
    const cacheKey = await sha256Hex(`${VOICE_ID}|${MODEL_ID}|${text}`);

    // Cache hit: oldest row for this key wins (no unique constraint in Base44).
    const hits = await svc.entities.NarrationClip.filter({ cache_key: cacheKey });
    if (hits && hits.length) {
      const clip = [...hits].sort((a: any, b: any) =>
        String(a.created_date || '').localeCompare(String(b.created_date || '')))[0];
      return Response.json({
        audio_url: clip.audio_url,
        words: clip.words || [],
        duration_s: clip.duration_s ?? null,
        cached: true,
      });
    }

    const apiKey = Deno.env.get('ELEVENLABS_API_KEY');
    if (!apiKey) return Response.json({ error: 'ELEVENLABS_API_KEY is not set' }, { status: 500 });

    // Whitespace-collapsed for speech (bubble text can contain newlines / runs of
    // spaces from block separation). Offsets are mapped back to the original text.
    const spoken = text.replace(/\s+/g, ' ').trim();

    const elRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/with-timestamps?output_format=${OUTPUT_FORMAT}`,
      {
        method: 'POST',
        headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: spoken, model_id: MODEL_ID }),
      },
    );
    if (!elRes.ok) {
      const body = (await elRes.text()).slice(0, 500);
      return Response.json({ error: 'ElevenLabs request failed', status: elRes.status, body }, { status: 502 });
    }
    const el = await elRes.json();
    if (!el?.audio_base64 || !el?.alignment) {
      return Response.json({ error: 'ElevenLabs response missing audio or alignment' }, { status: 502 });
    }

    const exactAlignment = Array.isArray(el.alignment.characters) && el.alignment.characters.join('') === spoken;
    const mapped = buildWords(text, el.alignment);
    if ('error' in mapped) {
      // Do not cache: a clip whose timings can't be mapped would desync the bubble.
      return Response.json({ error: 'Alignment does not match text', detail: mapped.error, exact_alignment: exactAlignment }, { status: 502 });
    }

    const bytes = base64ToBytes(el.audio_base64);
    const file = new File([bytes], `narration-${cacheKey.slice(0, 16)}.mp3`, { type: 'audio/mpeg' });
    const upload = await svc.integrations.Core.UploadFile({ file });
    const audioUrl = upload?.file_url;
    if (!audioUrl) return Response.json({ error: 'Upload returned no file_url' }, { status: 502 });

    await svc.entities.NarrationClip.create({
      cache_key: cacheKey,
      text,
      voice_id: VOICE_ID,
      model_id: MODEL_ID,
      audio_url: audioUrl,
      words: mapped.words,
      duration_s: mapped.duration_s,
      char_count: spoken.length,
      requested_by: user.email,
    });

    return Response.json({
      audio_url: audioUrl,
      words: mapped.words,
      duration_s: mapped.duration_s,
      cached: false,
      exact_alignment: exactAlignment,
    });
  } catch (error) {
    return Response.json({ error: (error as Error)?.message || String(error) }, { status: 500 });
  }
});