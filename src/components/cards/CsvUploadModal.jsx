import { useRef, useState } from 'react';
import { Upload, FileText, AlertCircle, CheckCircle2, Loader2, Download } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return { rows: [], error: 'File must have a header row and at least one data row.' };

  // Parse a single CSV line respecting quoted fields
  const parseLine = (line) => {
    const result = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        result.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    result.push(cur.trim());
    return result;
  };

  const headers = parseLine(lines[0]).map(h => h.toLowerCase().replace(/\s+/g, '_'));

  // Backfill mode: id + point_value only (no correct_answers required)
  const isBackfillMode = headers.includes('id') && headers.includes('point_value') && !headers.includes('correct_answers');
  if (!isBackfillMode && !headers.includes('correct_answers')) {
    return { rows: [], error: 'Missing required column: correct_answers (or use id+point_value for difficulty backfill)' };
  }

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const vals = parseLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => { row[h] = vals[idx] || ''; });
    rows.push(row);
  }

  return { rows, error: null, isBackfillMode: headers.includes('id') && headers.includes('point_value') && !headers.includes('correct_answers') };
}

export function rowToCard(row, deckId, order) {
  const correctAnswers = row.correct_answers?.trim();
  if (!correctAnswers) return null;

  const questionType = row.question_type?.trim() || 'multiple_choice';
  const isShortAnswer = questionType === 'short_answer';

  const allCorrect = correctAnswers.split('|').map(s => s.trim()).filter(Boolean);
  const firstCorrect = allCorrect[0] || '';
  const decoys = [2, 3, 4, 5, 6]
    .map(n => row[`choice_${n}`]?.trim())
    .filter(Boolean);

  if (!isShortAnswer && decoys.length === 0) return null; // need at least one decoy for choice-based types

  const canonicalAnswer = row.canonical_answer?.trim() || (isShortAnswer ? firstCorrect : '');

  const explicitPointValue = row.point_value ? parseInt(row.point_value, 10) : null;
  const explicitTier = row.difficulty_tier ? parseInt(row.difficulty_tier, 10) : null;

  return {
    deck_id: deckId,
    order,
    correct_answers: correctAnswers,
    correct_answer: firstCorrect,
    question_type: questionType,
    choices: isShortAnswer ? [] : [...allCorrect, ...decoys],
    clue: (row.written_question ?? row.clue)?.trim() || '',
    explanation: row.explanation?.trim() || '',
    image_url: row.image_url?.trim() || '',
    tags: row.tags ? row.tags.split(';').map(t => t.trim().toLowerCase()).filter(Boolean) : [],
    point_value: !isNaN(explicitPointValue) && explicitPointValue > 0 ? explicitPointValue : 20,
    ...(explicitTier && !isNaN(explicitTier) && { difficulty_tier: explicitTier }),
    difficulty_overridden: !!(explicitPointValue && !isNaN(explicitPointValue)),
    ...(isShortAnswer && {
      canonical_answer: canonicalAnswer,
      accepted_variants: [],
      grading_guidance: '',
    }),
  };
}

export const SAMPLE_CSV = `correct_answers,question_type,choice_2,choice_3,choice_4,choice_5,choice_6,canonical_answer,written_question,explanation,image_url,tags
Elephant,multiple_choice,Lion,Giraffe,Zebra,Hippopotamus,Rhinoceros,,Which is the largest land animal?,Elephants are the largest land mammals on Earth reaching up to 13 feet tall.,,animals;vocabulary
Sahara,multiple_choice,Gobi,Kalahari,Atacama,Arabian,Mojave,,What is the world's largest hot desert?,The Sahara covers about 9.2 million square kilometers across North Africa.,,geography;places
True,true_false,False,,,,,,,Does the Earth orbit the Sun?,,science
Mitosis|Meiosis,select_all,Photosynthesis,Osmosis,Respiration,Fermentation,,,Which of the following are types of cell division?,Mitosis produces two identical daughter cells; meiosis produces four genetically unique cells.,,vocabulary
Photosynthesis,short_answer,,,,,,Photosynthesis,What process do plants use to convert sunlight into food?,Plants use chlorophyll to absorb sunlight and convert CO2 and water into glucose and oxygen.,,science`;

