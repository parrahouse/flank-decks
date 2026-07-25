/**
 * QuickAddCardModal — lightweight "add a card" wizard.
 *
 * Stage 2: near-full-screen two-column layout. Left column is the form
 * (what the card says), right column is a live CardPreviewPane capped at
 * true study size (how the card looks). Header/footer pinned; columns
 * scroll independently at md+; body scrolls as one below md.
 */
import { useState, useRef, useEffect } from 'react';
import {
  Upload, Sparkles, Search, Image as ImageIcon, Loader2,
  Plus, Pencil, Check, Zap, Lightbulb, AlertTriangle, X, Trash2,
  PanelLeft, PanelTop,
} from 'lucide-react';
import { computeCardDifficulty } from '@/lib/computeCardDifficulty';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ImageSearchPanel from './ImageSearchPanel';
import CardThumbnail from './CardThumbnail';
import { Checkbox } from '@/components/ui/checkbox';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

// True inner width of the study card: max-w-7xl (1280) − page px-4 (32) − card p-4 (32).
// Capping the preview here makes it 1:1 with study rather than merely proportional.
const STUDY_CARD_TRUE_W = 1216;

const STYLE_PRESETS = {
  pixel_art:    { label: 'Old School', emoji: '🕹️', enhancer: 'Mid-century retro illustration in vintage halftone print style. No gradients or modern shading. Bold black ink outlines, simplified shapes, matte aged quality.' },
  oil_painting: { label: 'Oil Painting', emoji: '🖼️', enhancer: 'classic oil painting style, visible brushstrokes, rich textures, warm lighting' },
  minimalist:   { label: 'Minimalist', emoji: '◻️', enhancer: 'minimalist vector art, clean flat design, simple shapes, limited color palette' },
  watercolor:   { label: 'Watercolor', emoji: '🎨', enhancer: 'soft watercolor painting, ethereal feel, gentle color bleeds, artistic style' },
};

const QTYPE_META = {
  multiple_choice: {
    label: 'Multiple Choice',
    answerLabel: 'Correct Answer',
    answerHelper: 'One correct answer. Distractor choices can be added in the detail editor.',
    answerPlaceholder: 'e.g. Jupiter',
  },
  true_false: {
    label: 'True / False',
    answerLabel: 'Correct Answer',
    answerHelper: 'The statement in the question is…',
    answerPlaceholder: null,
  },
  select_all: {
    label: 'Select All That Apply',
    answerLabel: 'Correct Answers',
    answerHelper: 'Separate each correct answer with "|" — e.g. Mitosis|Meiosis|Binary Fission. At least 2 required.',
    answerPlaceholder: 'e.g. Mitosis|Meiosis|Binary Fission',
  },
  short_answer: {
    label: 'Short Answer',
    answerLabel: 'Canonical Answer',
    answerHelper: 'The authoritative correct answer — variants and grading guidance can be added in the detail editor.',
    answerPlaceholder: 'e.g. Photosynthesis',
  },
};

