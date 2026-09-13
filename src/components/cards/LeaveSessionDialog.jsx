import React from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';

const NAVY = '#2C4A6F';
const RED = '#D9534F';
const GRAY_BORDER = '#CCCCCC';
const SUBTEXT = '#555555';
const FONT = "'VT323', monospace";

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
          <p
            className="uppercase"
            style={{ fontFamily: FONT, fontSize: 24, lineHeight: 1, color: NAVY }}
          >
            LEAVE SESSION?
          </p>
          <p
            className="uppercase"
            style={{ fontFamily: FONT, fontSize: 16, lineHeight: 1.2, color: SUBTEXT, whiteSpace: 'pre-line' }}
          >
            {`${doneCount} / ${totalCount} CARDS DONE.\nSAVE TO RESUME WITHIN 24H.`}
          </p>
          <div className="flex flex-col gap-2 w-full mt-1">
            <button
              onClick={onSave}
              className="w-full uppercase"
              style={{ fontFamily: FONT, fontSize: 16, lineHeight: 1.2, color: '#fff', backgroundColor: NAVY, border: `2px solid ${NAVY}`, padding: '6px 0' }}
            >
              SAVE &amp; EXIT
            </button>
            <button
              onClick={onDiscard}
              className="w-full uppercase"
              style={{ fontFamily: FONT, fontSize: 16, lineHeight: 1.2, color: RED, backgroundColor: 'transparent', border: `2px solid ${RED}`, padding: '6px 0' }}
            >
              DISCARD &amp; EXIT
            </button>
            <button
              onClick={() => onOpenChange(false)}
              className="w-full uppercase"
              style={{ fontFamily: FONT, fontSize: 16, lineHeight: 1.2, color: NAVY, backgroundColor: 'transparent', border: `2px solid ${GRAY_BORDER}`, padding: '6px 0' }}
            >
              KEEP GOING
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}