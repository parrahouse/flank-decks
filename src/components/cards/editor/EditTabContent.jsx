import {
  Upload, Search, Sparkles, Loader2, Plus, X, Minus, Zap, RotateCcw,
  Tags, Lightbulb, AlertTriangle, Wand2, Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import InfoTooltip from '../InfoTooltip';
import TagInput from '../TagInput';
import MathButton from '../MathInputPopover';
import MarkdownQuill from '../MarkdownQuill';
import PreviewPane from './PreviewPane';
import { cn } from '@/lib/utils';

/**
 * EditTabContent — two-column body for the "Edit" tab.
 * Left: the form (what the card says). Right: live preview + explanation.
 */
export default function EditTabContent({ state, allTags, previewLayout, setPreviewLayout }) {
  const s = state;

  const imageEmpty = (s.imageCard && !s.imageUrl) ? (
    <div className="w-full h-full flex flex-col items-center justify-center gap-2 border-2 border-dashed border-muted-foreground/30 rounded p-4">
      <button
        type="button"
        onClick={() => s.fileRef.current?.click()}
        className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary/10 text-primary hover:bg-primary/15 transition-colors text-sm font-medium"
      >
        <Upload className="w-4 h-4" /> Upload a File
      </button>
      {s.imageSeed && (
        <button
          type="button"
          onClick={() => s.setShowImageSearch(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-md bg-muted hover:bg-muted/70 transition-colors text-sm font-medium"
        >
          <Search className="w-4 h-4" /> Search Images
        </button>
      )}
      {s.imageSeed && (
        <button
          type="button"
          onClick={() => s.setShowAiImageGen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-md bg-muted hover:bg-muted/70 transition-colors text-sm font-medium"
        >
          <Sparkles className="w-4 h-4" /> Create with AI
        </button>
      )}
    </div>
  ) : null;

  const imageOverlay = (s.imageCard && s.imageUrl) ? (
    <button
      type="button"
      onClick={() => { s.setImageUrl(''); s.setOriginalImageUrl(null); }}
      title="Remove image"
      className="absolute top-2 right-2 z-10 w-8 h-8 rounded-full bg-white shadow-md border border-border flex items-center justify-center hover:scale-105 transition-transform"
    >
      <Trash2 className="w-4 h-4 text-red-600" />
    </button>
  ) : null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-[minmax(360px,420px)_1fr] flex-1 min-h-0 overflow-y-auto md:overflow-hidden">
      {/* ── Left: form ─────────────────────────────────────────────────────── */}
      <div className="px-6 py-5 space-y-5 min-h-0 md:overflow-y-auto">
        {/* Question Type */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Question Type</label>
          <Select value={s.qType} onValueChange={s.handleQTypeChange}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="multiple_choice">Multiple Choice</SelectItem>
              <SelectItem value="true_false">True / False</SelectItem>
              <SelectItem value="select_all">Select All That Apply</SelectItem>
              <SelectItem value="short_answer">Short Answer</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground min-h-[1rem]">
            {s.isMultipleChoice && 'Students pick one correct answer from a list of choices.'}
            {s.isSelectAll && 'Students must select every correct answer to earn full credit.'}
            {s.isTrueFalse && 'Write a statement in the question field — students decide if it\'s True or False.'}
            {s.isShortAnswer && 'Students type a free-text response graded by exact match then AI fallback.'}
          </p>
        </div>

        {/* Draft with AI + Image Card */}
        <div className="flex items-center justify-between gap-4">
          <Button variant="secondary" size="sm" onClick={s.handleAiSuggest} disabled={s.suggestingCard} className="gap-1.5 h-8 text-xs">
            {s.suggestingCard
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Thinking…</>
              : <><Sparkles className="w-3.5 h-3.5" /> Draft with AI</>}
          </Button>
          {s.isCreate && (
            <label className="flex items-center gap-2 text-sm font-medium cursor-pointer select-none">
              <Checkbox checked={s.imageCard} onCheckedChange={(v) => s.setImageCard(!!v)} />
              Image Card
            </label>
          )}
        </div>

        {/* Question / Clue */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">
              {s.isTrueFalse ? 'Statement' : 'Question / Clue'}
            </label>
            <span className={cn('text-xs tabular-nums', s.clue.length >= 180 ? 'text-destructive' : 'text-muted-foreground')}>
              {s.clue.length}/200
            </span>
          </div>
          <Textarea
            value={s.clue}
            onChange={e => s.setClue(e.target.value)}
            placeholder={s.isTrueFalse
              ? 'e.g. "The Earth is the third planet from the Sun."'
              : 'e.g. "This is the largest planet in the solar system."'}
            maxLength={200}
            rows={3}
            className="resize-none text-sm"
          />
        </div>

        {/* Answer section */}
        {s.isShortAnswer ? (
          <ShortAnswerFields state={s} />
        ) : (
          <AnswerBank state={s} />
        )}

        {/* Difficulty / Point Value */}
        <DifficultySection state={s} />

        {/* Tags */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-1.5">Tags <InfoTooltip text="Optional — add tags to filter and group cards" /></Label>
            <button type="button" onClick={s.suggestTags} disabled={s.suggestingTags} className="flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50">
              {s.suggestingTags ? <Loader2 className="w-3 h-3 animate-spin" /> : <Tags className="w-3 h-3" />}
              Suggest tags
            </button>
          </div>
          <TagInput tags={s.tags} onChange={s.setTags} suggestions={allTags} />
        </div>

        <div className="flex items-start gap-2 pt-1 text-xs text-muted-foreground">
          <Lightbulb className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <p>Switch to the Image, Concepts, or Notes tabs above to refine those facets.</p>
        </div>
      </div>

      {/* ── Right: preview + explanation ──────────────────────────────────── */}
      <div className="relative px-6 py-5 md:border-l border-border bg-muted/20 min-h-0 md:overflow-y-auto">
        <PreviewPane state={s} previewLayout={previewLayout} setPreviewLayout={setPreviewLayout} imageEmpty={imageEmpty} imageOverlay={imageOverlay}>
          <input ref={s.fileRef} type="file" accept="image/*" className="hidden" onChange={s.handleImageUpload} />
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Explanation</label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={s.handleGenerateExplanation}
                  disabled={s.generatingExplanation}
                  className="flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50"
                >
                  {s.generatingExplanation ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                  AI Generate
                </button>
                <MathButton onInsert={(latex) => {
                  const quill = s.quillRef.current?.getEditor();
                  if (quill) {
                    const range = quill.getSelection(true);
                    quill.insertText(range.index, latex, 'user');
                    quill.setSelection(range.index + latex.length);
                  } else {
                    s.setExplanation(prev => prev + latex);
                  }
                }} />
              </div>
            </div>
            <div className="quill-wrapper border border-input overflow-visible" style={{ borderRadius: 0 }}>
              <MarkdownQuill
                ref={s.quillRef}
                value={s.explanation}
                onChange={s.setExplanation}
                placeholder="Optional long-form explanation shown after answering (supports markdown)…"
                style={{ minHeight: 300 }}
              />
            </div>
          </div>
        </PreviewPane>
      </div>
    </div>
  );
}

// ── Short answer sub-section ──────────────────────────────────────────────────
function ShortAnswerFields({ state: s }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">Canonical Answer <span className="text-destructive">*</span></label>
      <Input
        value={s.canonicalAnswer}
        onChange={e => s.setCanonicalAnswer(e.target.value)}
        placeholder="The single authoritative correct answer"
      />
      <p className="text-xs text-muted-foreground">The authoritative correct answer — variants and grading guidance below.</p>

      <div className="space-y-4 border border-border rounded-lg p-4 bg-accent/10 mt-2">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Accepted Variants <span className="text-xs text-muted-foreground font-normal">(optional)</span></label>
          <div className="flex gap-2">
            <Input
              value={s.newVariant}
              onChange={e => s.setNewVariant(e.target.value)}
              placeholder="Add an alternate acceptable answer…"
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (s.newVariant.trim()) { s.setAcceptedVariants(prev => [...prev, s.newVariant.trim()]); s.setNewVariant(''); }
                }
              }}
            />
            <Button type="button" variant="outline" size="sm" onClick={() => { if (s.newVariant.trim()) { s.setAcceptedVariants(prev => [...prev, s.newVariant.trim()]); s.setNewVariant(''); } }}>
              <Plus className="w-3.5 h-3.5" />
            </Button>
          </div>
          {s.acceptedVariants.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-1">
              {s.acceptedVariants.map((v, i) => (
                <span key={i} className="flex items-center gap-1 bg-secondary text-secondary-foreground px-2 py-0.5 rounded text-xs">
                  {v}
                  <button type="button" onClick={() => s.setAcceptedVariants(prev => prev.filter((_, idx) => idx !== i))}>
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Grading Guidance <span className="text-xs text-muted-foreground font-normal">(optional AI rubric)</span></label>
          <Textarea
            value={s.gradingGuidance}
            onChange={e => s.setGradingGuidance(e.target.value)}
            placeholder='e.g. "Must mention both photosynthesis and chlorophyll for full credit; one alone is partial"'
            rows={2}
            className="resize-none text-sm"
          />
        </div>

        <div className="space-y-1.5 border-t border-border pt-3">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Test Grading Preview</label>
          <p className="text-xs text-muted-foreground">Type a sample response to see how the grader would score it.</p>
          <div className="flex gap-2">
            <Input
              value={s.testResponse}
              onChange={e => s.setTestResponse(e.target.value)}
              placeholder="Sample student response…"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!s.testResponse.trim() || s.testGrading || !s.canonicalAnswer.trim()}
              onClick={s.handleTestGrading}
            >
              {s.testGrading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Test'}
            </Button>
          </div>
          {s.testVerdict && (
            <div className={cn('text-xs px-3 py-2 rounded border mt-1',
              s.testVerdict.verdict === 'correct' ? 'bg-green-50 border-green-200 text-green-800' :
              s.testVerdict.verdict === 'partial' ? 'bg-amber-50 border-amber-200 text-amber-800' :
              'bg-red-50 border-red-200 text-red-800'
            )}>
              <span className="font-semibold">
                {s.testVerdict.verdict === 'correct' ? '✓ Correct' : s.testVerdict.verdict === 'partial' ? '~ Partial' : '✗ Incorrect'}
              </span>
              {' '}(Tier {s.testVerdict.tier}
              {s.testVerdict.value !== undefined ? `, score: ${s.testVerdict.value}` : ''})
              {s.testVerdict.reason && <span> — {s.testVerdict.reason}</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Answer bank sub-section ───────────────────────────────────────────────────
function AnswerBank({ state: s }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">Answer Bank</label>
        {!s.isTrueFalse && (
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={s.generateDecoys} disabled={s.generatingDecoys} className="h-7 text-xs gap-1">
              {s.generatingDecoys ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
              Decoys
            </Button>
            {s.choicesList.length < 6 && (
              <Button type="button" variant="outline" size="sm" onClick={s.addChoice} className="h-7 text-xs gap-1">
                <Plus className="w-3 h-3" /> Add
              </Button>
            )}
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {s.isSelectAll
          ? 'Fill at least two options and tick every correct one. Untick the distractors.'
          : s.isTrueFalse
            ? 'Tick whether the statement is True or False.'
            : 'Fill at least two options and tick the single correct one. Leave the rest as distractors.'}
      </p>

      <div className="space-y-2">
        {s.choicesList.map((c, i) => {
          const isCorrect = s.correctSet.has(c.trim());
          return (
            <div key={i} className="flex gap-2 items-center">
              <button
                type="button"
                tabIndex={-1}
                onClick={() => s.toggleCorrect(c)}
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
                onChange={e => s.updateChoice(i, e.target.value)}
                placeholder={i === 0 ? 'Correct answer (required)' : `Option ${i + 1}`}
                readOnly={s.isTrueFalse}
                className={cn(s.isTrueFalse && 'bg-muted cursor-default', isCorrect && 'border-success/60 bg-success/5')}
              />
              {!s.isTrueFalse && s.choicesList.length > 2 && (
                <Button type="button" variant="ghost" size="icon" tabIndex={-1} onClick={() => s.removeChoice(i)} className="shrink-0 p-0 h-7 w-7 rounded-md bg-muted text-muted-foreground hover:bg-red-100 hover:text-red-600">
                  <Minus className="w-4 h-4" />
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {s.filledChoices.length >= 2 && s.correctFilled.length === 0 && (
        <p className="text-xs text-destructive">Tick the correct answer{s.isSelectAll ? 's' : ''}.</p>
      )}
      {s.isSelectAll && s.correctFilled.length === 1 && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-800">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
          <p className="text-xs font-medium leading-snug">Select All with one correct answer behaves like Multiple Choice. Tick at least two, or switch the type.</p>
        </div>
      )}
    </div>
  );
}

// ── Difficulty sub-section ────────────────────────────────────────────────────
function DifficultySection({ state: s }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-amber-500" /> Point Value
          <InfoTooltip text="Points awarded for a correct answer. Computed once at creation from question type and graph depth. Override to lock." />
        </Label>
        {!s.difficultyOverridden && (
          <button
            type="button"
            onClick={() => s.recomputeDifficulty(s.qType, s.clue, Array.from(s.correctSet)[0] || s.canonicalAnswer || '')}
            disabled={s.recomputingDifficulty}
            className="flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50"
          >
            {s.recomputingDifficulty ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
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
          value={s.pointValue}
          onChange={e => {
            s.setPointValue(parseInt(e.target.value, 10) || 20);
            s.setDifficultyOverridden(true);
          }}
          className="w-24 border border-input rounded px-2 py-1.5 text-sm text-center"
        />
        {s.difficultyTier && <span className="text-xs text-muted-foreground">Tier {s.difficultyTier} / 5</span>}
        {s.difficultyOverridden ? (
          <button
            type="button"
            onClick={() => {
              s.setDifficultyOverridden(false);
              s.recomputeDifficulty(s.qType, s.clue, Array.from(s.correctSet)[0] || s.canonicalAnswer || '');
            }}
            className="text-xs text-amber-600 hover:underline flex items-center gap-1"
          >
            <RotateCcw className="w-3 h-3" /> Reset to computed
          </button>
        ) : (
          <span className="text-xs text-muted-foreground italic">auto-computed</span>
        )}
      </div>
      {s.difficultyReason && !s.difficultyOverridden && (
        <p className="text-xs text-muted-foreground">{s.difficultyReason}</p>
      )}
    </div>
  );
}