export default function QuickAddCardModal({ open, onClose, deckId, deck, activeCards, onSaved, onEditDetails }) {
  const [step, setStep] = useState('input'); // 'input' | 'saving' | 'done'
  const [savedCard, setSavedCard] = useState(null);
  const [difficultyResult, setDifficultyResult] = useState(null); // { point_value, difficulty_tier, _reason }
  const [overrideValue, setOverrideValue] = useState(''); // string while editing override

  // Form state
  const [qType, setQType] = useState('multiple_choice');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState(''); // used by true_false + short_answer

  // Answer bank — mirrors CardEditor's allChoicesList + correctSet model, so a
  // card saved here opens identically in the detail editor. Persists across
  // type switches; only cleared on a full modal reset.
  const [choicesList, setChoicesList] = useState(['', '', '', '']);
  const [correctSet, setCorrectSet] = useState(new Set()); // trimmed choice strings

  // Short-answer fields — mirror CardEditor; grader reads all three.
  const [acceptedVariants, setAcceptedVariants] = useState([]);
  const [newVariant, setNewVariant] = useState('');
  const [gradingGuidance, setGradingGuidance] = useState('');
  const [imageUrl, setImageUrl] = useState('');

  // Whether this card gets an image region at all. Defaults to whatever the
  // deck already does — an empty deck defaults to yes.
  const deckUsesImages = activeCards.length === 0 || activeCards.some(c => !!c.image_url);
  const [imageCard, setImageCard] = useState(deckUsesImages);
  const [previewLayout, setPreviewLayout] = useState('horizontal');

  // Image sub-panels
  const [imagePanel, setImagePanel] = useState(null); // null | 'search' | 'pick' | 'ai'
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiStyle, setAiStyle] = useState('pixel_art');
  const [generatingImage, setGeneratingImage] = useState(false);

  // AI suggest whole card
  const [suggestingCard, setSuggestingCard] = useState(false);

  const fileRef = useRef();

  // Re-derive the default each time the modal opens
  useEffect(() => { if (open) setImageCard(deckUsesImages); }, [open]);

  const meta = QTYPE_META[qType];

  const usesBank = qType === 'multiple_choice' || qType === 'select_all';

  const updateChoice = (i, val) => {
    setChoicesList(prev => {
      const next = [...prev];
      const old = next[i].trim();
      next[i] = val;
      // keep correctSet in step with a renamed choice
      if (old && correctSet.has(old)) {
        setCorrectSet(cs => {
          const n = new Set(cs); n.delete(old);
          if (val.trim()) n.add(val.trim());
          return n;
        });
      }
      return next;
    });
  };

  const addChoice = () => setChoicesList(prev => prev.length < 6 ? [...prev, ''] : prev);

  const removeChoice = (i) => {
    setChoicesList(prev => {
      if (prev.length <= 2) return prev;
      const removed = prev[i].trim();
      if (removed) setCorrectSet(cs => { const n = new Set(cs); n.delete(removed); return n; });
      return prev.filter((_, idx) => idx !== i);
    });
  };

  const toggleCorrect = (choice) => {
    const t = choice.trim();
    if (!t) return;
    setCorrectSet(prev => {
      const n = new Set(prev);
      if (qType === 'multiple_choice') {
        // single-select: exactly one
        n.clear();
        n.add(t);
      } else {
        n.has(t) ? n.delete(t) : n.add(t);
      }
      return n;
    });
  };

  // Filled choices and how many are marked correct — drives validation + preview
  const filledChoices = choicesList.map(c => c.trim()).filter(Boolean);
  const correctFilled = filledChoices.filter(c => correctSet.has(c));

  const reset = () => {
    setStep('input');
    setSavedCard(null);
    setQType('multiple_choice');
    setQuestion('');
    setAnswer('');
    setChoicesList(['', '', '', '']);
    setCorrectSet(new Set());
    setAcceptedVariants([]);
    setNewVariant('');
    setGradingGuidance('');
    setImageUrl('');
    setImageCard(deckUsesImages);
    setImagePanel(null);
    setAiPrompt('');
    setSuggestingCard(false);
    setDifficultyResult(null);
    setOverrideValue('');
  };

  const handleClose = () => { reset(); onClose(); };

  // ── Image helpers ────────────────────────────────────────────────────────
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size < 10 * 1024) { toast.error('Image too small (min 10 KB)'); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error('Image too large (max 10 MB)'); return; }
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setImageUrl(file_url);
    setImagePanel(null);
    e.target.value = '';
  };

  const handleGenerateAiImage = async () => {
    if (!aiPrompt.trim()) { toast.error('Enter a description first'); return; }
    setGeneratingImage(true);
    const enhancer = STYLE_PRESETS[aiStyle]?.enhancer || '';
    const fullPrompt = `${aiPrompt.trim()}, ${enhancer}. Do not render any text or words. Compose for 3:2 landscape, subject centered, generous margins.`;
    const { url } = await base44.integrations.Core.GenerateImage({ prompt: fullPrompt });
    setImageUrl(url);
    setImagePanel(null);
    setGeneratingImage(false);
    toast.success('Image generated!');
  };

  // ── AI suggest whole card ────────────────────────────────────────────────
  const handleAiSuggest = async () => {
    const existingAnswers = activeCards.map(c => c.correct_answers || c.correct_answer).filter(Boolean).slice(0, 40);
    setSuggestingCard(true);
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
      setQuestion(result.question || '');
      setAnswer(result.answer || '');
      setAiPrompt(result.image_prompt || result.answer || '');
    } else {
      toast.error('Could not generate a suggestion');
    }
    setSuggestingCard(false);
  };

  // ── Save ─────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (usesBank) {
      if (filledChoices.length < 2) { toast.error('Add at least two choices'); return; }
      if (correctFilled.length === 0) { toast.error('Mark the correct answer'); return; }
      if (qType === 'select_all' && correctFilled.length < 2) { toast.error('Select All needs at least two correct answers'); return; }
    } else if (!answer.trim()) {
      toast.error('Answer is required'); return;
    }
    setStep('saving');

    let finalImageUrl = imageCard ? imageUrl : '';
    if (finalImageUrl?.startsWith('data:')) {
      const blob = await (await fetch(imageUrl)).blob();
      const file = new File([blob], 'image.jpg', { type: 'image/jpeg' });
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      finalImageUrl = file_url;
    }

    const isShortAnswer = qType === 'short_answer';

    // correctList = the correct answers; choices = every filled option.
    const correctList = usesBank
      ? correctFilled
      : isShortAnswer
      ? [answer.trim()]
      : [answer.trim()];

    const choices = qType === 'true_false'
      ? ['True', 'False']
      : isShortAnswer
      ? []
      : filledChoices;

    // Compute difficulty (non-blocking — failure defaults to tier 2 / 20 pts)
    let diffResult = { point_value: 20, difficulty_tier: 2, difficulty_overridden: false, _reason: '' };
    try {
      diffResult = await computeCardDifficulty({
        question_type: qType,
        clue: question.trim(),
        correct_answer: correctList[0] || answer.trim(),
        concept_id: null,
      });
    } catch { /* keep defaults */ }

    const cardData = {
      deck_id: deckId,
      order: activeCards.length,
      correct_answers: isShortAnswer ? answer.trim() : correctList.join('|'),
      correct_answer: correctList[0] || answer.trim(),
      choices,
      question_type: qType,
      clue: question.trim(),
      image_url: finalImageUrl || '',
      image_fit: 'cover',
      image_focal_point: finalImageUrl ? { x: 50, y: 50 } : null,
      point_value: diffResult.point_value,
      difficulty_tier: diffResult.difficulty_tier,
      difficulty_overridden: false,
      ...(isShortAnswer && {
        canonical_answer: answer.trim(),
        accepted_variants: acceptedVariants.map(v => v.trim()).filter(Boolean),
        grading_guidance: gradingGuidance.trim(),
      }),
    };

    const created = await base44.entities.Card.create(cardData);
    setSavedCard(created);
    setDifficultyResult(diffResult);
    setOverrideValue(String(diffResult.point_value));
    setStep('done');
    onSaved();
  };

  const handleAddAnother = () => reset();

  const handleEditDetails = () => {
    const card = savedCard;
    reset();
    onClose();
    onEditDetails(card);
  };

  // Text to seed image search / AI from. Bank types keep the answer in the bank,
  // not in `answer`, so fall back to the first correct choice (then any filled
  // choice) for them.
  const imageSeed = usesBank
    ? (correctFilled[0] || filledChoices[0] || '')
    : answer.trim();
  const canSave = usesBank
    ? (filledChoices.length >= 2
        && correctFilled.length >= 1
        && (qType !== 'select_all' || correctFilled.length >= 2))
    : answer.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="w-[96vw] max-w-[1700px] h-[92vh] p-0 overflow-hidden flex flex-col">
        <AnimatePresence mode="wait">

          {/* ── STEP: input ───────────────────────────────────────────────── */}
          {step === 'input' && (
            <motion.div
              key="input"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.18 }}
              className="flex flex-col h-full min-h-0"
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && canSave) handleSave();
              }}
            >
              {/* Header — pinned */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
                <h2 className="font-semibold text-base">Create a Card</h2>
              </div>

              {/* Body — what the card says | how the card looks.
                  Columns scroll independently at md+; below that the body scrolls as one. */}
              <div className="grid grid-cols-1 md:grid-cols-[minmax(360px,420px)_1fr] flex-1 min-h-0 overflow-y-auto md:overflow-hidden">

                {/* ── Left: form ──────────────────────────────────────────── */}
                <div className="px-6 py-5 space-y-5 min-h-0 md:overflow-y-auto">

                  {/* Question Type */}
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Question Type</label>
                    <Select value={qType} onValueChange={(v) => {
                      // Narrowing to single-select: keep at most one tick.
                      if (v === 'multiple_choice' && correctSet.size > 1) {
                        const first = choicesList.map(c => c.trim()).find(c => correctSet.has(c));
                        setCorrectSet(new Set(first ? [first] : []));
                      }
                      // Clear the single-answer field only when it would be invalid.
                      if (v === 'true_false' && answer !== 'True' && answer !== 'False') setAnswer('');
                      else if (v === 'short_answer' && (answer === 'True' || answer === 'False')) setAnswer('');
                      setQType(v);
                    }}>
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
                    <p className="text-xs text-muted-foreground min-h-[1rem]">
                      {qType === 'multiple_choice' && 'Students pick one correct answer from a list of choices.'}
                      {qType === 'select_all' && 'Students must select every correct answer to earn full credit.'}
                      {qType === 'true_false' && 'Write a statement in the question field — students decide if it\'s True or False.'}
                      {qType === 'short_answer' && 'Students type a free-text response graded by exact match then AI fallback.'}
                    </p>
                  </div>

                  {/* Draft with AI + Image Card */}
                  <div className="flex items-center justify-between gap-4">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleAiSuggest}
                      disabled={suggestingCard}
                      className="gap-1.5 h-8 text-xs"
                    >
                      {suggestingCard
                        ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Thinking…</>
                        : <><Sparkles className="w-3.5 h-3.5" /> Draft with AI</>}
                    </Button>

                    <label className="flex items-center gap-2 text-sm font-medium cursor-pointer select-none">
                      <Checkbox checked={imageCard} onCheckedChange={(v) => setImageCard(!!v)} />
                      Image Card
                    </label>
                  </div>

                  {/* Question / Clue */}
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">
                      {qType === 'true_false' ? 'Statement' : 'Question / Clue'}
                    </label>
                    <Textarea
                      value={question}
                      onChange={e => setQuestion(e.target.value)}
                      placeholder={
                        qType === 'true_false'
                          ? 'e.g. "The Earth is the third planet from the Sun."'
                          : 'e.g. "This is the largest planet in the solar system."'
                      }
                      rows={3}
                      className="resize-none text-sm"
                    />
                  </div>

                  {/* Answer — single field for true_false / short_answer, bank otherwise */}
                  {!usesBank ? (
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">
                        {meta.answerLabel} <span className="text-destructive">*</span>
                      </label>
                      {qType === 'true_false' ? (
                        <Select value={answer} onValueChange={setAnswer}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select the correct answer…" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="True">True</SelectItem>
                            <SelectItem value="False">False</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          value={answer}
                          onChange={e => setAnswer(e.target.value)}
                          placeholder={meta.answerPlaceholder}
                          onKeyDown={e => { if (e.key === 'Enter' && answer.trim()) handleSave(); }}
                        />
                      )}
                      <p className="text-xs text-muted-foreground">{meta.answerHelper}</p>

                      {qType === 'short_answer' && (
                        <div className="space-y-4 border border-border rounded-lg p-4 bg-accent/10 mt-2">
                          {/* Accepted variants */}
                          <div className="space-y-1.5">
                            <label className="text-sm font-medium">
                              Accepted Variants <span className="text-xs text-muted-foreground font-normal">(optional)</span>
                            </label>
                            <div className="flex gap-2">
                              <Input
                                value={newVariant}
                                onChange={e => setNewVariant(e.target.value)}
                                placeholder="Add an alternate acceptable answer…"
                                onKeyDown={e => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    if (newVariant.trim()) { setAcceptedVariants(prev => [...prev, newVariant.trim()]); setNewVariant(''); }
                                  }
                                }}
                              />
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => { if (newVariant.trim()) { setAcceptedVariants(prev => [...prev, newVariant.trim()]); setNewVariant(''); } }}
                              >
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
                            <label className="text-sm font-medium">
                              Grading Guidance <span className="text-xs text-muted-foreground font-normal">(optional AI rubric)</span>
                            </label>
                            <Textarea
                              value={gradingGuidance}
                              onChange={e => setGradingGuidance(e.target.value)}
                              placeholder='e.g. "Must mention both photosynthesis and chlorophyll for full credit; one alone is partial"'
                              rows={2}
                              className="resize-none text-sm"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium">Answer Bank</label>
                        {filledChoices.length >= 2 && choicesList.length < 6 && (
                          <Button type="button" variant="outline" size="sm" onClick={addChoice} className="h-7 text-xs gap-1">
                            <Plus className="w-3 h-3" /> Add
                          </Button>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {qType === 'select_all'
                          ? 'Fill at least two options and tick every correct one. Untick the distractors.'
                          : 'Fill at least two options and tick the single correct one. Leave the rest as distractors.'}
                      </p>

                      <div className="space-y-2">
                        {choicesList.map((c, i) => {
                          const isCorrect = correctSet.has(c.trim());
                          return (
                            <div key={i} className="flex gap-2 items-center">
                              <button
                                type="button"
                                tabIndex={-1}
                                onClick={() => toggleCorrect(c)}
                                disabled={!c.trim()}
                                title={isCorrect ? 'Correct answer' : 'Mark as correct'}
                                className={cn(
                                  'shrink-0 w-7 h-7 rounded border-2 flex items-center justify-center transition-colors text-xs font-bold',
                                  isCorrect ? 'bg-success border-success text-white' : 'border-border text-muted-foreground hover:border-primary',
                                  !c.trim() && 'opacity-30 cursor-not-allowed'
                                )}
                              >
                                {isCorrect && '✓'}
                              </button>
                              <Input
                                value={c}
                                onChange={e => updateChoice(i, e.target.value)}
                                placeholder={i === 0 ? 'Correct answer (required)' : `Option ${i + 1}`}
                                className={cn(isCorrect && 'border-success/60 bg-success/5')}
                              />
                              {choicesList.length > 2 && (
                                <Button type="button" variant="ghost" size="icon" tabIndex={-1} onClick={() => removeChoice(i)} className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive">
                                  <X className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {filledChoices.length >= 2 && correctFilled.length === 0 && (
                        <p className="text-xs text-destructive">Tick the correct answer{qType === 'select_all' ? 's' : ''}.</p>
                      )}
                      {qType === 'select_all' && correctFilled.length === 1 && (
                        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-800">
                          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
                          <p className="text-xs font-medium leading-snug">Select All with one correct answer behaves like Multiple Choice. Tick at least two, or switch the type.</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Footnote */}
                  <div className="flex items-start gap-2 pt-1 text-xs text-muted-foreground">
                    <Lightbulb className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <p>Clues, tags, explanations and image cropping can be refined in the full editor.</p>
                  </div>
                </div>

                {/* ── Right: preview + image sources ──────────────────────── */}
                <div className="relative px-6 py-5 md:border-l border-border bg-muted/20 min-h-0 md:overflow-y-auto">
                  <div className="flex items-center gap-3 mb-3">
                    <p className="text-sm font-medium">Card Preview</p>
                    <div className="flex rounded-md border border-border overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setPreviewLayout('horizontal')}
                        title="Horizontal"
                        className={cn(
                          'px-2 py-1 flex items-center text-xs',
                          previewLayout === 'horizontal' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent'
                        )}
                      >
                        <PanelLeft className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewLayout('vertical')}
                        title="Vertical"
                        className={cn(
                          'px-2 py-1 flex items-center text-xs',
                          previewLayout === 'vertical' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent'
                        )}
                      >
                        <PanelTop className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="mx-auto w-full space-y-3" style={{ maxWidth: previewLayout === 'horizontal' ? STUDY_CARD_TRUE_W : 480 }}>
                    <AnimatePresence mode="wait">
                    <motion.div
                      key={previewLayout}
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      transition={{ duration: 0.2 }}
                    >
                    <CardThumbnail
                      card={{
                        image_url: imageCard ? imageUrl : '',
                        image_fit: 'cover',
                        image_focal_point: null,
                        clue: question,
                        question_type: qType,
                        choices: qType === 'true_false' ? ['True', 'False'] : usesBank ? filledChoices : [],
                        correct_answers: usesBank ? correctFilled.join('|') : answer.trim(),
                        canonical_answer: qType === 'short_answer' ? answer.trim() : '',
                        accepted_variants: qType === 'short_answer' ? acceptedVariants : [],
                      }}
                      layout={previewLayout}
                      imageEmpty={imageCard && !imageUrl ? (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-2 border-2 border-dashed border-muted-foreground/30 rounded p-4">
                          <button
                            type="button"
                            onClick={() => fileRef.current?.click()}
                            className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary/10 text-primary hover:bg-primary/15 transition-colors text-sm font-medium"
                          >
                            <Upload className="w-4 h-4" /> Upload a File
                          </button>
                          {imageSeed && (
                            <button
                              type="button"
                              onClick={() => setImagePanel('search')}
                              className="flex items-center gap-2 px-4 py-2 rounded-md bg-muted hover:bg-muted/70 transition-colors text-sm font-medium"
                            >
                              <Search className="w-4 h-4" /> Search Images
                            </button>
                          )}
                          {imageSeed && (
                            <button
                              type="button"
                              onClick={() => setImagePanel('ai')}
                              className="flex items-center gap-2 px-4 py-2 rounded-md bg-muted hover:bg-muted/70 transition-colors text-sm font-medium"
                            >
                              <Sparkles className="w-4 h-4" /> Create with AI
                            </button>
                          )}
                        </div>
                      ) : null}
                      imageOverlay={imageCard && imageUrl ? (
                        <button
                          type="button"
                          onClick={() => setImageUrl('')}
                          title="Remove image"
                          className="absolute top-2 right-2 z-10 w-8 h-8 rounded-full bg-white shadow-md border border-border flex items-center justify-center hover:scale-105 transition-transform"
                        >
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </button>
                      ) : null}
                    />
                    </motion.div>
                    </AnimatePresence>

                    <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
                  </div>

                  {/* ── Full-pane overlay: search / AI ──────────────────────── */}
                  {imageCard && (imagePanel === 'search' || imagePanel === 'ai') && (
                    <div className="absolute inset-0 z-20 bg-background flex flex-col">
                      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/40 shrink-0">
                        <p className="text-sm font-semibold">
                          {imagePanel === 'search' ? 'Search Images' : 'Create with AI'}
                        </p>
                        <button type="button" onClick={() => setImagePanel(null)} className="text-muted-foreground hover:text-foreground">
                          <X className="w-5 h-5" />
                        </button>
                      </div>

                      <div className="flex-1 min-h-0 p-4">
                        {imagePanel === 'search' && (
                          <ImageSearchPanel
                            defaultQuery={imageSeed}
                            columns={5}
                            maxHeightClass="flex-1 min-h-0"
                            className="h-full border-0 rounded-none flex flex-col"
                            onSelect={(url) => { setImageUrl(url); setImagePanel(null); }}
                            onClose={() => setImagePanel(null)}
                          />
                        )}
                        {imagePanel === 'ai' && (
                          <div className="space-y-4 max-w-2xl mx-auto">
                            <Textarea
                              value={aiPrompt}
                              onChange={e => setAiPrompt(e.target.value)}
                              placeholder="Describe what the image should show…"
                              rows={3}
                              className="resize-none text-sm"
                            />
                            <div className="grid grid-cols-2 gap-2">
                              {Object.entries(STYLE_PRESETS).map(([key, { label, emoji }]) => (
                                <button
                                  key={key}
                                  type="button"
                                  onClick={() => setAiStyle(key)}
                                  className={cn(
                                    'flex items-center gap-2 px-3 py-2 rounded-md border text-sm transition-colors text-left',
                                    aiStyle === key
                                      ? 'border-primary bg-primary/10 text-primary font-medium'
                                      : 'border-border hover:border-primary/50 text-muted-foreground'
                                  )}
                                >
                                  <span>{emoji}</span> {label}
                                </button>
                              ))}
                            </div>
                            <Button type="button" size="sm" onClick={handleGenerateAiImage} disabled={generatingImage} className="gap-1.5 w-full">
                              {generatingImage
                                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating…</>
                                : <><Sparkles className="w-3.5 h-3.5" /> Generate Image</>}
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer — pinned */}
              <div className="px-6 py-4 border-t border-border flex items-center justify-end gap-2 bg-muted/30 shrink-0">
                <Button variant="ghost" onClick={handleClose}>Cancel</Button>
                <Button onClick={handleSave} disabled={!canSave} className="gap-1.5">
                  <Check className="w-4 h-4" /> Save
                </Button>
              </div>
            </motion.div>
          )}

          {/* ── STEP: saving ─────────────────────────────────────────────── */}
          {step === 'saving' && (
            <motion.div
              key="saving"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col items-center justify-center h-full py-24 gap-4"
            >
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                <Loader2 className="w-7 h-7 text-primary animate-spin" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">Saving card…</p>
            </motion.div>
          )}

          {/* ── STEP: done ───────────────────────────────────────────────── */}
          {step === 'done' && (
            <motion.div
              key="done"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22 }}
              className="flex flex-col items-center justify-center h-full py-12 px-8 gap-5 text-center overflow-y-auto"
            >
              <div className="w-14 h-14 rounded-full bg-success/15 flex items-center justify-center">
                <Check className="w-7 h-7 text-success" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">Card saved!</h3>
                <p className="text-muted-foreground text-sm mt-1">
                  {savedCard?.clue
                    ? <span className="italic">"{savedCard.clue}"</span>
                    : <span className="font-medium">{savedCard?.correct_answers}</span>
                  }
                </p>
              </div>

              {/* Difficulty result */}
              {difficultyResult && (
                <div className="w-full max-w-xs border border-border rounded-lg p-3 bg-accent/20 text-left space-y-2">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-500 shrink-0" />
                    <span className="text-sm font-medium">Point Value: Tier {difficultyResult.difficulty_tier}</span>
                  </div>
                  {difficultyResult._reason && (
                    <p className="text-xs text-muted-foreground">{difficultyResult._reason}</p>
                  )}
                  <div className="flex items-center gap-2 pt-1">
                    <label className="text-xs font-medium shrink-0">Override points:</label>
                    <input
                      type="number"
                      min={10}
                      max={50}
                      step={10}
                      value={overrideValue}
                      onChange={e => setOverrideValue(e.target.value)}
                      className="w-20 border border-input rounded px-2 py-1 text-sm text-center"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={async () => {
                        const v = parseInt(overrideValue, 10);
                        if (!isNaN(v) && v > 0 && savedCard?.id) {
                          await base44.entities.Card.update(savedCard.id, {
                            point_value: v,
                            difficulty_overridden: true,
                          });
                          toast.success(`Point value set to ${v}`);
                        }
                      }}
                    >
                      Set
                    </Button>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-2 w-full max-w-xs">
                <Button onClick={handleAddAnother} className="gap-2 w-full">
                  <Plus className="w-4 h-4" /> Add another card
                </Button>
                <Button variant="outline" onClick={handleEditDetails} className="gap-2 w-full">
                  <Pencil className="w-4 h-4" /> Edit details &amp; add choices
                </Button>
                <Button variant="ghost" onClick={handleClose} className="gap-2 w-full text-muted-foreground">
                  Done
                </Button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}