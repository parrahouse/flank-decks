import { Check, SquareCheck, ToggleLeft } from 'lucide-react';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

export default function CardThumbnail({ card }) {
  if (!card) return null;

  const correctAnswers = (card.correct_answers || card.correct_answer || '')
    .split('|').map(s => s.trim()).filter(Boolean);

  const isTrueFalse = card.question_type === 'true_false';
  const isSelectAll = card.question_type === 'select_all';
  const qtLabel = isTrueFalse ? 'True or False?' : isSelectAll ? 'Multi-Select' : 'Single Select';

  const choices = card.choices || [];

  return (
    <div className="flex flex-col gap-2 w-full">

      {/* Image */}
      {card.image_url && (
        <div className="w-full overflow-hidden rounded" style={{ aspectRatio: '4/3' }}>
          <img
            src={card.image_url}
            alt="card"
            className="w-full h-full object-cover"
            style={{
              objectPosition: card.image_focal_point
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
          <p style={{ color: '#113656', fontSize: 14, fontWeight: 500, lineHeight: 1.4, margin: 0 }}>
            {card.clue}
          </p>
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
            : isSelectAll
              ? <SquareCheck style={{ width: 14, height: 14 }} />
              : <SquareCheck style={{ width: 14, height: 14 }} />
          }
          <span>{qtLabel}</span>
        </div>

        {/* Choices */}
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
                <span>{choice}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}