import { useState, useRef, useEffect, useCallback } from 'react';
import { Plus, X, Wand2, Image as ImageIcon, Loader2, Pencil, Search, Sparkles, Tags, Zap, RotateCcw } from 'lucide-react';
import { computeCardDifficulty } from '@/lib/computeCardDifficulty';
import InfoTooltip from './InfoTooltip';
import ImageEditor from './ImageEditor';
import ImageSearchPanel from './ImageSearchPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import ReactQuill from 'react-quill';
import TagInput from './TagInput';
import ImagePickerFromDeck from './ImagePickerFromDeck';
import { cn } from '@/lib/utils';
import ConceptsTab from './ConceptsTab';
import CardNoteEditor from './CardNoteEditor';
import CardThumbnail from './CardThumbnail';
import MathButton from './MathInputPopover';

// Parse pipe-delimited correct_answers string into array
const parseCorrectAnswers = (str) => str ? str.split('|').map(s => s.trim()).filter(Boolean) : [];
const joinCorrectAnswers = (arr) => arr.join('|');

export default function CardEditor({ card, onSave, onCancel, onDirtyChange, allTags = [], saveRef }) {
  const [activeTab, setActiveTab] = useState('edit');
  const initQType = card?.question_type || 'multiple_choice';
  const initCorrectAnswers = parseCorrectAnswers(card?.correct_answers || card?.correct_answer || '');

  const [qType, setQType] = useState(initQType);
  const [canonicalAnswer, setCanonicalAnswer] = useState(card?.canonical_answer || '');
  const [acceptedVariants, setAcceptedVariants] = useState(card?.accepted_variants || []);
  const [gradingGuidance, setGradingGuidance] = useState(card?.grading_guidance || '');
  const [newVariant, setNewVariant] = useState('');
  const [testResponse, setTestResponse] = useState('');
  const [testVerdict, setTestVerdict] = useState(null);
  const [testGrading, setTestGrading] = useState(false);
  const [imageUrl, setImageUrl] = useState(card?.image_url || '');

  // All choices (including correct ones)
  const [allChoicesList, setAllChoicesList] = useState(() => {
    if (card?.choices?.length) return card.choices;
    if (initQType === 'true_false') return ['True', 'False'];
    return ['', '', '', ''];
  });

  // Which choices are marked correct (a Set of trimmed choice strings)
  const [correctSet, setCorrectSet] = useState(() => new Set(initCorrectAnswers.map(s => s.trim())));

  const [focalPoint, setFocalPoint] = useState(card?.image_focal_point || (card?.image_url ? { x: 50, y: 50 } : null));
  const [imageFit, setImageFit] = useState(card?.image_fit || 'cover');
  const [clue, setClue] = useState(card?.clue || '');
  const [explanation, setExplanation] = useState(card?.explanation || '');
  const [tags, setTags] = useState(card?.tags || []);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generatingDecoys, setGeneratingDecoys] = useState(false);
  // Difficulty fields
  const [pointValue, setPointValue] = useState(card?.point_value ?? 20);
  const [difficultyTier, setDifficultyTier] = useState(card?.difficulty_tier ?? null);
  const [difficultyOverridden, setDifficultyOverridden] = useState(card?.difficulty_overridden ?? false);
  const [recomputingDifficulty, setRecomputingDifficulty] = useState(false);
  const [difficultyReason, setDifficultyReason] = useState('');
  const [suggestingTags, setSuggestingTags] = useState(false);
  const [generatingExplanation, setGeneratingExplanation] = useState(false);
  const [showImageEditor, setShowImageEditor] = useState(false);
  const [showImageSearch, setShowImageSearch] = useState(false);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [showAiImageGen, setShowAiImageGen] = useState(false);
  const [aiImagePrompt, setAiImagePrompt] = useState('');
  const [aiImageStyle, setAiImageStyle] = useState('pixel_art');
  const [generatingImage, setGeneratingImage] = useState(false);
  const [aiImageHumor, setAiImageHumor] = useState(false);

  const fileRef = useRef();
  const quillRef = useRef(null);

  // Bonus question state


  // Dirty tracking — compare current state to original card values
  const prevDirtyRef = useRef(false);
  const isDirty = (() => {
    const origChoices = card?.choices?.length ? card.choices : (initQType === 'true_false' ? ['True', 'False'] : ['', '', '', '']);
    const origCorrect = new Set(parseCorrectAnswers(card?.correct_answers || card?.correct_answer || ''));
    if (imageUrl !== (card?.image_url || '')) return true;
    if (JSON.stringify(focalPoint) !== JSON.stringify(card?.image_focal_point || (card?.image_url ? { x: 50, y: 50 } : null))) return true;
    if (imageFit !== (card?.image_fit || 'cover')) return true;
    if (qType !== initQType) return true;
    if (clue !== (card?.clue || '')) return true;
    if (explanation !== (card?.explanation || '')) return true;
    if (JSON.stringify(tags) !== JSON.stringify(card?.tags || [])) return true;
    if (JSON.stringify(allChoicesList) !== JSON.stringify(origChoices)) return true;
    if ([...correctSet].sort().join('|') !== [...origCorrect].sort().join('|')) return true;
    return false;
  })();
  if (isDirty !== prevDirtyRef.current) {
    prevDirtyRef.current = isDirty;
    onDirtyChange?.(isDirty);
  }

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
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setImageUrl(file_url);
    setFocalPoint({ x: 50, y: 50 });
    setImageFit('cover');
    setUploading(false);
  };

  // ── Difficulty recompute (called when qType changes, if not overridden) ──
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
    } catch { /* keep existing values */ }
    setRecomputingDifficulty(false);
  };

  // ── Question type change ──────────────────────────────────────────────────
  const handleQTypeChange = (val) => {
    setQType(val);
    setCorrectSet(new Set());
    if (val === 'true_false') {
      setAllChoicesList(['True', 'False']);
    } else if (allChoicesList[0] === 'True' && allChoicesList[1] === 'False') {
      setAllChoicesList(['', '', '', '']);
    }
    // Recompute difficulty if not manually overridden
    if (!difficultyOverridden) {
      const firstCorrect = Array.from(correctSet)[0] || '';
      recomputeDifficulty(val, clue, firstCorrect);
    }
  };

  // ── Choices management ────────────────────────────────────────────────────
  const updateChoice = (i, val) => {
    const next = [...allChoicesList];
    if (correctSet.has(next[i].trim())) {
      const ns = new Set(correctSet);
      ns.delete(next[i].trim());
      if (val.trim()) ns.add(val.trim());
      setCorrectSet(ns);
    }
    next[i] = val;
    setAllChoicesList(next);
  };

  const addChoice = () => {
    if (allChoicesList.length < 6) setAllChoicesList([...allChoicesList, '']);
  };

  const removeChoice = (i) => {
    const val = allChoicesList[i];
    const ns = new Set(correctSet);
    ns.delete(val.trim());
    setCorrectSet(ns);
    setAllChoicesList(allChoicesList.filter((_, idx) => idx !== i));
  };

  const toggleCorrect = (choice) => {
    if (!choice.trim()) return;
    const trimmed = choice.trim();
    const ns = new Set(correctSet);
    if (qType === 'select_all') {
      if (ns.has(trimmed)) ns.delete(trimmed);
      else ns.add(trimmed);
    } else {
      ns.clear();
      ns.add(trimmed);
    }
    setCorrectSet(ns);
  };

  const generateDecoys = async () => {
    const correctList = Array.from(correctSet);
    if (!correctList.length) { toast.error('Mark at least one correct answer first'); return; }
    setGeneratingDecoys(true);
    const needed = Math.max(1, 5 - allChoicesList.filter(c => c.trim()).length);
    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `Generate ${needed} plausible but incorrect answer choices (decoys) for a flashcard where the correct answer is "${correctList.join(', ')}". Return only the decoy words/phrases as a JSON array of strings. No explanations.`,
      response_json_schema: { type: 'object', properties: { decoys: { type: 'array', items: { type: 'string' } } } }
    });
    const decoys = result?.decoys || [];
    const next = [...allChoicesList];
    let di = 0;
    for (let i = 0; i < next.length && di < decoys.length; i++) {
      if (!next[i].trim()) next[i] = decoys[di++];
    }
    while (next.length < 6 && di < decoys.length) next.push(decoys[di++]);
    setAllChoicesList(next.slice(0, 6));
    setGeneratingDecoys(false);
    toast.success('Decoys generated');
  };

  const STYLE_PRESETS = {
    pixel_art:    { label: 'Old School',   enhancer: 'Mid-century retro illustration in vintage halftone print style. No gradients or modern shading. Technique: visible halftone dot texture (Ben-Day dots) throughout, giving a printed-on-cheap-paper look. Bold black ink outlines, simplified shapes, slightly off-register printing feel. Matte, aged quality as if scanned from a vintage magazine or technical brochure.', emoji: '🕹️' },
    oil_painting: { label: 'Oil Painting', enhancer: 'classic oil painting style, visible brushstrokes, rich textures, warm lighting', emoji: '🖼️' },
    minimalist:   { label: 'Minimalist',   enhancer: 'minimalist vector art, clean flat design, simple shapes, limited color palette', emoji: '◻️' },
    watercolor:   { label: 'Watercolor',   enhancer: 'soft watercolor painting, ethereal feel, gentle color bleeds, artistic style', emoji: '🎨' },
  };

  const buildAiPromptPrefill = () => {
    const correct = Array.from(correctSet)[0] || '';
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

  const handleGenerateAiImage = async () => {
    if (!aiImagePrompt.trim()) { toast.error('Enter a description first'); return; }
    setGeneratingImage(true);
    const styleEnhancer = STYLE_PRESETS[aiImageStyle]?.enhancer || '';
    const humorEnhancer = aiImageHumor ? ', with a subtle whimsical or humorous detail that adds charm without distracting from the main subject' : '';
    // Collect all unique words from all answer choices to exclude from appearing as text in the image
    const allWords = allChoicesList
      .map(c => c.trim())
      .filter(Boolean)
      .join(' ')
      .split(/\s+/)
      .map(w => w.replace(/[^a-zA-Z0-9]/g, ''))
      .filter(w => w.length > 2);
    const uniqueWords = [...new Set(allWords.map(w => w.toLowerCase()))];
    const noTextInstruction = uniqueWords.length
      ? `. Do not render any text, words, or labels in the image — especially not the words: ${uniqueWords.join(', ')}`
      : '. Do not render any text or words in the image';
    const fullPrompt = `${aiImagePrompt.trim()}, ${styleEnhancer}${humorEnhancer}${noTextInstruction}. Compose for a 4:3 landscape frame. Keep all important subject matter centered and well within the frame, away from the edges. Leave generous safe margins on all sides.`;
    const { url } = await base44.integrations.Core.GenerateImage({ prompt: fullPrompt });
    setImageUrl(url);
    setFocalPoint({ x: 50, y: 50 });
    setShowAiImageGen(false);
    setGeneratingImage(false);
    toast.success('Image generated!');
  };

  const handleSave = async () => {
    if (isShortAnswer) {
      if (!canonicalAnswer.trim()) { toast.error('Enter the canonical answer'); return; }
    } else {
      const filledChoices = allChoicesList.map(c => c.trim()).filter(Boolean);
      const correctList = Array.from(correctSet).filter(c => filledChoices.includes(c.trim()));
      if (correctList.length === 0) { toast.error('Mark at least one correct answer'); return; }
      if (filledChoices.length < 2) { toast.error('Add at least two choices'); return; }
      if (qType === 'select_all' && correctList.length < 2) {
        toast.error('Select All requires at least 2 correct answers'); return;
      }
    }

    const filledChoices = isShortAnswer ? [] : allChoicesList.map(c => c.trim()).filter(Boolean);
    const correctList = isShortAnswer ? [] : Array.from(correctSet).filter(c => filledChoices.includes(c.trim()));
    const correct_answers = isShortAnswer ? canonicalAnswer.trim() : joinCorrectAnswers(correctList);

    // If imageUrl is a base64 data URL (from cropping), upload it first
    let finalImageUrl = imageUrl;
    if (imageUrl && imageUrl.startsWith('data:')) {
      setSaving(true);
      const blob = await (await fetch(imageUrl)).blob();
      const file = new File([blob], 'edited-image.jpg', { type: 'image/jpeg' });
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      finalImageUrl = file_url;
      setSaving(false);
    }

    onSave({
      image_url: finalImageUrl,
      image_focal_point: focalPoint,
      image_fit: imageFit,
      correct_answers,
      correct_answer: correctList[0] || canonicalAnswer.trim(),
      choices: filledChoices,
      question_type: qType,
      clue,
      explanation,
      tags,
      point_value: pointValue,
      difficulty_tier: difficultyTier,
      difficulty_overridden: difficultyOverridden,
      ...(isShortAnswer && {
        canonical_answer: canonicalAnswer.trim(),
        accepted_variants: acceptedVariants.filter(Boolean),
        grading_guidance: gradingGuidance.trim(),
      }),
    });
  };

  // Expose save to parent via ref
  useEffect(() => {
    if (saveRef) saveRef.current = handleSave;
  });

  const QUESTION_TYPE_TAGS = ['vocabulary', 'dates', 'people', 'places'];

  const suggestTags = async () => {
    const correctList = Array.from(correctSet);
    const cardText = [clue, ...correctList, ...allChoicesList].filter(Boolean).join(' | ');
    if (!cardText.trim()) { toast.error('Add some card content first'); return; }
    setSuggestingTags(true);
    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `Analyze this flashcard content and classify it into one or more of these categories: vocabulary, dates, people, places.\n\nCard content: ${cardText}\n\nReturn only the matching categories from the list above. Do not invent new categories.`,
      response_json_schema: { type: 'object', properties: { tags: { type: 'array', items: { type: 'string', enum: ['vocabulary', 'dates', 'people', 'places'] } } } }
    });
    const suggested = (result?.tags || []).filter(t => QUESTION_TYPE_TAGS.includes(t));
    if (suggested.length) {
      setTags(prev => [...new Set([...prev, ...suggested])]);
      toast.success(`Added: ${suggested.join(', ')}`);
    } else {
      toast.info('No category tags could be determined');
    }
    setSuggestingTags(false);
  };

  const isTrueFalse = qType === 'true_false';
  const isSelectAll = qType === 'select_all';
  const isShortAnswer = qType === 'short_answer';

  return (
    <div className="space-y-5">

      {/* Tabs */}
      <div className="flex border-b border-border -mx-0 mb-1">
        {['edit', 'preview', 'concepts', 'note'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 transition-colors capitalize',
              activeTab === tab
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {tab === 'edit' ? 'Edit' : tab === 'preview' ? 'Preview' : tab === 'concepts' ? 'Concepts' : 'Note'}
          </button>
        ))}
      </div>

      {activeTab === 'preview' && (
        <div className="py-2">
          <CardThumbnail card={{
            ...card,
            image_url: imageUrl,
            image_focal_point: focalPoint,
            choices: allChoicesList.map(c => c.trim()).filter(Boolean),
            correct_answers: joinCorrectAnswers(Array.from(correctSet)),
            question_type: qType,
            clue,
          }} />
        </div>
      )}
      {activeTab === 'preview' && (
        <div className="sticky bottom-0 -mx-5 bg-card flex justify-end gap-2 px-5 pt-2 pb-4 border-t border-border mt-2">
          <Button variant="ghost" onClick={onCancel}>Close</Button>
        </div>
      )}
      {activeTab === 'concepts' && <ConceptsTab card={card} />}
      {activeTab === 'concepts' && (
        <div className="sticky bottom-0 -mx-5 bg-card flex justify-end gap-2 px-5 pt-2 pb-4 border-t border-border mt-2">
          <Button variant="ghost" onClick={onCancel}>Close</Button>
        </div>
      )}
      {activeTab === 'note' && <CardNoteEditor cardId={card?.id} />}
      {activeTab === 'note' && (
        <div className="sticky bottom-0 -mx-5 bg-card flex justify-end gap-2 px-5 pt-2 pb-4 border-t border-border mt-2">
          <Button variant="ghost" onClick={onCancel}>Close</Button>
        </div>
      )}
      {activeTab === 'edit' && <>

      {/* Question Type */}
      <div className="space-y-2">
        <Label>Question Type</Label>
        <Select value={qType} onValueChange={handleQTypeChange}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="multiple_choice">Multiple Choice</SelectItem>
            <SelectItem value="true_false">True / False</SelectItem>
            <SelectItem value="select_all">Select All That Apply</SelectItem>
            <SelectItem value="short_answer">Short Answer</SelectItem>
          </SelectContent>
        </Select>
        {isSelectAll && (
          <p className="text-xs text-muted-foreground">Mark all correct answers — students must select all of them to get full credit.</p>
        )}
        {isShortAnswer && (
          <p className="text-xs text-muted-foreground">Students type a free-text response; graded by exact match then AI fallback.</p>
        )}
      </div>

      {/* Short Answer Fields */}
      {isShortAnswer && (
        <div className="space-y-4 border border-border rounded-lg p-4 bg-accent/10">
          {/* Canonical answer */}
          <div className="space-y-1.5">
            <Label>Canonical Answer <span className="text-destructive">*</span></Label>
            <Input
              value={canonicalAnswer}
              onChange={e => setCanonicalAnswer(e.target.value)}
              placeholder="The single authoritative correct answer"
            />
          </div>

          {/* Accepted variants */}
          <div className="space-y-1.5">
            <Label>Accepted Variants <span className="text-xs text-muted-foreground font-normal">(optional)</span></Label>
            <div className="flex gap-2">
              <Input
                value={newVariant}
                onChange={e => setNewVariant(e.target.value)}
                placeholder="Add alternate acceptable answer…"
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); if (newVariant.trim()) { setAcceptedVariants(prev => [...prev, newVariant.trim()]); setNewVariant(''); } }
                }}
              />
              <Button type="button" variant="outline" size="sm" onClick={() => { if (newVariant.trim()) { setAcceptedVariants(prev => [...prev, newVariant.trim()]); setNewVariant(''); } }}>
                <Plus className="w-3.5 h-3.5" />
              </Button>
            </div>
            {acceptedVariants.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1">
                {acceptedVariants.map((v, i) => (
                  <span key={i} className="flex items-center gap-1 bg-secondary text-secondary-foreground px-2 py-0.5 rounded text-xs">
                    {v}
                    <button type="button" onClick={() => setAcceptedVariants(prev => prev.filter((_, idx) => idx !== i))}>
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Grading guidance */}
          <div className="space-y-1.5">
            <Label>Grading Guidance <span className="text-xs text-muted-foreground font-normal">(optional AI rubric)</span></Label>
            <Textarea
              value={gradingGuidance}
              onChange={e => setGradingGuidance(e.target.value)}
              placeholder='e.g. "Must mention both photosynthesis and chlorophyll for full credit; one alone is partial"'
              rows={2}
              className="resize-none text-sm"
            />
          </div>

          {/* Test grading preview */}
          <div className="space-y-1.5 border-t border-border pt-3">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Test Grading Preview</Label>
            <p className="text-xs text-muted-foreground">Type a sample response to see how the grader would score it.</p>
            <div className="flex gap-2">
              <Input
                value={testResponse}
                onChange={e => setTestResponse(e.target.value)}
                placeholder="Sample student response…"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!testResponse.trim() || testGrading || !canonicalAnswer.trim()}
                onClick={async () => {
                  setTestGrading(true);
                  setTestVerdict(null);
                  // Tier 1
                  const norm = s => s.toLowerCase().trim().replace(/\s+/g,' ').replace(/[^\w\s]/g,'').replace(/^(a|an|the)\s+/,'');
                  const t1 = [canonicalAnswer, ...acceptedVariants].map(norm).some(t => t && t === norm(testResponse));
                  if (t1) {
                    setTestVerdict({ tier: 1, verdict: 'correct', value: 1, reason: 'Exact normalized match' });
                    setTestGrading(false);
                    return;
                  }
                  // Tier 2: LLM
                  try {
                    const prompt = `You are a strict exam grader. Grade the student's response ONLY against the provided rubric.\n\nQuestion/Clue: ${clue || '(none)'}\nCanonical answer: ${canonicalAnswer}\nAccepted variants: ${acceptedVariants.join(', ') || '(none)'}\nGrading guidance: ${gradingGuidance || '(none)'}\nStudent response: ${testResponse}\n\nRespond ONLY with valid JSON (no markdown, no preamble):\n{"verdict":"correct"|"partial"|"incorrect","value":<number 0-1>,"reason":"<one sentence>"}`;
                    const raw = await base44.integrations.Core.InvokeLLM({ prompt });
                    const cleaned = (typeof raw === 'string' ? raw : JSON.stringify(raw)).replace(/\`\`\`[a-z]*\n?/g,'').trim();
                    const r = JSON.parse(cleaned);
                    setTestVerdict({ tier: 2, ...r });
                  } catch {
                    setTestVerdict({ tier: 2, verdict: 'error', value: 0, reason: 'AI grading unavailable' });
                  }
                  setTestGrading(false);
                }}
              >
                {testGrading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Test'}
              </Button>
            </div>
            {testVerdict && (
              <div className={cn('text-xs px-3 py-2 rounded border mt-1',
                testVerdict.verdict === 'correct' ? 'bg-green-50 border-green-200 text-green-800' :
                testVerdict.verdict === 'partial' ? 'bg-amber-50 border-amber-200 text-amber-800' :
                'bg-red-50 border-red-200 text-red-800'
              )}>
                <span className="font-semibold">
                  {testVerdict.verdict === 'correct' ? '✓ Correct' : testVerdict.verdict === 'partial' ? '~ Partial' : '✗ Incorrect'}
                </span>
                {' '}(Tier {testVerdict.tier}
                {testVerdict.value !== undefined ? `, score: ${testVerdict.value}` : ''})
                {testVerdict.reason && <span> — {testVerdict.reason}</span>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Image Upload */}
      <div className="space-y-2">
        <Label>Image</Label>
        <div
          onClick={() => fileRef.current?.click()}
          className="relative border-2 border-dashed border-border rounded-xl overflow-hidden cursor-pointer hover:border-primary/50 transition-colors"
          style={{ minHeight: 180 }}
        >
          {imageUrl ? (
              <div className="relative w-full h-48 overflow-hidden" style={{ backgroundColor: '#f3f4f6' }} onClick={(e) => e.stopPropagation()}>
                <img
                  src={imageUrl}
                  alt="card"
                  className="w-full h-48 pointer-events-none"
                  style={{
                    objectFit: imageFit,
                    objectPosition: imageFit === 'cover' && focalPoint ? `${focalPoint.x}% ${focalPoint.y}%` : 'center',
                  }}
                />
              </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-48 gap-2 text-muted-foreground">
              {uploading ? <Loader2 className="w-6 h-6 animate-spin" /> : <ImageIcon className="w-8 h-8" />}
              <span className="text-sm">{uploading ? 'Uploading…' : 'Click to upload image'}</span>
            </div>
          )}
          {imageUrl && (
            <>
              <button onClick={(e) => { e.stopPropagation(); setImageUrl(''); }} className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1 hover:bg-black/80">
                <X className="w-3.5 h-3.5" />
              </button>
              <button onClick={(e) => { e.stopPropagation(); setShowImageEditor(true); }} className="absolute top-2 left-2 bg-black/60 text-white rounded-full p-1 hover:bg-black/80">
                <Pencil className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
        <div className="flex items-center justify-between">
          <InfoTooltip text="Accepted: JPG, PNG, GIF, WebP · Min 10 KB · Max 10 MB" />
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => { setShowImagePicker(v => !v); setShowImageSearch(false); setShowAiImageGen(false); }} className="flex items-center gap-1 text-xs text-primary hover:underline">
              <ImageIcon className="w-3 h-3" /> Pick from decks
            </button>
            <button type="button" onClick={() => { setShowImageSearch(v => !v); setShowImagePicker(false); setShowAiImageGen(false); }} className="flex items-center gap-1 text-xs text-primary hover:underline">
              <Search className="w-3 h-3" /> Search Wikimedia
            </button>
            <button type="button" onClick={openAiImageGen} className="flex items-center gap-1 text-xs text-primary hover:underline">
              <Sparkles className="w-3 h-3" /> AI Generate
            </button>
          </div>
        </div>
        {showAiImageGen && (
          <div className="border border-border rounded-lg p-3 space-y-3 bg-accent/20">
            <p className="text-xs font-medium text-foreground">Generate an image with AI</p>
            <Textarea
              value={aiImagePrompt}
              onChange={e => setAiImagePrompt(e.target.value)}
              placeholder="Describe what the image should show…"
              rows={2}
              className="resize-none text-sm"
            />
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Style</p>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(STYLE_PRESETS).map(([key, { label, emoji }]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setAiImageStyle(key)}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 rounded-md border text-sm transition-colors text-left',
                      aiImageStyle === key
                        ? 'border-primary bg-primary/10 text-primary font-medium'
                        : 'border-border hover:border-primary/50 text-muted-foreground'
                    )}
                  >
                    <span>{emoji}</span> {label}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <div
                onClick={() => setAiImageHumor(v => !v)}
                className={cn(
                  'relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors cursor-pointer',
                  aiImageHumor ? 'bg-primary' : 'bg-muted'
                )}
              >
                <span className={cn('pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform', aiImageHumor ? 'translate-x-4' : 'translate-x-0')} />
              </div>
              <span className="text-xs text-muted-foreground">😄 Add a subtle humorous element</span>
            </label>
            <Button type="button" size="sm" onClick={handleGenerateAiImage} disabled={generatingImage} className="w-full gap-1.5">
              {generatingImage ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating…</> : <><Sparkles className="w-3.5 h-3.5" /> Generate Image</>}
            </Button>
          </div>
        )}
        {showImagePicker && (
          <ImagePickerFromDeck
            onSelect={(url) => { setImageUrl(url); setFocalPoint({ x: 50, y: 50 }); setShowImagePicker(false); }}
            onClose={() => setShowImagePicker(false)}
          />
        )}
        {showImageSearch && (
          <ImageSearchPanel
            defaultQuery={Array.from(correctSet)[0] || ''}
            onSelect={(url) => { setImageUrl(url); setFocalPoint({ x: 50, y: 50 }); setShowImageSearch(false); }}
            onClose={() => setShowImageSearch(false)}
          />
        )}
      </div>

      {/* Short Clue */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-1.5">Written Question <InfoTooltip text="Optional — one sentence, revealed before answering" /></Label>
          <div className="flex items-center gap-2">
            <span className={`text-xs tabular-nums ${clue.length >= 180 ? 'text-destructive' : 'text-muted-foreground'}`}>{clue.length}/200</span>
            <MathButton onInsert={(latex) => setClue(prev => prev + latex)} />
          </div>
        </div>
        <Textarea
          value={clue}
          onChange={e => setClue(e.target.value)}
          placeholder={'e.g. "This animal is the largest land mammal."'}
          maxLength={200}
          className="rounded-none resize-none min-h-[2.5rem]"
          rows={2}
        />
      </div>

      {/* Answer Choices — hidden for short_answer */}
      {!isShortAnswer && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Answer Choices</Label>
            {!isTrueFalse && (
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={generateDecoys} disabled={generatingDecoys} className="h-7 text-xs gap-1">
                  {generatingDecoys ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                  Decoys
                </Button>
                {allChoicesList.length < 6 && (
                  <Button type="button" variant="outline" size="sm" onClick={addChoice} className="h-7 text-xs gap-1">
                    <Plus className="w-3 h-3" /> Add
                  </Button>
                )}
              </div>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            {isSelectAll
              ? 'Click ✓ on each correct answer (2+ required).'
              : 'Click ✓ to mark the single correct answer.'}
          </p>

          <div className="space-y-2">
            {allChoicesList.map((c, i) => {
              const isCorrect = correctSet.has(c.trim());
              return (
                <div key={i} className="flex gap-2 items-center">
                  <button
                    type="button"
                    onClick={() => toggleCorrect(c)}
                    disabled={!c.trim()}
                    className={cn(
                      'shrink-0 w-7 h-7 rounded border-2 flex items-center justify-center transition-colors text-xs font-bold',
                      isCorrect ? 'bg-success border-success text-white' : 'border-border text-muted-foreground hover:border-primary',
                      !c.trim() && 'opacity-30 cursor-not-allowed'
                    )}
                    title={isCorrect ? 'Correct answer' : 'Mark as correct'}
                  >
                    {isCorrect && '✓'}
                  </button>
                  <Input
                    value={c}
                    onChange={e => updateChoice(i, e.target.value)}
                    placeholder={`Choice ${i + 1}`}
                    readOnly={isTrueFalse}
                    className={cn(isTrueFalse && 'bg-muted cursor-default', isCorrect && 'border-success/60 bg-success/5')}
                  />
                  {!isTrueFalse && allChoicesList.length > 2 && (
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeChoice(i)} className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive">
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>

          {correctSet.size === 0 && (
            <p className="text-xs text-destructive">Click ✓ next to the correct answer(s).</p>
          )}
          {isSelectAll && correctSet.size === 1 && (
            <p className="text-xs text-amber-600">Select All requires at least 2 correct answers.</p>
          )}
        </div>
      )}

      {/* Difficulty / Point Value */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-amber-500" /> Point Value
            <InfoTooltip text="Points awarded for a correct answer. Computed once at creation from question type and graph depth. Override to lock." />
          </Label>
          {!difficultyOverridden && (
            <button
              type="button"
              onClick={() => recomputeDifficulty(qType, clue, Array.from(correctSet)[0] || '')}
              disabled={recomputingDifficulty}
              className="flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50"
            >
              {recomputingDifficulty ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
              Recompute
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <input
            type="number"
            min={10}
            max={50}
            step={10}
            value={pointValue}
            onChange={e => {
              setPointValue(parseInt(e.target.value, 10) || 20);
              setDifficultyOverridden(true);
            }}
            className="w-24 border border-input rounded px-2 py-1.5 text-sm text-center"
          />
          {difficultyTier && (
            <span className="text-xs text-muted-foreground">Tier {difficultyTier} / 5</span>
          )}
          {difficultyOverridden ? (
            <button
              type="button"
              onClick={() => {
                setDifficultyOverridden(false);
                recomputeDifficulty(qType, clue, Array.from(correctSet)[0] || '');
              }}
              className="text-xs text-amber-600 hover:underline flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" /> Reset to computed
            </button>
          ) : (
            <span className="text-xs text-muted-foreground italic">auto-computed</span>
          )}
        </div>
        {difficultyReason && !difficultyOverridden && (
          <p className="text-xs text-muted-foreground">{difficultyReason}</p>
        )}
      </div>

      {/* Tags */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-1.5">Tags <InfoTooltip text="Optional — add tags to filter and group cards" /></Label>
          <button
            type="button"
            onClick={suggestTags}
            disabled={suggestingTags}
            className="flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50"
          >
            {suggestingTags ? <Loader2 className="w-3 h-3 animate-spin" /> : <Tags className="w-3 h-3" />}
            Suggest tags
          </button>
        </div>
        <TagInput tags={tags} onChange={setTags} suggestions={allTags} />
      </div>

      {/* Long Explanation */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-1.5">Explanation <InfoTooltip text="Optional — shown on the back of the card after answering" /></Label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={async () => {
                const correctList = Array.from(correctSet);
                if (!correctList.length && !clue.trim()) { toast.error('Add a question or correct answer first'); return; }
                setGeneratingExplanation(true);
                const result = await base44.integrations.Core.InvokeLLM({
                  prompt: `Write a concise educational explanation (2–4 sentences) for a flashcard.\nQuestion: ${clue || '(none)'}\nCorrect answer(s): ${correctList.join(', ')}\nExplain why the answer is correct and add any helpful context. Return plain HTML suitable for a rich text editor (use <b>, <i>, <ul>, <li> as needed — no <html>/<body> tags).`,
                });
                setExplanation(result || '');
                setGeneratingExplanation(false);
                toast.success('Explanation generated');
              }}
              disabled={generatingExplanation}
              className="flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50"
            >
              {generatingExplanation ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              AI Generate
            </button>
            <MathButton onInsert={(latex) => {
              const quill = quillRef.current?.getEditor();
              if (quill) {
                const range = quill.getSelection(true);
                quill.insertText(range.index, latex, 'user');
                quill.setSelection(range.index + latex.length);
              } else {
                setExplanation(prev => prev + latex);
              }
            }} />
          </div>
        </div>
        <div className="quill-wrapper border border-input overflow-hidden" style={{ borderRadius: 0 }}>
          <ReactQuill
            ref={quillRef}
            theme="snow"
            value={explanation}
            onChange={setExplanation}
            placeholder="Write a longer explanation, context, or notes…"
            modules={{ toolbar: [['bold', 'italic', 'underline'], [{ list: 'ordered' }, { list: 'bullet' }], ['link'], ['clean']] }}
            style={{ minHeight: 220 }}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="-mx-5 bg-card flex justify-end gap-2 px-5 pt-2 pb-4 border-t border-border mt-2">
        <Button variant="ghost" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading…</> : 'Save Card'}
        </Button>
      </div>

      {showImageEditor && imageUrl && (
        <ImageEditor
          open={showImageEditor}
          imageUrl={imageUrl}
          initialFocalPoint={focalPoint}
          initialImageFit={imageFit}
          onClose={() => setShowImageEditor(false)}
          onSave={(dataUrl, newFocalPoint, newImageFit) => {
            setShowImageEditor(false);
            if (dataUrl) setImageUrl(dataUrl);
            if (newFocalPoint) setFocalPoint(newFocalPoint);
            if (newImageFit) setImageFit(newImageFit);
          }}
        />
      )}
      </>}
    </div>
  );
}