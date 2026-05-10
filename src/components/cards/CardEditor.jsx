import { useState, useRef } from 'react';
import { Plus, X, Wand2, Image as ImageIcon, Loader2, ChevronDown, ChevronUp, Star, Pencil, Search } from 'lucide-react';
import ImageEditor from './ImageEditor';
import ImageSearchPanel from './ImageSearchPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import ReactQuill from 'react-quill';
import TagInput from './TagInput';
import ImagePickerFromDeck from './ImagePickerFromDeck';

export default function CardEditor({ card, onSave, onCancel, onDirtyChange, allTags = [] }) {
  const [imageUrl, setImageUrl] = useState(card?.image_url || '');
  const [correctAnswer, setCorrectAnswer] = useState(card?.correct_answer || '');
  const [choices, setChoices] = useState(() => {
    if (card?.choices?.length) return card.choices.filter(c => c !== card.correct_answer);
    return ['', '', ''];
  });
  const [clue, setClue] = useState(card?.clue || '');
  const [explanation, setExplanation] = useState(card?.explanation || '');
  const [tags, setTags] = useState(card?.tags || []);
  const [uploading, setUploading] = useState(false);
  const [generatingDecoys, setGeneratingDecoys] = useState(false);
  const [showImageEditor, setShowImageEditor] = useState(false);
  const [showImageSearch, setShowImageSearch] = useState(false);
  const [showImagePicker, setShowImagePicker] = useState(false);

  const fileRef = useRef();

  // Bonus question state
  const [showBonus, setShowBonus] = useState(!!(card?.bonus_question));
  const [bonusQuestion, setBonusQuestion] = useState(card?.bonus_question || '');
  const [bonusImageUrl, setBonusImageUrl] = useState(card?.bonus_image_url || '');
  const [bonusCorrectAnswer, setBonusCorrectAnswer] = useState(card?.bonus_correct_answer || '');
  const [bonusChoices, setBonusChoices] = useState(() => {
    if (card?.bonus_choices?.length) return card.bonus_choices.filter(c => c !== card.bonus_correct_answer);
    return ['', '', ''];
  });
  const [uploadingBonus, setUploadingBonus] = useState(false);
  const [generatingBonusDecoys, setGeneratingBonusDecoys] = useState(false);
  const bonusFileRef = useRef();

  const hasChanges = () => {
    if (imageUrl !== (card?.image_url || '')) return true;
    if (correctAnswer !== (card?.correct_answer || '')) return true;
    if (clue !== (card?.clue || '')) return true;
    if (explanation !== (card?.explanation || '')) return true;
    const origChoices = card?.choices?.filter(c => c !== card.correct_answer) || ['', '', ''];
    if (choices.join('|') !== origChoices.join('|')) return true;
    return false;
  };

  // Notify parent whenever dirty state changes
  const isDirty = hasChanges();
  const prevDirtyRef = useRef(false);
  if (isDirty !== prevDirtyRef.current) {
    prevDirtyRef.current = isDirty;
    onDirtyChange?.(isDirty);
  }

  const handleCancel = () => {
    onCancel();
  };

  const validateImageFile = (file) => {
    const MIN_SIZE = 10 * 1024; // 10 KB
    const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
    if (file.size < MIN_SIZE) {
      toast.error('Image is too small. Please upload at least 10 KB.');
      return false;
    }
    if (file.size > MAX_SIZE) {
      toast.error('Image is too large. Maximum size is 10 MB.');
      return false;
    }
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

  const updateChoice = (i, val) => {
    const next = [...choices];
    next[i] = val;
    setChoices(next);
  };

  const addChoice = () => {
    if (choices.length < 5) setChoices([...choices, '']);
  };

  const removeChoice = (i) => {
    setChoices(choices.filter((_, idx) => idx !== i));
  };

  const generateDecoys = async () => {
    if (!correctAnswer.trim()) { toast.error('Enter the correct answer first'); return; }
    setGeneratingDecoys(true);
    const needed = Math.max(1, 4 - choices.filter(c => c.trim()).length);
    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `Generate ${needed} plausible but incorrect answer choices (decoys) for a flashcard where the correct answer is "${correctAnswer}". Return only the decoy words/phrases as a JSON array of strings. No explanations.`,
      response_json_schema: {
        type: 'object',
        properties: { decoys: { type: 'array', items: { type: 'string' } } }
      }
    });
    const decoys = result?.decoys || [];
    const filledChoices = [...choices];
    let di = 0;
    for (let i = 0; i < filledChoices.length && di < decoys.length; i++) {
      if (!filledChoices[i].trim()) { filledChoices[i] = decoys[di++]; }
    }
    while (filledChoices.length < 5 && di < decoys.length) {
      filledChoices.push(decoys[di++]);
    }
    setChoices(filledChoices.slice(0, 5));
    setGeneratingDecoys(false);
    toast.success('Decoys generated');
  };

  const handleBonusImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!validateImageFile(file)) { e.target.value = ''; return; }
    setUploadingBonus(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setBonusImageUrl(file_url);
    setUploadingBonus(false);
  };

  const updateBonusChoice = (i, val) => {
    const next = [...bonusChoices];
    next[i] = val;
    setBonusChoices(next);
  };

  const generateBonusDecoys = async () => {
    if (!bonusCorrectAnswer.trim()) { toast.error('Enter the bonus correct answer first'); return; }
    setGeneratingBonusDecoys(true);
    const needed = Math.max(1, 5 - bonusChoices.filter(c => c.trim()).length);
    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `Generate ${needed} plausible but incorrect answer choices (decoys) for a flashcard where the correct answer is "${bonusCorrectAnswer}". Return only the decoy words/phrases as a JSON array of strings. No explanations.`,
      response_json_schema: {
        type: 'object',
        properties: { decoys: { type: 'array', items: { type: 'string' } } }
      }
    });
    const decoys = result?.decoys || [];
    const filled = [...bonusChoices];
    let di = 0;
    for (let i = 0; i < filled.length && di < decoys.length; i++) {
      if (!filled[i].trim()) filled[i] = decoys[di++];
    }
    while (filled.length < 5 && di < decoys.length) filled.push(decoys[di++]);
    setBonusChoices(filled.slice(0, 5));
    setGeneratingBonusDecoys(false);
    toast.success('Bonus decoys generated');
  };

  const handleSave = () => {
    if (!correctAnswer.trim()) { toast.error('Correct answer is required'); return; }
    const allChoices = [correctAnswer, ...choices.filter(c => c.trim())];
    if (allChoices.length < 2) { toast.error('Add at least one other choice'); return; }

    let bonusData = {};
    if (showBonus && bonusQuestion.trim() && bonusCorrectAnswer.trim()) {
      const allBonusChoices = [bonusCorrectAnswer, ...bonusChoices.filter(c => c.trim())];
      if (allBonusChoices.length >= 2) {
        bonusData = {
          bonus_question: bonusQuestion,
          bonus_image_url: bonusImageUrl,
          bonus_correct_answer: bonusCorrectAnswer,
          bonus_choices: allBonusChoices,
        };
      }
    } else if (!showBonus) {
      bonusData = { bonus_question: '', bonus_image_url: '', bonus_correct_answer: '', bonus_choices: [] };
    }

    onSave({ image_url: imageUrl, correct_answer: correctAnswer, choices: allChoices, clue, explanation, tags, ...bonusData });
  };

  return (
    <div className="space-y-5">
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
              <button
                onClick={(e) => { e.stopPropagation(); setImageUrl(''); }}
                className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1 hover:bg-black/80"
              >
                <X className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setShowImageEditor(true); }}
                className="absolute top-2 left-2 bg-black/60 text-white rounded-full p-1 hover:bg-black/80"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Accepted: JPG, PNG, GIF, WebP · Min 10 KB · Max 10 MB</p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => { setShowImagePicker(v => !v); setShowImageSearch(false); }}
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <ImageIcon className="w-3 h-3" /> Pick from decks
            </button>
            <button
              type="button"
              onClick={() => { setShowImageSearch(v => !v); setShowImagePicker(false); }}
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
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
            defaultQuery={correctAnswer || ''}
            onSelect={(url) => { setImageUrl(url); setShowImageSearch(false); }}
            onClose={() => setShowImageSearch(false)}
          />
        )}
      </div>

      {/* Correct Answer */}
      <div className="space-y-2">
        <Label>Correct Answer <span className="text-destructive">*</span></Label>
        <Input
          value={correctAnswer}
          onChange={e => setCorrectAnswer(e.target.value)}
          placeholder="The correct word or phrase"
        />
      </div>

      {/* Other Choices */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Other Choices (decoys)</Label>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={generateDecoys} disabled={generatingDecoys} className="h-7 text-xs gap-1">
              {generatingDecoys ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
              Auto-generate
            </Button>
            {choices.length < 5 && (
              <Button type="button" variant="outline" size="sm" onClick={addChoice} className="h-7 text-xs gap-1">
                <Plus className="w-3 h-3" /> Add
              </Button>
            )}
          </div>
        </div>
        <div className="space-y-2">
          {choices.map((c, i) => (
            <div key={i} className="flex gap-2">
              <Input
                value={c}
                onChange={e => updateChoice(i, e.target.value)}
                placeholder={`Choice ${i + 2}`}
              />
              {choices.length > 1 && (
                <Button type="button" variant="ghost" size="icon" onClick={() => removeChoice(i)} className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive">
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Short Clue */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Short Clue <span className="text-muted-foreground text-xs">(optional — one sentence, revealed before answering)</span></Label>
          <span className={`text-xs tabular-nums ${clue.length >= 180 ? 'text-destructive' : 'text-muted-foreground'}`}>
            {clue.length}/200
          </span>
        </div>
        <Input
          value={clue}
          onChange={e => setClue(e.target.value)}
          placeholder={'e.g. "This animal is the largest land mammal."'}
          maxLength={200}
        />
      </div>

      {/* Tags */}
      <div className="space-y-2">
        <Label>Tags <span className="text-muted-foreground text-xs">(optional — for filtering)</span></Label>
        <TagInput tags={tags} onChange={setTags} suggestions={allTags} />
      </div>

      {/* Long Explanation */}
      <div className="space-y-2">
        <Label>Explanation <span className="text-muted-foreground text-xs">(optional — shown on the back of the card)</span></Label>
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

      {/* Bonus Question Section */}
      <div className="border border-border rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setShowBonus(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/50 transition-colors"
        >
          <span className="flex items-center gap-1.5"><Star className="w-4 h-4 text-amber-400 fill-amber-400" /> Bonus Question <span className="text-muted-foreground font-normal">(optional — shown after correct answer)</span></span>
          {showBonus ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </button>

        {showBonus && (
          <div className="px-4 pb-4 space-y-4 border-t border-border pt-4">
            {/* Bonus Question Text */}
            <div className="space-y-1.5">
              <Label>Question</Label>
              <Input
                value={bonusQuestion}
                onChange={e => setBonusQuestion(e.target.value)}
                placeholder="e.g. What is its scientific name?"
              />
            </div>

            {/* Bonus Image (optional alternate) */}
            <div className="space-y-1.5">
              <Label>Alternate Image <span className="text-muted-foreground text-xs">(optional — uses main image if blank)</span></Label>
              <div
                onClick={() => bonusFileRef.current?.click()}
                className="relative border-2 border-dashed border-border rounded-xl overflow-hidden cursor-pointer hover:border-primary/50 transition-colors"
              >
                {bonusImageUrl ? (
                  <>
                    <img src={bonusImageUrl} alt="bonus" className="w-full h-32 object-cover" />
                    <button
                      onClick={(e) => { e.stopPropagation(); setBonusImageUrl(''); }}
                      className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1 hover:bg-black/80"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center h-24 gap-1.5 text-muted-foreground">
                    {uploadingBonus ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImageIcon className="w-6 h-6" />}
                    <span className="text-xs">{uploadingBonus ? 'Uploading…' : 'Click to upload alternate image'}</span>
                  </div>
                )}
              </div>
              <input ref={bonusFileRef} type="file" accept="image/*" className="hidden" onChange={handleBonusImageUpload} />
            </div>

            {/* Bonus Correct Answer */}
            <div className="space-y-1.5">
              <Label>Correct Answer <span className="text-destructive">*</span></Label>
              <Input
                value={bonusCorrectAnswer}
                onChange={e => setBonusCorrectAnswer(e.target.value)}
                placeholder="The correct word or phrase"
              />
            </div>

            {/* Bonus Decoys */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Other Choices (decoys)</Label>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={generateBonusDecoys} disabled={generatingBonusDecoys} className="h-7 text-xs gap-1">
                    {generatingBonusDecoys ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                    Auto-generate
                  </Button>
                  {bonusChoices.length < 5 && (
                    <Button type="button" variant="outline" size="sm" onClick={() => setBonusChoices(c => [...c, ''])} className="h-7 text-xs gap-1">
                      <Plus className="w-3 h-3" /> Add
                    </Button>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                {bonusChoices.map((c, i) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      value={c}
                      onChange={e => updateBonusChoice(i, e.target.value)}
                      placeholder={`Choice ${i + 2}`}
                    />
                    {bonusChoices.length > 1 && (
                      <Button type="button" variant="ghost" size="icon" onClick={() => setBonusChoices(bonusChoices.filter((_, idx) => idx !== i))} className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive">
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2 border-t border-border">
        <Button variant="ghost" onClick={handleCancel}>Cancel</Button>
        <Button onClick={handleSave}>Save Card</Button>
      </div>

      {showImageEditor && imageUrl && (
        <ImageEditor
          open={showImageEditor}
          imageUrl={imageUrl}
          onClose={() => setShowImageEditor(false)}
          onSave={async (dataUrl) => {
            setShowImageEditor(false);
            setUploading(true);
            const blob = await (await fetch(dataUrl)).blob();
            const file = new File([blob], 'edited-image.jpg', { type: 'image/jpeg' });
            const { file_url } = await base44.integrations.Core.UploadFile({ file });
            setImageUrl(file_url);
            setUploading(false);
          }}
        />
      )}

    </div>
  );
}