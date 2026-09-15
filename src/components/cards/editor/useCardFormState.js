import { useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { computeCardDifficulty } from '@/lib/computeCardDifficulty';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { STYLE_PRESETS, buildAiPrompt } from '@/lib/aiImagePresets';

const parseTags = (str) => str.split(',').map((t) => t.trim()).filter(Boolean);

const parseCorrectAnswers = (str) => str ? str.split('|').map(s => s.trim()).filter(Boolean) : [];
const joinCorrectAnswers = (arr) => arr.join('|');

/**
 * useCardFormState — single source of truth for the unified card editor.
 * Seeds from `card` in edit mode, or empty (deck-aware) defaults in create mode.
 * Returns all fields, handlers, derived values, and a buildSaveData() builder.
 */
export function useCardFormState({ mode, card, deck, activeCards }) {
  const qc = useQueryClient();
  const isCreate = mode === 'create';
  const initQType = card?.question_type || 'multiple_choice';
  const initCorrect = parseCorrectAnswers(card?.correct_answers || card?.correct_answer || '');

  // Question type + clue
  const [qType, setQType] = useState(initQType);
  const [clue, setClue] = useState(card?.clue || '');

  // Short answer
  const [canonicalAnswer, setCanonicalAnswer] = useState(card?.canonical_answer || '');
  const [acceptedVariants, setAcceptedVariants] = useState(card?.accepted_variants || []);
  const [newVariant, setNewVariant] = useState('');
  const [gradingGuidance, setGradingGuidance] = useState(card?.grading_guidance || '');
  const [testResponse, setTestResponse] = useState('');
  const [testVerdict, setTestVerdict] = useState(null);
  const [testGrading, setTestGrading] = useState(false);

  // Answer bank (multiple_choice / select_all / true_false)
  const [choicesList, setChoicesList] = useState(() => {
    if (card?.choices?.length) return card.choices;
    if (initQType === 'true_false') return ['True', 'False'];
    return ['', '', '', ''];
  });
  const [correctSet, setCorrectSet] = useState(() => new Set(initCorrect.map(s => s.trim())));

  // Explanation
  const [explanation, setExplanation] = useState(card?.explanation || '');

  // Image
  const [imageUrl, setImageUrl] = useState(card?.image_url || '');
  const [originalImageUrl, setOriginalImageUrl] = useState(card?.image_original_url || null);
  const [focalPoint, setFocalPoint] = useState(card?.image_focal_point || (card?.image_url ? { x: 50, y: 50 } : null));
  const [imageFit, setImageFit] = useState(card?.image_fit || 'cover');

  // Tags
  const [tags, setTags] = useState(card?.tags || []);

  // Difficulty
  const [pointValue, setPointValue] = useState(card?.point_value ?? 20);
  const [difficultyTier, setDifficultyTier] = useState(card?.difficulty_tier ?? null);
  const [difficultyOverridden, setDifficultyOverridden] = useState(card?.difficulty_overridden ?? false);
  const [difficultyReason, setDifficultyReason] = useState('');
  const [recomputingDifficulty, setRecomputingDifficulty] = useState(false);

  // AI image
  const [aiImagePrompt, setAiImagePrompt] = useState('');
  const [aiImageStyle, setAiImageStyle] = useState('pixel_art');
  const [aiImageHumor, setAiImageHumor] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);

  // Image sub-panels
  const [showImageSearch, setShowImageSearch] = useState(false);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [showAiImageGen, setShowAiImageGen] = useState(false);
  const [showImageEditor, setShowImageEditor] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Add-to-pool prompt (shown after a fresh upload)
  const [poolPromptUrl, setPoolPromptUrl] = useState(null);
  const [poolTags, setPoolTags] = useState('');
  const [addingToPool, setAddingToPool] = useState(false);

  // AI helpers
  const [suggestingCard, setSuggestingCard] = useState(false);
  const [generatingDecoys, setGeneratingDecoys] = useState(false);
  const [suggestingTags, setSuggestingTags] = useState(false);
  const [generatingExplanation, setGeneratingExplanation] = useState(false);

  const fileRef = useRef(null);
  const previewImgRef = useRef(null);
  const focalDragRef = useRef(null);
  const [draggingPreview, setDraggingPreview] = useState(false);
  const quillRef = useRef(null);

  // ── Derived ──────────────────────────────────────────────────────────────
  const isShortAnswer = qType === 'short_answer';
  const isTrueFalse = qType === 'true_false';
  const isSelectAll = qType === 'select_all';
  const isMultipleChoice = qType === 'multiple_choice';
  const usesBank = !isShortAnswer; // multiple_choice + select_all + true_false

  const filledChoices = choicesList.map(c => c.trim()).filter(Boolean);
  const correctFilled = filledChoices.filter(c => correctSet.has(c));

  const imageSeed = isShortAnswer
    ? canonicalAnswer.trim()
    : (correctFilled[0] || filledChoices[0] || '');

  const canSave = isShortAnswer
    ? canonicalAnswer.trim().length > 0
    : (filledChoices.length >= 2 && correctFilled.length >= 1 && (!isSelectAll || correctFilled.length >= 2));

  // ── Dirty tracking (edit mode) ────────────────────────────────────────────
  const isDirty = (() => {
    if (isCreate) return false;
    const origChoices = card?.choices?.length ? card.choices : (initQType === 'true_false' ? ['True', 'False'] : ['', '', '', '']);
    const origCorrect = new Set(initCorrect);
    if (imageUrl !== (card?.image_url || '')) return true;
    if (JSON.stringify(focalPoint) !== JSON.stringify(card?.image_focal_point || (card?.image_url ? { x: 50, y: 50 } : null))) return true;
    if (imageFit !== (card?.image_fit || 'cover')) return true;
    if (qType !== initQType) return true;
    if (clue !== (card?.clue || '')) return true;
    if (explanation !== (card?.explanation || '')) return true;
    if (JSON.stringify(tags) !== JSON.stringify(card?.tags || [])) return true;
    if (JSON.stringify(choicesList) !== JSON.stringify(origChoices)) return true;
    if ([...correctSet].sort().join('|') !== [...origCorrect].sort().join('|')) return true;
    if (isShortAnswer && canonicalAnswer !== (card?.canonical_answer || '')) return true;
    if (pointValue !== (card?.point_value ?? 20)) return true;
    if (difficultyOverridden !== (card?.difficulty_overridden ?? false)) return true;
    if ((originalImageUrl || null) !== (card?.image_original_url || null)) return true;
    return false;
  })();

  // ── Difficulty recompute ─────────────────────────────────────────────────
  const recomputeDifficulty = async (qt, currentClue, currentCorrect) => {
    if (difficultyOverridden) return;
    setRecomputingDifficulty(true);
    try {
      const result = await computeCardDifficulty({
        question_type: qt,
        clue: currentClue,
        correct_answer: currentCorrect,
        concept_id: card?.concept_id || null,
      });
      setPointValue(result.point_value);
      setDifficultyTier(result.difficulty_tier);
      setDifficultyReason(result._reason);
    } catch { /* keep existing */ }
    setRecomputingDifficulty(false);
  };

  // ── Question type change ──────────────────────────────────────────────────
  const handleQTypeChange = (val) => {
    setQType(val);
    if (val === 'true_false') {
      setChoicesList(['True', 'False']);
      setCorrectSet(new Set());
    } else if (qType === 'true_false') {
      setChoicesList(['', '', '', '']);
      setCorrectSet(new Set());
    } else if (val === 'multiple_choice' && correctSet.size > 1) {
      const first = choicesList.map(c => c.trim()).find(c => correctSet.has(c));
      setCorrectSet(new Set(first ? [first] : []));
    }
    if (!difficultyOverridden) {
      const firstCorrect = Array.from(correctSet)[0] || '';
      recomputeDifficulty(val, clue, firstCorrect);
    }
  };

  // ── Choices ──────────────────────────────────────────────────────────────
  const updateChoice = (i, val) => {
    setChoicesList(prev => {
      const next = [...prev];
      if (correctSet.has(next[i].trim())) {
        const ns = new Set(correctSet);
        ns.delete(next[i].trim());
        if (val.trim()) ns.add(val.trim());
        setCorrectSet(ns);
      }
      next[i] = val;
      return next;
    });
  };

  const addChoice = () => {
    if (choicesList.length < 6) setChoicesList(prev => [...prev, '']);
  };

  const removeChoice = (i) => {
    if (choicesList.length <= 2) return;
    const removed = choicesList[i].trim();
    if (removed) setCorrectSet(cs => { const n = new Set(cs); n.delete(removed); return n; });
    setChoicesList(prev => prev.filter((_, idx) => idx !== i));
  };

  const toggleCorrect = (choice) => {
    const t = choice.trim();
    if (!t) return;
    setCorrectSet(prev => {
      const n = new Set(prev);
      if (isSelectAll) {
        n.has(t) ? n.delete(t) : n.add(t);
      } else {
        n.clear();
        n.add(t);
      }
      return n;
    });
  };

  const generateDecoys = async () => {
    const correctList = Array.from(correctSet);
    if (!correctList.length) { toast.error('Mark at least one correct answer first'); return; }
    setGeneratingDecoys(true);
    try {
      const needed = Math.max(1, 5 - choicesList.filter(c => c.trim()).length);
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Generate ${needed} plausible but incorrect answer choices (decoys) for a flashcard where the correct answer is "${correctList.join(', ')}". Return only the decoy words/phrases as a JSON array of strings. No explanations.`,
        response_json_schema: { type: 'object', properties: { decoys: { type: 'array', items: { type: 'string' } } } }
      });
      const decoys = result?.decoys || [];
      setChoicesList(prev => {
        const next = [...prev];
        let di = 0;
        for (let i = 0; i < next.length && di < decoys.length; i++) {
          if (!next[i].trim()) next[i] = decoys[di++];
        }
        while (next.length < 6 && di < decoys.length) next.push(decoys[di++]);
        return next.slice(0, 6);
      });
      toast.success('Decoys generated');
    } catch { toast.error('Could not generate decoys'); }
    setGeneratingDecoys(false);
  };

  // ── Image ─────────────────────────────────────────────────────────────────
  const validateImageFile = (file) => {
    if (file.size < 10 * 1024) { toast.error('Image is too small. Please upload at least 10 KB.'); return false; }
    if (file.size > 10 * 1024 * 1024) { toast.error('Image is too large. Maximum size is 10 MB.'); return false; }
    return true;
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!validateImageFile(file)) { e.target.value = ''; return; }
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setImageUrl(file_url);
      setOriginalImageUrl(null);
      setFocalPoint({ x: 50, y: 50 });
      setImageFit('cover');
      setPoolPromptUrl(file_url);
      setPoolTags('');
    } catch { toast.error('Upload failed'); }
    setUploading(false);
    e.target.value = '';
  };

  const dismissPoolPrompt = () => {
    setPoolPromptUrl(null);
    setPoolTags('');
  };

  const addToPool = async () => {
    if (!poolPromptUrl) return;
    setAddingToPool(true);
    try {
      await base44.entities.ImagePool.create({
        image_url: poolPromptUrl,
        tags: parseTags(poolTags),
      });
      qc.invalidateQueries(['image-pool']);
      toast.success('Added to image pool');
      dismissPoolPrompt();
    } catch {
      toast.error('Could not add to pool');
    }
    setAddingToPool(false);
  };

  const handleGenerateAiImage = async () => {
    if (!aiImagePrompt.trim()) { toast.error('Enter a description first'); return; }
    setGeneratingImage(true);
    try {
      const fullPrompt = buildAiPrompt({
        prompt: aiImagePrompt,
        styleKey: aiImageStyle,
        humor: aiImageHumor,
        wordsToExclude: usesBank ? filledChoices : [canonicalAnswer],
      });
      const { url } = await base44.integrations.Core.GenerateImage({ prompt: fullPrompt });
      setImageUrl(url);
      setOriginalImageUrl(null);
      setFocalPoint({ x: 50, y: 50 });
      setShowAiImageGen(false);
      setPoolPromptUrl(null);
      toast.success('Image generated!');
    } catch { toast.error('Image generation failed'); }
    setGeneratingImage(false);
  };

  const buildAiPromptPrefill = () => {
    const correct = Array.from(correctSet)[0] || canonicalAnswer || '';
    const plainExplanation = explanation ? explanation.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) : '';
    const parts = [clue, correct, plainExplanation].filter(Boolean);
    return parts.length ? parts.join(' — ') : '';
  };

  const openAiImageGen = () => {
    if (!aiImagePrompt) setAiImagePrompt(buildAiPromptPrefill());
    setShowAiImageGen(v => !v);
    setShowImageSearch(false);
    setShowImagePicker(false);
  };

  // Focal-point drag-to-reposition
  const beginFocalDrag = (e) => {
    if (imageFit !== 'cover' || !imageUrl) return;
    const wrap = e.currentTarget;
    const img = previewImgRef.current;
    if (!img || !img.naturalWidth) return;
    const cW = wrap.clientWidth, cH = wrap.clientHeight;
    const scale = Math.max(cW / img.naturalWidth, cH / img.naturalHeight);
    const ovX = img.naturalWidth * scale - cW;
    const ovY = img.naturalHeight * scale - cH;
    focalDragRef.current = {
      startX: e.clientX, startY: e.clientY,
      startFocal: { ...(focalPoint || { x: 50, y: 50 }) },
      ovX, ovY,
    };
    setDraggingPreview(true);
    wrap.setPointerCapture(e.pointerId);
  };

  const moveFocalDrag = (e) => {
    const d = focalDragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    const clamp = (v) => Math.max(0, Math.min(100, Math.round(v)));
    setFocalPoint({
      x: d.ovX > 0.5 ? clamp(d.startFocal.x - (dx / d.ovX) * 100) : d.startFocal.x,
      y: d.ovY > 0.5 ? clamp(d.startFocal.y - (dy / d.ovY) * 100) : d.startFocal.y,
    });
  };

  const endFocalDrag = () => {
    focalDragRef.current = null;
    setDraggingPreview(false);
  };

  // ── AI suggest whole card ─────────────────────────────────────────────────
  const handleAiSuggest = async () => {
    const existingAnswers = activeCards.map(c => c.correct_answers || c.correct_answer).filter(Boolean).slice(0, 40);
    setSuggestingCard(true);
    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `You are helping build a flashcard deck titled "${deck?.title || 'Untitled'}".
${deck?.description ? `Deck description: ${deck.description}` : ''}
Existing card answers: ${existingAnswers.join(', ') || '(none yet)'}

Suggest ONE new flashcard that fits this deck and is NOT already covered.
Return:
- question: a single sentence written question / clue
- answer: the correct answer (one short phrase)
- image_prompt: a 10-15 word description of an image that would illustrate this card (no text in image)`,
        response_json_schema: {
          type: 'object',
          properties: {
            question: { type: 'string' },
            answer: { type: 'string' },
            image_prompt: { type: 'string' },
          }
        }
      });
      if (result?.answer) {
        setClue(result.question || '');
        setAiImagePrompt(result.image_prompt || result.answer || '');
        if (isShortAnswer) {
          setCanonicalAnswer(result.answer);
        } else if (isTrueFalse) {
          const ans = ['True', 'False'].includes(result.answer) ? result.answer : 'True';
          setCorrectSet(new Set([ans]));
        } else {
          setChoicesList(prev => {
            const next = [...prev];
            next[0] = result.answer;
            return next;
          });
          setCorrectSet(new Set([result.answer]));
        }
      } else {
        toast.error('Could not generate a suggestion');
      }
    } catch { toast.error('Could not generate a suggestion'); }
    setSuggestingCard(false);
  };

  // ── Tags ──────────────────────────────────────────────────────────────────
  const QUESTION_TYPE_TAGS = ['vocabulary', 'dates', 'people', 'places'];

  const suggestTags = async () => {
    const correctList = Array.from(correctSet);
    const cardText = [clue, ...correctList, ...choicesList].filter(Boolean).join(' | ');
    if (!cardText.trim()) { toast.error('Add some card content first'); return; }
    setSuggestingTags(true);
    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Analyze this flashcard content and classify it into one or more of these categories: vocabulary, dates, people, places.\n\nCard content: ${cardText}\n\nReturn only the matching categories from the list above. Do not invent new categories.`,
        response_json_schema: { type: 'object', properties: { tags: { type: 'array', items: { type: 'string', enum: QUESTION_TYPE_TAGS } } } }
      });
      const suggested = (result?.tags || []).filter(t => QUESTION_TYPE_TAGS.includes(t));
      if (suggested.length) {
        setTags(prev => [...new Set([...prev, ...suggested])]);
        toast.success(`Added: ${suggested.join(', ')}`);
      } else {
        toast.info('No category tags could be determined');
      }
    } catch { toast.error('Could not suggest tags'); }
    setSuggestingTags(false);
  };

  // ── Explanation ────────────────────────────────────────────────────────────
  const handleGenerateExplanation = async () => {
    const correctList = Array.from(correctSet);
    if (!correctList.length && !clue.trim()) { toast.error('Add a question or correct answer first'); return; }
    setGeneratingExplanation(true);
    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Write a concise educational explanation (2–4 sentences) for a flashcard.\nQuestion: ${clue || '(none)'}\nCorrect answer(s): ${correctList.join(', ') || canonicalAnswer}\nExplain why the answer is correct and add any helpful context. Return plain HTML suitable for a rich text editor (use <b>, <i>, <ul>, <li> as needed — no <html>/<body> tags).`,
      });
      setExplanation(result || '');
      toast.success('Explanation generated');
    } catch { toast.error('Could not generate explanation'); }
    setGeneratingExplanation(false);
  };

  // ── Test grading (short answer) ────────────────────────────────────────────
  const handleTestGrading = async () => {
    setTestGrading(true);
    setTestVerdict(null);
    const norm = s => s.toLowerCase().trim().replace(/\s+/g, ' ').replace(/[^\w\s]/g, '').replace(/^(a|an|the)\s+/, '');
    const t1 = [canonicalAnswer, ...acceptedVariants].map(norm).some(t => t && t === norm(testResponse));
    if (t1) {
      setTestVerdict({ tier: 1, verdict: 'correct', value: 1, reason: 'Exact normalized match' });
      setTestGrading(false);
      return;
    }
    try {
      const prompt = `You are a strict exam grader. Grade the student's response ONLY against the provided rubric.\n\nQuestion/Clue: ${clue || '(none)'}\nCanonical answer: ${canonicalAnswer}\nAccepted variants: ${acceptedVariants.join(', ') || '(none)'}\nGrading guidance: ${gradingGuidance || '(none)'}\nStudent response: ${testResponse}\n\nRespond ONLY with valid JSON (no markdown, no preamble):\n{"verdict":"correct"|"partial"|"incorrect","value":<number 0-1>,"reason":"<one sentence>"}`;
      const raw = await base44.integrations.Core.InvokeLLM({ prompt });
      const cleaned = (typeof raw === 'string' ? raw : JSON.stringify(raw)).replace(/```[a-z]*\n?/g, '').trim();
      const r = JSON.parse(cleaned);
      setTestVerdict({ tier: 2, ...r });
    } catch {
      setTestVerdict({ tier: 2, verdict: 'error', value: 0, reason: 'AI grading unavailable' });
    }
    setTestGrading(false);
  };

  // ── Build save payload ────────────────────────────────────────────────────
  const buildSaveData = () => {
    const filled = isShortAnswer ? [] : choicesList.map(c => c.trim()).filter(Boolean);
    const correctList = isShortAnswer ? [] : Array.from(correctSet).filter(c => filled.includes(c.trim()));
    const correct_answers = isShortAnswer ? canonicalAnswer.trim() : joinCorrectAnswers(correctList);
    return {
      image_url: imageUrl,
      image_focal_point: focalPoint,
      image_fit: imageFit,
      image_original_url: originalImageUrl || null,
      correct_answers,
      correct_answer: correctList[0] || canonicalAnswer.trim(),
      choices: isTrueFalse ? ['True', 'False'] : isShortAnswer ? [] : filled,
      question_type: qType,
      clue: clue.trim(),
      explanation,
      tags,
      point_value: pointValue,
      difficulty_tier: difficultyTier ?? Math.round(pointValue / 10),
      difficulty_overridden: difficultyOverridden,
      ...(isShortAnswer && {
        canonical_answer: canonicalAnswer.trim(),
        accepted_variants: acceptedVariants.filter(Boolean),
        grading_guidance: gradingGuidance.trim(),
      }),
    };
  };

  return {
    // identity
    isCreate, card, deck,
    // question type
    qType, handleQTypeChange,
    isShortAnswer, isTrueFalse, isSelectAll, isMultipleChoice, usesBank,
    // clue
    clue, setClue,
    // short answer
    canonicalAnswer, setCanonicalAnswer,
    acceptedVariants, setAcceptedVariants, newVariant, setNewVariant,
    gradingGuidance, setGradingGuidance,
    testResponse, setTestResponse, testVerdict, testGrading, handleTestGrading,
    // bank
    choicesList, correctSet, updateChoice, addChoice, removeChoice, toggleCorrect,
    filledChoices, correctFilled,
    // explanation
    explanation, setExplanation, quillRef, handleGenerateExplanation, generatingExplanation,
    // image
    imageUrl, setImageUrl, originalImageUrl, focalPoint, setFocalPoint,
    imageFit, setImageFit,
    fileRef, previewImgRef, draggingPreview, beginFocalDrag, moveFocalDrag, endFocalDrag,
    handleImageUpload, uploading,
    aiImagePrompt, setAiImagePrompt, aiImageStyle, setAiImageStyle, aiImageHumor, setAiImageHumor,
    generatingImage, handleGenerateAiImage, openAiImageGen,
    showImageSearch, setShowImageSearch, showImagePicker, setShowImagePicker,
    showAiImageGen, setShowAiImageGen, showImageEditor, setShowImageEditor,
    poolPromptUrl, poolTags, setPoolTags, addingToPool, addToPool, dismissPoolPrompt,
    // tags
    tags, setTags, suggestTags, suggestingTags,
    // difficulty
    pointValue, setPointValue, difficultyTier, difficultyOverridden, setDifficultyOverridden,
    difficultyReason, recomputeDifficulty, recomputingDifficulty,
    // ai suggest
    suggestingCard, handleAiSuggest,
    // decoys
    generatingDecoys, generateDecoys,
    // derived
    imageSeed, canSave, isDirty,
    buildSaveData,
    // style presets (re-exported for convenience)
    STYLE_PRESETS,
  };
}