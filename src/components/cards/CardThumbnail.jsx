import { Check, SquareCheck, ToggleLeft, PencilLine } from 'lucide-react';
import MathRenderer from '@/components/ui/MathRenderer';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

export default function CardThumbnail({ card }) {
  if (!card) return null;

  const correctAnswers = (card.correct_answers || card.correct_answer || '')
    .split('|').map(s => s.trim()).filter(Boolean);

  const isTrueFalse = card.question_type === 'true_false';
  const isSelectAll = card.question_type === 'select_all';
  const isShortAnswer = card.question_type === 'short_answer';
  const qtLabel = isTrueFalse ? 'True or False?' : isSelectAll ? 'Multi-Select' : isShortAnswer ? 'Short Answer' : 'Single Select';

  const choices = card.choices || [];

  return (
    <div className="flex flex-col gap-2 w-full">

      {/* Image */}
      {card.image_url && (
        <div className="w-full overflow-hidden rounded" style={{ aspectRatio: '4/3' }}>
          <img
            src={card.image_url}
            alt="card"
            className="w-full h-full"
            style={{
              objectFit: card.image_fit || 'cover',
              objectPosition: (card.image_fit !== 'contain' && card.image_focal_point)
                ? `${card.image_focal_point.x}% ${card.image_focal_point.y}%`
                : 'center'
            }}
          />
        </div>
      )}

      {/* Clue / Question */}
      {card.clue && (
        <div
          className="w-full rounded px-3 py-2"
          style={{ backgroundColor: '#DFEDF5' }}
        >
          <MathRenderer text={card.clue} style={{ color: '#113656', fontSize: 14, fontWeight: 500, lineHeight: 1.4 }} />
        </div>
      )}

      {/* Answer section */}
      <div
        className="w-full rounded px-3 py-2"
        style={{ backgroundColor: '#FAFAFA', border: '1.5px solid #D9D9D9' }}
      >
        {/* Question type label */}
        <div className="flex items-center gap-1.5 mb-2" style={{ color: '#00A842', fontSize: 12, fontWeight: 500 }}>
          {isTrueFalse
            ? <ToggleLeft style={{ width: 14, height: 14 }} />
            : isShortAnswer
              ? <PencilLine style={{ width: 14, height: 14 }} />
              : <SquareCheck style={{ width: 14, height: 14 }} />
          }
          <span>{qtLabel}</span>
        </div>

        {/* Short answer preview */}
        {isShortAnswer ? (
          <div className="space-y-1.5">
            <div style={{ border: '2px solid #000', borderRadius: 8, padding: '8px 12px', backgroundColor: '#fff', fontSize: 13, color: '#9ca3af' }}>
              Type your answer…
            </div>
            {card.canonical_answer && (
              <div style={{ padding: '6px 10px', borderRadius: 7, backgroundColor: '#f0fdf4', border: '1.5px solid #00A842', fontSize: 12 }}>
                <span style={{ color: '#15803d', fontWeight: 600 }}>✓ </span>
                <span style={{ color: '#166534' }}>{card.canonical_answer}</span>
                {card.accepted_variants?.length > 0 && (
                  <span style={{ color: '#6b7280', marginLeft: 6 }}>
                    (also: {card.accepted_variants.join(', ')})
                  </span>
                )}
              </div>
            )}
          </div>
        ) : (
          /* Choices */
          <div className="flex flex-col gap-1.5">
            {choices.map((choice, idx) => {
              const isCorrect = correctAnswers.includes(choice);
              return (
                <div
                  key={idx}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    borderRadius: 8,
                    border: `1.5px solid ${isCorrect ? '#00A842' : '#000'}`,
                    backgroundColor: isCorrect ? '#f0fdf4' : '#fff',
                    padding: '5px 10px',
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                >
                  <span style={{
                    width: 22, height: 22, borderRadius: 4, flexShrink: 0,
                    backgroundColor: isCorrect ? '#00A842' : '#000',
                    color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700,
                  }}>
                    {isCorrect ? <Check style={{ width: 12, height: 12 }} /> : LETTERS[idx]}
                  </span>
                  <MathRenderer text={choice} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}