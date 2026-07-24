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

// Region fractions. The image slot's aspect ratio falls out of these and is
// constant at every card width — which is what makes an honest preview possible.
export const CARD_COL_W = 0.48;   // left column share of card WIDTH
export const CARD_IMAGE_H = 0.75; // image share of left column HEIGHT
export const IMAGE_ASPECT = (CARD_COL_W * CARD_ASPECT) / CARD_IMAGE_H; // 1.536

// Structural dimensions as a percentage of card width (cqi). Shared by
// StudyCardHorizontal and CardPreviewPane so the two cannot drift apart.
// Reference values in comments are px at a 1216px-wide card.
export const CARD_GEO = {
  colGap:        '1.32cqi', // 16px — between the two columns
  qPadImage:     '1.32cqi 1.32cqi 2.96cqi 1.32cqi', // 16/16/36/16
  qPadNoImage:   '1.65cqi 1.65cqi 3.29cqi 1.65cqi', // 20/20/40/20
  qFontImage:    'clamp(11px, 1.65cqi, 22px)',
  qFontNoImage:  'clamp(15px, 2.2cqi, 30px)', // ~27px at 1216 — a 1.33x step up from qFontImage
  choiceMaxH:    'clamp(30px, 4.28cqi, 56px)', // 52px
  choiceGap:     '0.41cqi', // 5px
  choicePad:     '0.74cqi 1.15cqi', // 9px 14px
  choiceFont:    'clamp(12px, 1.65cqi, 21px)',
  tfMaxH:        'clamp(32px, 4.61cqi, 60px)', // 56px
  ansTopGap:     '1.48cqi', // 18px
  ansSecondaryH: '2.96cqi', // 36px
  ansActionH:    '3.62cqi', // 44px
  ansRowGap:     '0.82cqi', // 10px
};

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