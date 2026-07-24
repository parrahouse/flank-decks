// Fixed study-card geometry, shared so the cards and the completion panel match
// exactly (no crossfade resize). Retune here to move everything at once.

// The horizontal card is one fixed-aspect box. Every region inside it is a
// percentage of that box, so the card scales proportionally with width and
// never re-flows between cards.
export const CARD_ASPECT = 2.4; // width : height

// Vertical space consumed above + below the card (page padding, header, game
// band, footer). Used to cap card WIDTH on short viewports so the card shrinks
// proportionally instead of squashing. If the card is ever clipped at the
// bottom on a short window, raise this; if there is dead space below, lower it.
export const STUDY_CHROME_PX = 260;

// Below this card width the type hits its px floors and the proportions break.
// Study pages use it to fall back to the vertical card. Keep in sync with the
// isWide check in StudySession.jsx / CollectionStudy.jsx.
export const CARD_MIN_W = 900;
export const STUDY_MIN_VH = Math.round(CARD_MIN_W / CARD_ASPECT + STUDY_CHROME_PX); // 635

// Drop-in style for the horizontal card box and for anything that must match
// its height exactly (SessionStatsPanel). `containerType` makes `cqi` units
// inside resolve against card width.
export const STUDY_CARD_BOX_H = {
  width: '100%',
  maxWidth: `calc((100vh - ${STUDY_CHROME_PX}px) * ${CARD_ASPECT})`,
  aspectRatio: `${CARD_ASPECT}`,
  marginLeft: 'auto',
  marginRight: 'auto',
  containerType: 'inline-size',
};

export const STUDY_CARD_H = {
  vertical: 'clamp(380px, 50vw, 520px)', // StudyCard fixed body — unchanged
};