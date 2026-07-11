// Fixed study-card heights, shared so the cards and the completion panel match
// exactly (no crossfade resize). Retune here to move both at once.
export const STUDY_CARD_H = {
  horizontal: 'clamp(400px, 56vh, 560px)', // StudyCardHorizontal outer row
  vertical: 'clamp(380px, 50vw, 520px)',   // StudyCard fixed body
};