// Single source of truth for AI image generation style presets and prompt assembly.
// Consumed by useCardFormState.js (CardEditorModal), the only card-editing surface.

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

const DRAFT_QTYPE_LABELS = {
  multiple_choice: 'multiple choice',
  select_all: 'select all that apply',
  true_false: 'true/false statement',
  short_answer: 'short answer',
};

const toPlainText = (html, max) =>
  (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * Build the InvokeLLM request that drafts image-prompt concepts from card content.
 * Pure: returns { prompt, response_json_schema } and performs no I/O.
 * Drafts are style-neutral — buildAiPrompt() appends the style enhancer at generation time.
 *
 * @param {object} opts
 * @param {string}   opts.qType           Card question_type.
 * @param {string}   opts.clue            Question / clue text.
 * @param {string[]} [opts.correctAnswers] Correct answer(s); ignored for true_false.
 * @param {string[]} [opts.otherChoices]   Non-correct answer choices (decoys).
 * @param {string}   [opts.explanation]    Explanation HTML/markdown; stripped to plain text.
 * @param {string}   [opts.deckTitle]
 * @param {string}   [opts.deckDescription]
 * @param {boolean}  [opts.allowAnswer]     true = image may depict the correct answer.
 * @returns {{ prompt: string, response_json_schema: object }}
 */
export function buildImagePromptDraftRequest({
  qType,
  clue,
  correctAnswers = [],
  otherChoices = [],
  explanation = '',
  deckTitle = '',
  deckDescription = '',
  allowAnswer = false,
}) {
  const isTrueFalse = qType === 'true_false';
  const correct = correctAnswers.map((a) => (a || '').trim()).filter(Boolean);
  const others = otherChoices.map((a) => (a || '').trim()).filter(Boolean);
  const plainExplanation = toPlainText(explanation, 600);

  const contextLines = [
    `Deck: "${deckTitle || 'Untitled'}"`,
    deckDescription ? `Deck description: ${deckDescription}` : null,
    `Question type: ${DRAFT_QTYPE_LABELS[qType] || qType}`,
    `Question / clue: "${(clue || '').trim()}"`,
    !isTrueFalse && correct.length ? `Correct answer(s): ${correct.join(' | ')}` : null,
    !isTrueFalse && others.length ? `Other answer choices: ${others.join(' | ')}` : null,
    plainExplanation ? `Explanation: ${plainExplanation}` : null,
  ].filter(Boolean).join('\n');

  let answerRule;
  if (isTrueFalse) {
    answerRule =
      'This card is a true/false statement. Illustrate the subject of the statement without visually asserting whether it is true or false.';
  } else if (allowAnswer) {
    answerRule =
      'The image is shown while the student is answering and is intended to act as a visual clue, so it MAY depict the correct answer. Do NOT depict any of the other answer choices.';
  } else {
    answerRule =
      'The image is shown while the student is answering, so it must NOT reveal the answer. Do not depict, name, or visually identify the correct answer or any other answer choice. Illustrate the context the question is about — its setting, domain, or situation — so the image orients the student without giving the answer away.';
  }

  const prompt = `You write image descriptions for flashcard illustrations. An image generator receives your description plus a separate style instruction, so describe CONTENT ONLY: subject, setting, composition, and focal point. Do not mention art style, medium, color palette, lighting style, or rendering technique.

${contextLines}

${answerRule}

All three concepts must follow the rule above.

Write exactly 3 concepts, each taking a different approach:
1. Scene — a literal, concrete scene or setting.
2. Metaphor — a visual metaphor or analogy for the idea.
3. Schematic — a simplified cutaway, cross-section, or arrangement of objects that shows how the idea works, with no labels.

For each concept:
- label: 1–3 words naming the concept.
- prompt: one or two sentences, 20–40 words, concrete and visual. One clear focal subject, centered, composed for a 4:3 landscape frame. No text, letters, numbers, labels, or signage anywhere in the image.`;

  return {
    prompt,
    response_json_schema: {
      type: 'object',
      properties: {
        concepts: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string' },
              prompt: { type: 'string' },
            },
          },
        },
      },
    },
  };
}

/**
 * Normalize an InvokeLLM draft result into [{ label, prompt }], max 3, empties dropped.
 */
export function normalizeImagePromptDrafts(result) {
  const list = Array.isArray(result?.concepts) ? result.concepts : [];
  return list
    .map((c) => ({ label: (c?.label || '').trim(), prompt: (c?.prompt || '').trim() }))
    .filter((c) => c.prompt)
    .map((c, i) => ({ label: c.label || `Concept ${i + 1}`, prompt: c.prompt }))
    .slice(0, 3);
}