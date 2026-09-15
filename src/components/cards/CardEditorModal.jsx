import { useState, useRef } from 'react';
import { Check, Loader2, Plus, Pencil, Zap, ChevronRight, X } from 'lucide-react';
import { Dialog, DialogContent, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { base44 } from '@/api/base44Client';
import { computeCardDifficulty } from '@/lib/computeCardDifficulty';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

import { useCardFormState } from './editor/useCardFormState';
import EditTabContent from './editor/EditTabContent';
import ImageTabContent from './editor/ImageTabContent';
import ConceptsTabContent from './editor/ConceptsTabContent';
import NotesTabContent from './editor/NotesTabContent';

const TABS = [
  { key: 'edit', label: 'Edit' },
  { key: 'image', label: 'Image' },
  { key: 'concepts', label: 'Concepts' },
  { key: 'notes', label: 'Notes' },
];

/**
 * CardEditorModal — unified full-screen modal for creating and editing cards.
 * mode: 'create' | 'edit'. In create mode, a done step follows save.
 */
export default function CardEditorModal({ open, onClose, mode = 'edit', card, deckId, deck, activeCards, allTags = [], onSaved, onEditDetails, onAddAnother, onSaveAndNext, hasNextCard = false }) {
  const isCreate = mode === 'create';
  const [activeTab, setActiveTab] = useState('edit');
  const [step, setStep] = useState('input'); // 'input' | 'saving' | 'done' (create only)
  const [savedCard, setSavedCard] = useState(null);
  const [difficultyResult, setDifficultyResult] = useState(null);
  const [overrideValue, setOverrideValue] = useState('');
  const [previewLayout, setPreviewLayout] = useState('horizontal');
  const [showDiscard, setShowDiscard] = useState(false);
  const [closeHovered, setCloseHovered] = useState(false);
  const pendingClose = useRef(false);

  const state = useCardFormState({ mode, card, deck, activeCards });

  const reset = () => {
    setStep('input');
    setSavedCard(null);
    setDifficultyResult(null);
    setOverrideValue('');
    setActiveTab('edit');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const requestClose = () => {
    if (state.isDirty && step === 'input') {
      setShowDiscard(true);
    } else {
      handleClose();
    }
  };

  const handleSave = async (afterSave) => {
    if (!state.canSave) {
      toast.error(state.isShortAnswer ? 'Enter the canonical answer' : 'Add at least two choices and mark the correct one(s)');
      return;
    }
    setStep('saving');

    let data = state.buildSaveData();

    // Upload cropped data-URL image if present
    if (data.image_url && data.image_url.startsWith('data:')) {
      try {
        const blob = await (await fetch(data.image_url)).blob();
        const mime = data.image_url.slice(5, data.image_url.indexOf(';')) || 'image/jpeg';
        const ext = mime.split('/')[1] || 'jpg';
        const file = new File([blob], `card-image.${ext}`, { type: mime });
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        data.image_url = file_url;
      } catch {
        toast.error('Image upload failed');
        setStep('input');
        return;
      }
    }

    if (isCreate) {
      // Compute difficulty at creation unless overridden
      if (!data.difficulty_overridden) {
        try {
          const diff = await computeCardDifficulty({
            question_type: data.question_type,
            clue: data.clue,
            correct_answer: data.correct_answer,
            concept_id: null,
          });
          data.point_value = diff.point_value;
          data.difficulty_tier = diff.difficulty_tier;
          data.difficulty_overridden = false;
          setDifficultyResult(diff);
        } catch {
          data.point_value = 20;
          data.difficulty_tier = 2;
          setDifficultyResult({ point_value: 20, difficulty_tier: 2, _reason: '' });
        }
      }
      data.difficulty_tier = Math.max(1, Math.min(5, data.difficulty_tier || 2));
      data.point_value = Math.max(10, Math.round(data.point_value / 10) * 10);
      data.deck_id = deckId;
      data.order = activeCards.length;
      try {
        const created = await base44.entities.Card.create(data);
        setSavedCard(created);
        setOverrideValue(String(data.point_value));
        setStep('done');
        onSaved?.();
      } catch (e) {
        console.error('Card save failed:', e);
        toast.error('Could not save card: ' + (e?.message || 'Unknown error'));
        setStep('input');
      }
    } else {
      try {
        await base44.entities.Card.update(card.id, data);
        onSaved?.();
        if (afterSave) afterSave();
        else handleClose();
      } catch (e) {
        console.error('Card save failed:', e);
        toast.error('Could not save card: ' + (e?.message || 'Unknown error'));
        setStep('input');
      }
    }
  };

  const handleSaveAndNext = () => handleSave(onSaveAndNext);

  const handleAddAnother = () => {
    reset();
    onClose();
    onAddAnother?.();
  };

  const handleEditDetails = () => {
    const saved = savedCard;
    reset();
    onClose();
    onEditDetails?.(saved);
  };

  const onKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && state.canSave && step === 'input') handleSave();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) requestClose(); }}>
      <DialogContent className="!inset-0 !translate-x-0 !translate-y-0 w-screen h-screen max-w-none rounded-none sm:rounded-none p-0 overflow-hidden flex flex-col" onKeyDown={onKeyDown} hideClose>
          <DialogClose
            className="absolute right-3 top-2 z-50 flex items-center gap-1 rounded-md px-2 py-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            onMouseEnter={() => setCloseHovered(true)}
            onMouseLeave={() => setCloseHovered(false)}
          >
            <X className="w-4 h-4" />
            <span
              className="overflow-hidden text-xs font-medium transition-all duration-200"
              style={{ width: closeHovered ? '1.75rem' : 0, opacity: closeHovered ? 1 : 0 }}
            >
              Esc
            </span>
          </DialogClose>
        <AnimatePresence mode="wait">

          {/* ── STEP: input / saving / done ─────────────────────────────── */}
          {step === 'input' && (
            <motion.div
              key="input"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.18 }}
              className="flex flex-col h-full min-h-0"
            >
              {/* Header — title + top-level tabs */}
              <div className="flex items-center justify-between px-6 pt-4 pb-0 border-b border-border shrink-0">
                <h2 className="font-semibold text-base pr-4">{isCreate ? 'Create a Card' : 'Edit Card'}</h2>
                <div className="flex items-center pr-10">
                  {TABS.map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key)}
                      className={cn(
                        'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px',
                        activeTab === tab.key
                          ? 'border-primary text-primary'
                          : 'border-transparent text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Body */}
              <div className="flex-1 min-h-0 flex flex-col">
                {activeTab === 'edit' && (
                  <EditTabContent state={state} allTags={allTags} previewLayout={previewLayout} setPreviewLayout={setPreviewLayout} onOpenImageSource={(type) => { setActiveTab('image'); if (type === 'search') state.setShowImageSearch(true); else if (type === 'ai') state.setShowAiImageGen(true); }} />
                )}
                {activeTab === 'image' && (
                  <ImageTabContent state={state} previewLayout={previewLayout} setPreviewLayout={setPreviewLayout} />
                )}
                {activeTab === 'concepts' && (
                  <ConceptsTabContent state={state} allTags={allTags} />
                )}
                {activeTab === 'notes' && (
                  <NotesTabContent state={state} />
                )}
              </div>

              {/* Footer — pinned */}
              <div className="px-6 py-4 border-t border-border flex items-center justify-end gap-2 bg-muted/30 shrink-0">
                <Button variant="ghost" onClick={requestClose}>Cancel</Button>
                {!isCreate && onSaveAndNext && (
                  <Button variant="outline" onClick={handleSaveAndNext} disabled={!state.canSave || !hasNextCard} className="gap-1.5">
                    <ChevronRight className="w-4 h-4" /> Save &amp; Next
                  </Button>
                )}
                <Button onClick={() => handleSave()} disabled={!state.canSave} className="gap-1.5">
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

          {/* ── STEP: done (create mode only) ────────────────────────────── */}
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
                    : <span className="font-medium">{savedCard?.correct_answers}</span>}
                </p>
              </div>

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
                  <Pencil className="w-4 h-4" /> Edit details
                </Button>
                <Button variant="ghost" onClick={handleClose} className="gap-2 w-full text-muted-foreground">
                  Done
                </Button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>

        {/* Discard confirm */}
        <AlertDialog open={showDiscard} onOpenChange={setShowDiscard}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Discard changes?</AlertDialogTitle>
              <AlertDialogDescription>
                You have unsaved changes. If you close now they will be lost.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setShowDiscard(false)}>Keep editing</AlertDialogCancel>
              <AlertDialogAction onClick={handleClose} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Discard
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}