export default function CsvUploadModal({ open, onClose, deckId, existingCount, onImported }) {
  const fileRef = useRef();
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState(null); // { cards, errors, isBackfill }
  const [importing, setImporting] = useState(false);

  const handleFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const { rows, error, isBackfillMode } = parseCSV(e.target.result);
      if (error) { setPreview({ cards: [], errors: [error], isBackfill: false }); return; }

      const errors = [];
      const cards = [];

      if (isBackfillMode) {
        // Backfill mode: rows are {id, point_value, difficulty_tier?}
        rows.forEach((row, i) => {
          const id = row.id?.trim();
          const pv = parseInt(row.point_value, 10);
          if (!id || isNaN(pv)) { errors.push(`Row ${i + 2}: id and point_value required for backfill.`); return; }
          const update = { id, point_value: pv, difficulty_overridden: true };
          if (row.difficulty_tier) { const t = parseInt(row.difficulty_tier, 10); if (!isNaN(t)) update.difficulty_tier = t; }
          cards.push(update);
        });
      } else {
        rows.forEach((row, i) => {
          const card = rowToCard(row, deckId, existingCount + i);
          if (!card) errors.push(`Row ${i + 2}: missing correct_answers, or missing decoy choices (required for non-short_answer types).`);
          else cards.push(card);
        });
      }

      setPreview({ cards, errors, isBackfill: isBackfillMode });
    };
    reader.readAsText(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file?.name.endsWith('.csv')) handleFile(file);
    else toast.error('Please drop a .csv file');
  };

  const handleImport = async () => {
    if (!preview?.cards?.length) return;
    setImporting(true);
    if (preview.isBackfill) {
      // Backfill: update existing cards by id (no AI)
      await base44.entities.Card.bulkUpdate(preview.cards);
      setImporting(false);
      onImported();
      onClose();
      toast.success(`${preview.cards.length} cards updated with new point values!`);
    } else {
      await base44.entities.Card.bulkCreate(preview.cards);
      setImporting(false);
      onImported();
      onClose();
      toast.success(`${preview.cards.length} cards imported!`);
    }
  };

  const downloadSample = () => {
    const blob = new Blob([SAMPLE_CSV], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'flashdeck_sample.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const reset = () => setPreview(null);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Bulk Import Cards via CSV</DialogTitle>
          <DialogDescription>
            Upload a CSV file to create multiple cards at once.
          </DialogDescription>
        </DialogHeader>

        {!preview ? (
          <div className="space-y-4">
            {/* Format guide */}
            <div className="bg-muted/60 rounded-xl px-4 py-3 text-xs text-muted-foreground space-y-2.5">
              <p className="font-medium text-foreground text-sm">How to fill the CSV</p>

              <div className="space-y-1">
                <p className="font-medium text-foreground">1. correct_answers <span className="text-destructive">*required</span></p>
                <p>The correct answer text. For <strong>select_all</strong> questions, pipe-separate multiple answers: <code className="bg-background px-1 rounded">Answer1|Answer2</code></p>
              </div>

              <div className="space-y-1">
                <p className="font-medium text-foreground">2. question_type</p>
                <p>One of: <code className="bg-background px-1 rounded">multiple_choice</code> (default), <code className="bg-background px-1 rounded">true_false</code>, <code className="bg-background px-1 rounded">select_all</code>, or <code className="bg-background px-1 rounded">short_answer</code></p>
              </div>

              <div className="space-y-1">
                <p className="font-medium text-foreground">3. choice_2 … choice_6</p>
                <p>Wrong answer choices (decoys). Required for <code className="bg-background px-1 rounded">multiple_choice</code>, <code className="bg-background px-1 rounded">true_false</code>, and <code className="bg-background px-1 rounded">select_all</code>. Leave blank for <code className="bg-background px-1 rounded">short_answer</code>.</p>
              </div>

              <div className="space-y-1">
                <p className="font-medium text-foreground">4. canonical_answer</p>
                <p>For <code className="bg-background px-1 rounded">short_answer</code> only — the authoritative answer used for AI grading. Falls back to <code className="bg-background px-1 rounded">correct_answers</code> if omitted.</p>
              </div>

              <div className="space-y-1">
                <p className="font-medium text-foreground">5. Optional columns</p>
                <p>
                  <code className="bg-background px-1 rounded">written_question</code> — question prompt ·{' '}
                  <code className="bg-background px-1 rounded">explanation</code> — shown after answering ·{' '}
                  <code className="bg-background px-1 rounded">image_url</code> — direct image URL ·{' '}
                  <code className="bg-background px-1 rounded">tags</code> — semicolon-separated ·{' '}
                  <code className="bg-background px-1 rounded">point_value</code> — overrides computed points
                </p>
              </div>

              <div className="space-y-1 border-t border-border pt-2 mt-1">
                <p className="font-medium text-foreground">Difficulty Backfill Mode</p>
                <p>To update point values on existing cards without reimporting content, create a CSV with only <code className="bg-background px-1 rounded">id</code>, <code className="bg-background px-1 rounded">point_value</code>, and optionally <code className="bg-background px-1 rounded">difficulty_tier</code>. Omit <code className="bg-background px-1 rounded">correct_answers</code> to activate this mode. No AI is called.</p>
              </div>
            </div>

            {/* Drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              className={cn(
                'border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-2 py-10 cursor-pointer transition-colors',
                dragging ? 'border-primary bg-accent/40' : 'border-border hover:border-primary/50'
              )}
            >
              <Upload className="w-7 h-7 text-muted-foreground" />
              <p className="text-sm font-medium">Drop a CSV file here or click to browse</p>
              <p className="text-xs text-muted-foreground">.csv files only</p>
            </div>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={e => handleFile(e.target.files[0])} />

            <div className="flex justify-between items-center">
              <Button variant="ghost" size="sm" onClick={downloadSample} className="gap-1.5 text-xs text-muted-foreground">
                <Download className="w-3.5 h-3.5" /> Download sample CSV
              </Button>
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Errors */}
            {preview.errors.length > 0 && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-3 space-y-1">
                <p className="text-xs font-semibold text-destructive flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" /> {preview.errors.length} row(s) skipped</p>
                {preview.errors.map((e, i) => <p key={i} className="text-xs text-destructive/80">{e}</p>)}
              </div>
            )}

            {/* Success count */}
            {preview.cards.length > 0 ? (
              <div className="bg-success/10 border border-success/20 rounded-xl p-3 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                <p className="text-sm text-success font-medium">{preview.cards.length} card{preview.cards.length !== 1 ? 's' : ''} ready to import</p>
              </div>
            ) : (
              <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-3">
                <p className="text-sm text-destructive">No valid cards found. Please check your CSV format.</p>
              </div>
            )}

            {/* Preview table */}
            {preview.cards.length > 0 && (
              <div className="max-h-52 overflow-y-auto border border-border rounded-xl">
                <table className="w-full text-xs">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">#</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Answer</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Choices</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.cards.map((c, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                        <td className="px-3 py-2 font-medium truncate max-w-[120px]">{c.correct_answer}</td>
                        <td className="px-3 py-2 text-muted-foreground">{c.choices.length} choices</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex justify-between gap-2 pt-1">
              <Button variant="ghost" onClick={reset} className="gap-1.5"><FileText className="w-4 h-4" /> Try another file</Button>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => { reset(); onClose(); }}>Cancel</Button>
                <Button onClick={handleImport} disabled={!preview.cards.length || importing} className="gap-1.5">
                  {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  Import {preview.cards.length > 0 ? `${preview.cards.length} cards` : ''}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}