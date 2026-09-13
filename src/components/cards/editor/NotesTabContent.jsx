import CardNoteEditor from '../CardNoteEditor';

/**
 * NotesTabContent — single-pane body for the "Notes" tab.
 * Personal note editor. No live preview.
 */
export default function NotesTabContent({ state }) {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-6">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-foreground">Personal Note</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            A private hint or memorization tip for this card. Notes are never shown during study sessions.
          </p>
        </div>
        <CardNoteEditor cardId={state.card?.id} />
      </div>
    </div>
  );
}