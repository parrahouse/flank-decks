import { useState, useRef } from 'react';
import { Plus, X, Wand2, Image as ImageIcon, Loader2, Pencil, Search } from 'lucide-react';
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

// Parse pipe-delimited correct_answers string into array
const parseCorrectAnswers = (str) => str ? str.split('|').map(s => s.trim()).filter(Boolean) : [];
const joinCorrectAnswers = (arr) => arr.join('|');

export default function CardEditor({ card, onSave, onCancel, onDirtyChange, allTags = [] }) {
  const [activeTab, setActiveTab] = useState('edit');
  const initQType = card?.question_type || 'multiple_choice';
  const initCorrectAnswers = parseCorrectAnswers(card?.correct_answers || card?.correct_answer || '');

  const [qType, setQType] = useState(initQType);
  const [imageUrl, setImageUrl] = useState(card?.image_url || '');

  // All choices (including correct ones)
  const [allChoicesList, setAllChoicesList] = useState(() => {
    if (card?.choices?.length) return card.choices;
    if (initQType === 'true_false') return ['True', 'False'];
    return ['', '', '', ''];
  });

  // Which choices are marked correct (a Set of choice strings)
  const [correctSet, setCorrectSet] = useState(() => new Set(initCorrectAnswers));

  const [clue, setClue] = useState(card?.clue || '');
  const [explanation, setExplanation] = useState(card?.explanation || '');
  const [tags, setTags] = useState(card?.tags || []);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generatingDecoys, setGeneratingDecoys] = useState(false);
  const [showImageEditor, setShowImageEditor] = useState(false);
  const [showImageSearch, setShowImageSearch] = useState(false);
  const [showImagePicker, setShowImagePicker] = useState(false);

  const fileRef = useRef();

  // Bonus question state


  // Dirty tracking
  const prevDirtyRef = useRef(false);
  const isDirty = true;
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
    setUploading(false);
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
  };

  // ── Choices management ────────────────────────────────────────────────────
  const updateChoice = (i, val) => {
    const next = [...allChoicesList];
    if (correctSet.has(next[i])) {
      const ns = new Set(correctSet);
      ns.delete(next[i]);
      if (val.trim()) ns.add(val);
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
    ns.delete(val);
    setCorrectSet(ns);
    setAllChoicesList(allChoicesList.filter((_, idx) => idx !== i));
  };

  const toggleCorrect = (choice) => {
    if (!choice.trim()) return;
    const ns = new Set(correctSet);
    if (qType === 'select_all') {
      if (ns.has(choice)) ns.delete(choice);
      else ns.add(choice);
    } else {
      ns.clear();
      ns.add(choice);
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

  const handleSave = async () => {
    const filledChoices = allChoicesList.filter(c => c.trim());
    const correctList = Array.from(correctSet).filter(c => filledChoices.includes(c));

    if (correctList.length === 0) { toast.error('Mark at least one correct answer'); return; }
    if (filledChoices.length < 2) { toast.error('Add at least two choices'); return; }
    if (qType === 'select_all' && correctList.length < 2) {
      toast.error('Select All requires at least 2 correct answers'); return;
    }

    const correct_answers = joinCorrectAnswers(correctList);

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
      correct_answers,
      correct_answer: correctList[0], // legacy compat
      choices: filledChoices,
      question_type: qType,
      clue,
      explanation,
      tags,
    });
  };

  const isTrueFalse = qType === 'true_false';
  const isSelectAll = qType === 'select_all';

  return (
    <div className="space-y-5">

      {/* Tabs */}
      <div className="flex border-b border-border -mx-0 mb-1">
        {['edit', 'concepts'].map(tab => (
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
            {tab === 'edit' ? 'Edit' : 'Concepts'}
          </button>
        ))}
      </div>

      {activeTab === 'concepts' && <ConceptsTab card={card} />}
      {activeTab === 'concepts' && (
        <div className="sticky bottom-0 bg-card flex justify-end gap-2 pt-2 pb-1 border-t border-border mt-2">
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
          </SelectContent>
        </Select>
        {isSelectAll && (
          <p className="text-xs text-muted-foreground">Mark all correct answers — students must select all of them to get full credit.</p>
        )}
      </div>

      {/* Image Upload */}
      <div className="space-y-2">
        <Label>Image</Label>
        <div
          onClick={() => fileRef.current?.click()}
          className="relative border-2 border-dashed border-border rounded-xl overflow-hidden cursor-pointer hover:border-primary/50 transition-colors"
          style={{ minHeight: 180 }}
        >
          {imageUrl ? (
            <img src={imageUrl} alt="card" className="w-full h-48 object-cover" />
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
            <button type="button" onClick={() => { setShowImagePicker(v => !v); setShowImageSearch(false); }} className="flex items-center gap-1 text-xs text-primary hover:underline">
              <ImageIcon className="w-3 h-3" /> Pick from decks
            </button>
            <button type="button" onClick={() => { setShowImageSearch(v => !v); setShowImagePicker(false); }} className="flex items-center gap-1 text-xs text-primary hover:underline">
              <Search className="w-3 h-3" /> Search Wikimedia
            </button>
          </div>
        </div>
        {showImagePicker && (
          <ImagePickerFromDeck
            onSelect={(url) => { setImageUrl(url); setShowImagePicker(false); }}
            onClose={() => setShowImagePicker(false)}
          />
        )}
        {showImageSearch && (
          <ImageSearchPanel
            defaultQuery={Array.from(correctSet)[0] || ''}
            onSelect={(url) => { setImageUrl(url); setShowImageSearch(false); }}
            onClose={() => setShowImageSearch(false)}
          />
        )}
      </div>

      {/* Answer Choices */}
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
            const isCorrect = correctSet.has(c);
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

      {/* Short Clue */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-1.5">Short Clue <InfoTooltip text="Optional — one sentence, revealed before answering" /></Label>
          <span className={`text-xs tabular-nums ${clue.length >= 180 ? 'text-destructive' : 'text-muted-foreground'}`}>
            {clue.length}/200
          </span>
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

      {/* Tags */}
      <div className="space-y-2">
        <Label className="flex items-center gap-1.5">Tags <InfoTooltip text="Optional — add tags to filter and group cards" /></Label>
        <TagInput tags={tags} onChange={setTags} suggestions={allTags} />
      </div>

      {/* Long Explanation */}
      <div className="space-y-2">
        <Label className="flex items-center gap-1.5">Explanation <InfoTooltip text="Optional — shown on the back of the card after answering" /></Label>
        <div className="quill-wrapper border border-input overflow-hidden" style={{ borderRadius: 0 }}>
          <ReactQuill
            theme="snow"
            value={explanation}
            onChange={setExplanation}
            placeholder="Write a longer explanation, context, or notes…"
            modules={{ toolbar: [['bold', 'italic', 'underline'], [{ list: 'ordered' }, { list: 'bullet' }], ['link'], ['clean']] }}
            style={{ minHeight: 120 }}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="sticky bottom-0 bg-card flex justify-end gap-2 pt-2 pb-1 border-t border-border mt-2">
        <Button variant="ghost" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading…</> : 'Save Card'}
        </Button>
      </div>

      {showImageEditor && imageUrl && (
        <ImageEditor
          open={showImageEditor}
          imageUrl={imageUrl}
          onClose={() => setShowImageEditor(false)}
          onSave={(dataUrl) => {
            setShowImageEditor(false);
            setImageUrl(dataUrl);
          }}
        />
      )}
      </>}
    </div>
  );
}