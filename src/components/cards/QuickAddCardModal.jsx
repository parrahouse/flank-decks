/**
 * QuickAddCardModal — lightweight "add a card" wizard.
 *
 * Order: question type → question/clue → answer → image (optional)
 */
import { useState, useRef } from 'react';
import {
  Upload, Sparkles, Search, Image as ImageIcon, X, Loader2,
  Plus, Pencil, Check,
} from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ImageSearchPanel from './ImageSearchPanel';
import ImagePickerFromDeck from './ImagePickerFromDeck';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

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

  // Form state
  const [qType, setQType] = useState('multiple_choice');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [imageUrl, setImageUrl] = useState('');

  // Image sub-panels
  const [imagePanel, setImagePanel] = useState(null); // null | 'search' | 'pick' | 'ai'
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiStyle, setAiStyle] = useState('pixel_art');
  const [generatingImage, setGeneratingImage] = useState(false);

  // AI suggest whole card
  const [suggestingCard, setSuggestingCard] = useState(false);

  const fileRef = useRef();

  const meta = QTYPE_META[qType];

  const reset = () => {
    setStep('input');
    setSavedCard(null);
    setQType('multiple_choice');
    setQuestion('');
    setAnswer('');
    setImageUrl('');
    setImagePanel(null);
    setAiPrompt('');
    setSuggestingCard(false);
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
    const fullPrompt = `${aiPrompt.trim()}, ${enhancer}. Do not render any text or words. Compose for 4:3 landscape, subject centered, generous margins.`;
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
      setImagePanel('ai');
    } else {
      toast.error('Could not generate a suggestion');
    }
    setSuggestingCard(false);
  };

  // ── Save ─────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!answer.trim()) { toast.error('Answer is required'); return; }
    setStep('saving');

    let finalImageUrl = imageUrl;
    if (imageUrl?.startsWith('data:')) {
      const blob = await (await fetch(imageUrl)).blob();
      const file = new File([blob], 'image.jpg', { type: 'image/jpeg' });
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      finalImageUrl = file_url;
    }

    const isShortAnswer = qType === 'short_answer';

    const correctList = qType === 'select_all'
      ? answer.split('|').map(s => s.trim()).filter(Boolean)
      : [answer.trim()];

    const choices = qType === 'true_false'
      ? ['True', 'False']
      : isShortAnswer
      ? []
      : [...correctList, '', '', ''].slice(0, Math.max(4, correctList.length));

    const cardData = {
      deck_id: deckId,
      order: activeCards.length,
      correct_answers: isShortAnswer ? answer.trim() : correctList.join('|'),
      correct_answer: correctList[0],
      choices,
      question_type: qType,
      clue: question.trim(),
      image_url: finalImageUrl || '',
      image_fit: 'cover',
      image_focal_point: finalImageUrl ? { x: 50, y: 50 } : null,
      ...(isShortAnswer && { canonical_answer: answer.trim(), accepted_variants: [], grading_guidance: '' }),
    };

    const created = await base44.entities.Card.create(cardData);
    setSavedCard(created);
    await new Promise(r => setTimeout(r, 900));
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

  const selectAllAnswers = answer.split('|').map(s => s.trim()).filter(Boolean);
  const canSave = qType === 'true_false'
    ? !!answer
    : qType === 'select_all'
    ? selectAllAnswers.length >= 2
    : !!answer.trim();

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden">
        <AnimatePresence mode="wait">

          {/* ── STEP: input ───────────────────────────────────────────────── */}
          {step === 'input' && (
            <motion.div
              key="input"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.18 }}
              className="flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                <h2 className="font-semibold text-base">New Card</h2>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleAiSuggest}
                  disabled={suggestingCard}
                  className="gap-1.5 text-primary h-8 text-xs"
                >
                  {suggestingCard
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Thinking…</>
                    : <><Sparkles className="w-3.5 h-3.5" /> AI Suggest</>}
                </Button>
              </div>

              {/* Body */}
              <div className="px-6 py-5 space-y-5 overflow-y-auto max-h-[75vh]">

                {/* Question Type */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Question Type</label>
                  <Select value={qType} onValueChange={(v) => { setQType(v); setAnswer(''); }}>
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
                    rows={2}
                    className="resize-none text-sm"
                  />
                </div>

                {/* Answer */}
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
                  {qType === 'select_all' && answer.trim() && selectAllAnswers.length < 2 && (
                    <p className="text-xs text-amber-600">Add at least one more answer separated by "|".</p>
                  )}
                </div>

                {/* Image (optional, at the bottom) */}
                <div className="space-y-2 pt-1">
                  <label className="text-sm font-medium">Image <span className="text-xs text-muted-foreground font-normal">(optional)</span></label>

                  {imageUrl ? (
                    <div className="relative h-48 rounded-lg overflow-hidden border border-border">
                      <img src={imageUrl} alt="card" className="w-full h-full object-cover" />
                      <button
                        onClick={() => setImageUrl('')}
                        className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1 hover:bg-black/80"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div
                      className="h-28 rounded-lg border border-dashed border-border flex flex-col items-center justify-center gap-1.5 text-muted-foreground cursor-pointer hover:border-primary/50 transition-colors"
                      onClick={() => fileRef.current?.click()}
                    >
                      <ImageIcon className="w-5 h-5" />
                      <span className="text-xs">Click to upload</span>
                    </div>
                  )}

                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />

                  {/* Image source links */}
                  <div className="flex items-center gap-4 text-xs">
                    <button type="button" onClick={() => fileRef.current?.click()} className="flex items-center gap-1 text-primary hover:underline">
                      <Upload className="w-3 h-3" /> Upload
                    </button>
                    <button type="button" onClick={() => setImagePanel(v => v === 'pick' ? null : 'pick')} className={cn('flex items-center gap-1 hover:underline text-primary', imagePanel === 'pick' && 'font-semibold')}>
                      <ImageIcon className="w-3 h-3" /> Pick from decks
                    </button>
                    {answer.trim() && (
                      <button type="button" onClick={() => setImagePanel(v => v === 'search' ? null : 'search')} className={cn('flex items-center gap-1 hover:underline text-primary', imagePanel === 'search' && 'font-semibold')}>
                        <Search className="w-3 h-3" /> Search
                      </button>
                    )}
                    {answer.trim() && (
                      <button type="button" onClick={() => setImagePanel(v => v === 'ai' ? null : 'ai')} className={cn('flex items-center gap-1 hover:underline text-primary', imagePanel === 'ai' && 'font-semibold')}>
                        <Sparkles className="w-3 h-3" /> AI Generate
                      </button>
                    )}
                  </div>

                  {imagePanel === 'search' && (
                    <ImageSearchPanel
                      defaultQuery={answer}
                      onSelect={(url) => { setImageUrl(url); setImagePanel(null); }}
                      onClose={() => setImagePanel(null)}
                    />
                  )}
                  {imagePanel === 'pick' && (
                    <ImagePickerFromDeck
                      onSelect={(url) => { setImageUrl(url); setImagePanel(null); }}
                      onClose={() => setImagePanel(null)}
                    />
                  )}
                  {imagePanel === 'ai' && (
                    <div className="border border-border rounded-lg p-3 space-y-3 bg-accent/20">
                      <p className="text-xs font-medium">Generate an image with AI</p>
                      <Textarea
                        value={aiPrompt}
                        onChange={e => setAiPrompt(e.target.value)}
                        placeholder="Describe what the image should show…"
                        rows={2}
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
                      <Button type="button" size="sm" onClick={handleGenerateAiImage} disabled={generatingImage} className="w-full gap-1.5">
                        {generatingImage
                          ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating…</>
                          : <><Sparkles className="w-3.5 h-3.5" /> Generate Image</>}
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-border flex items-center justify-end gap-2 bg-muted/30">
                <Button variant="ghost" onClick={handleClose}>Cancel</Button>
                <Button onClick={handleSave} disabled={!canSave} className="gap-1.5">
                  <Check className="w-4 h-4" /> Save Card
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
              className="flex flex-col items-center justify-center py-24 gap-4"
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
              className="flex flex-col items-center justify-center py-20 px-8 gap-5 text-center"
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