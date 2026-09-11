// Single source of truth for AI image generation style presets and prompt assembly.
// Consumed by CardEditor.jsx and QuickAddCardModal.jsx so both panels produce
// visually consistent images from one definition.

export const STYLE_PRESETS = {
  pixel_art: {
    label: 'Old School',
    emoji: '🕹️',
    enhancer:
      'Mid-century retro illustration in vintage halftone print style. No gradients or modern shading. Technique: visible halftone dot texture (Ben-Day dots) throughout, giving a printed-on-cheap-paper look. Bold black ink outlines, simplified shapes, slightly off-register printing feel. Matte, aged quality as if scanned from a vintage magazine or technical brochure.',
  },
  oil_painting: {
    label: 'Oil Painting',
    emoji: '🖼️',
    enhancer:
      'Old Master realism in the Dutch Golden Age tradition. Technique: layered glazing over a warm umber underpainting, visible impasto highlights on lit edges, fine bristle texture in shadow areas. Lighting: single-source chiaroscuro — strong directional light from the upper left, deep transparent shadows, museum-lit subject against a dark receding ground. Palette: deep umbers, ochres, and burnt sienna with restrained jewel-toned accents; smooth tonal transitions. Finish: varnished, luminous, archival oil-on-canvas feel.',
  },
  minimalist: {
    label: 'Minimalist',
    emoji: '◻️',
    enhancer:
      'Soft modern editorial illustration. Technique: subtle tonal layering with no harsh outlines, rounded organic shapes, gentle hand-placed gradients between two or three tones. Lighting: soft even diffuse light, no sharp highlights or cast shadows. Palette: muted pastel range — dusty rose, sage, warm beige, soft slate — with one slightly deeper accent for the subject. Finish: friendly, breathable, magazine-editorial feel; generous negative space; clean but not sterile.',
  },
  watercolor: {
    label: 'Watercolor',
    emoji: '🎨',
    enhancer:
      'Traditional botanical-study watercolor. Technique: wet-on-wet washes with granulating pigment settling into paper texture, delicate ink contour lines defining form, dry-brush detail on focal areas. Lighting: soft natural daylight, transparent luminous shadows letting the paper glow through. Palette: precise naturalistic color — botanical greens, muted earth tones, soft floral pinks — on warm cream paper. Finish: crisp scientific-illustration clarity with gentle pigment blooms at the edges.',
  },
};

/**
 * Assemble the full prompt sent to GenerateImage.
 *
 * @param {object} opts
 * @param {string} opts.prompt       The author's image description.
 * @param {string} opts.styleKey     Key into STYLE_PRESETS.
 * @param {boolean} [opts.humor]     Append a subtle whimsical-detail clause.
 * @param {string[]} [opts.wordsToExclude] Answer-choice words to suppress as text.
 * @returns {string} The full prompt string.
 */
export function buildAiPrompt({ prompt, styleKey, humor = false, wordsToExclude = [] }) {
  const styleEnhancer = STYLE_PRESETS[styleKey]?.enhancer || '';
  const humorEnhancer = humor
    ? ', with a subtle whimsical or humorous detail that adds charm without distracting from the main subject'
    : '';

  const uniqueWords = [
    ...new Set(
      (wordsToExclude || [])
        .map((w) => w.trim())
        .filter(Boolean)
        .join(' ')
        .split(/\s+/)
        .map((w) => w.replace(/[^a-zA-Z0-9]/g, ''))
        .map((w) => w.toLowerCase())
        .filter((w) => w.length > 2)
    ),
  ];
  const noTextInstruction = uniqueWords.length
    ? `. Do not render any text, words, or labels in the image — especially not the words: ${uniqueWords.join(', ')}`
    : '. Do not render any text or words in the image';

  return `${(prompt || '').trim()}, ${styleEnhancer}${humorEnhancer}${noTextInstruction}. Compose for a 4:3 landscape frame. Keep all important subject matter centered and well within the frame, away from the edges. Leave generous safe margins on all sides.`;
}