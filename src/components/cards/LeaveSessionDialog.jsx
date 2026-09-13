import React from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';

const NAVY = '#2C4A6F';
const RED = '#D9534F';
const GRAY_BORDER = '#CCCCCC';
const SUBTEXT = '#555555';
const FONT = "'Inter', sans-serif";

const EXIT_ICON = 'https://media.base44.com/images/public/69fd6153088222f7245f34d6/06551a213_Interface-Essential-Signin-Login--Streamline-Pixel.png';

/**
 * LeaveSessionDialog — centered modal confirming a mid-session exit.
 * Save & Exit persists a resumable session; Discard & Exit drops it; Keep Going closes the modal.
 */
export default function LeaveSessionDialog({ open, onOpenChange, doneCount, totalCount, onSave, onDiscard }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs gap-0 p-8 rounded-none sm:rounded-none [&>button]:hidden">
        <div className="flex flex-col items-center gap-4 text-center">
          <img
            src={EXIT_ICON}
            alt="Leave"
            style={{ width: 32, height: 32, imageRendering: 'pixelated' }}
          />
          <h2>
            style={{ fontFamily: FONT, fontSize: 20, fontWeight: 600, color: NAVY }}
          >
            Leave Session?
          </h2>
          <p
            style={{ fontFamily: FONT, fontSize: 14, lineHeight: 1.4, color: SUBTEXT, whiteSpace: 'pre-line' }}
          >
            {`${doneCount} / ${totalCount} cards studied.\nSave to resume within 24h without losing your progress.`}
          </p>
          <div className="flex flex-col gap-2 w-full mt-1">
            <button
              onClick={onSave}
              style={{ fontFamily: FONT, fontSize: 14, fontWeight: 500, lineHeight: 1.2, color: '#fff', backgroundColor: NAVY, border: `2px solid ${NAVY}`, padding: '8px 0', borderRadius: 4 }}
            >
              Save &amp; exit
            </button>
            <button
              onClick={onDiscard}
              style={{ fontFamily: FONT, fontSize: 14, fontWeight: 500, lineHeight: 1.2, color: RED, backgroundColor: 'transparent', border: `2px solid ${RED}`, padding: '8px 0', borderRadius: 4 }}
            >
              Discard &amp; exit
            </button>
            <button
              onClick={() => onOpenChange(false)}
              style={{ fontFamily: FONT, fontSize: 14, fontWeight: 500, lineHeight: 1.2, color: NAVY, backgroundColor: 'transparent', border: `2px solid ${GRAY_BORDER}`, padding: '8px 0', borderRadius: 4 }}
            >
              Keep going
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}