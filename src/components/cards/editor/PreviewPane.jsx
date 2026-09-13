import { motion, AnimatePresence } from 'framer-motion';
import { PanelLeft, PanelTop, Upload, Search, Sparkles, Trash2 } from 'lucide-react';
import CardThumbnail from '../CardThumbnail';
import { cn } from '@/lib/utils';

const STUDY_CARD_TRUE_W = 1216;

/**
 * PreviewPane — live CardThumbnail preview shared by the Edit and Image tabs.
 * `imageEmpty` / `imageOverlay` are optional render slots (Edit tab uses them to
 * let the user start managing an image straight from the preview).
 */
export default function PreviewPane({
  state,
  previewLayout,
  setPreviewLayout,
  imageEmpty = null,
  imageOverlay = null,
  children = null,
  maxHeightClass = '',
}) {
  const card = {
    image_url: state.imageUrl,
    image_fit: state.imageFit,
    image_focal_point: state.focalPoint,
    clue: state.clue,
    question_type: state.qType,
    choices: state.isTrueFalse ? ['True', 'False'] : state.usesBank ? state.filledChoices : [],
    correct_answers: state.usesBank
      ? state.correctFilled.join('|')
      : state.isShortAnswer ? state.canonicalAnswer.trim() : Array.from(state.correctSet).join('|'),
    canonical_answer: state.isShortAnswer ? state.canonicalAnswer.trim() : '',
    accepted_variants: state.isShortAnswer ? state.acceptedVariants : [],
  };

  return (
    <div className={cn('relative flex flex-col min-h-0', maxHeightClass)}>
      <div className="flex items-center gap-3 mb-3 shrink-0">
        <p className="text-sm font-medium">Card Preview</p>
        <div className="flex rounded-md border border-border overflow-hidden">
          <button
            type="button"
            onClick={() => setPreviewLayout('horizontal')}
            title="Horizontal"
            className={cn(
              'px-2 py-1 flex items-center text-xs',
              previewLayout === 'horizontal' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent'
            )}
          >
            <PanelLeft className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setPreviewLayout('vertical')}
            title="Vertical"
            className={cn(
              'px-2 py-1 flex items-center text-xs',
              previewLayout === 'vertical' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent'
            )}
          >
            <PanelTop className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div className="mx-auto w-full space-y-3" style={{ maxWidth: previewLayout === 'horizontal' ? STUDY_CARD_TRUE_W : 480 }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={previewLayout}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.2 }}
          >
            <CardThumbnail
              card={card}
              layout={previewLayout}
              imageEmpty={imageEmpty}
              imageOverlay={imageOverlay}
            />
          </motion.div>
        </AnimatePresence>
        {children}
      </div>
    </div>
  );
}

export { STUDY_CARD_TRUE_W };