import { useState, useRef } from 'react';
import { Plus, X, Wand2, Image as ImageIcon, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import ReactQuill from 'react-quill';

export default function CardEditor({ card, onSave, onCancel }) {
  const [imageUrl, setImageUrl] = useState(card?.image_url || '');
  const [correctAnswer, setCorrectAnswer] = useState(card?.correct_answer || '');
  const [choices, setChoices] = useState(() => {
    if (card?.choices?.length) return card.choices.filter(c => c !== card.correct_answer);
    return ['', '', ''];
  });
  const [clue, setClue] = useState(card?.clue || '');
  const [explanation, setExplanation] = useState(card?.explanation || '');
  const [uploading, setUploading] = useState(false);
  const [generatingDecoys, setGeneratingDecoys] = useState(false);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const fileRef = useRef();

  const hasChanges = () => {
    if (imageUrl !== (card?.image_url || '')) return true;
    if (correctAnswer !== (card?.correct_answer || '')) return true;
    if (clue !== (card?.clue || '')) return true;
    if (explanation !== (card?.explanation || '')) return true;
    const origChoices = card?.choices?.filter(c => c !== card.correct_answer) || ['', '', ''];
    if (choices.join('|') !== origChoices.join('|')) return true;
    return false;
  };

  const handleCancel = () => {
    if (hasChanges()) setShowDiscardDialog(true);
    else onCancel();
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
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

  const handleSave = () => {
    if (!correctAnswer.trim()) { toast.error('Correct answer is required'); return; }
    const allChoices = [correctAnswer, ...choices.filter(c => c.trim())];
    if (allChoices.length < 2) { toast.error('Add at least one other choice'); return; }
    onSave({ image_url: imageUrl, correct_answer: correctAnswer, choices: allChoices, clue, explanation });
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
            <button
              onClick={(e) => { e.stopPropagation(); setImageUrl(''); }}
              className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1 hover:bg-black/80"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
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

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2 border-t border-border">
        <Button variant="ghost" onClick={handleCancel}>Cancel</Button>
        <Button onClick={handleSave}>Save Card</Button>
      </div>

      <AlertDialog open={showDiscardDialog} onOpenChange={setShowDiscardDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. If you close now they will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={onCancel} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}