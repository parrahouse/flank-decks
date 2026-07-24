/**
 * CardPreviewPane — non-interactive miniature of StudyCardHorizontal.
 *
 * Its job is to show an author how an image will actually be cropped in study.
 * The image region uses the same proportions as the real card (IMAGE_ASPECT,
 * 1.536:1) at every width, so what is visible here is what will be visible
 * in study.
 *
 * The question renders live — its length and truncation are part of what the
 * author is judging. Everything else is a neutral placeholder shape.
 *
 * Pure prop consumer: no state, no effects, no listeners.
 */
import { CARD_ASPECT, CARD_GEO as GEO } from '@/lib/studyLayout';

// Deliberately flat and low-contrast: placeholders should read as "not the
// point" and never compete with the image for attention.
const SHAPE = '#E7E9EC';
const SHAPE_DARK = '#D3D7DC';

// Note: no viewport-height cap here, unlike STUDY_CARD_BOX_H. The pane is
// sized by whatever container it is placed in.
const BOX = {
  width: '100%',
  aspectRatio: `${CARD_ASPECT}`,
  containerType: 'inline-size',
};

export default function CardPreviewPane({
  imageUrl = '',
  imageFit = 'cover',
  focalPoint = null,      // { x, y } percentages, or null for centered
  question = '',
  choiceCount = 4,
  answerStyle = 'bars',   // 'bars' | 'field' — 'field' is the short-answer input
  showImage = true,       // false collapses to the text-only layout
  imageEmpty = null,      // node rendered in the image region when imageUrl is empty
  counter = '1/1',
  variant = 'horizontal', // reserved; vertical needs its own geometry pass
}) {
  const objectPosition =
    imageFit !== 'contain' && focalPoint
      ? `${focalPoint.x}% ${focalPoint.y}%`
      : 'center';

  return (
    <div style={BOX}>
      <div style={{ display: 'flex', gap: GEO.colGap, width: '100%', height: '100%', alignItems: 'stretch' }}>

        {/* ── Left column — image + question ──────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: '0 0 48%', minWidth: 0, gap: 0 }}>

          {showImage && (
            <div style={{ width: '100%', flex: '0 0 75%', minHeight: 0, overflow: 'hidden', backgroundColor: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt=""
                  draggable={false}
                  style={{ width: '100%', height: '100%', objectFit: imageFit, objectPosition }}
                />
              ) : imageEmpty}
            </div>
          )}

          <div style={{
            width: '100%',
            flex: showImage ? '0 0 25%' : '1 1 0',
            minHeight: 0,
            backgroundColor: '#DFEDF5',
            borderTop: showImage ? '1px solid rgba(17,54,86,0.08)' : 'none',
            position: 'relative',
            boxSizing: 'border-box',
            overflow: 'hidden',
          }}>
            {/* Padding on an inner wrapper so it cannot inflate the flex item */}
            <div style={{
              width: '100%', height: '100%', boxSizing: 'border-box',
              display: 'flex',
              alignItems: showImage ? 'flex-start' : 'center',
              padding: showImage ? GEO.qPadImage : GEO.qPadNoImage,
            }}>
              <p style={{ color: '#113656', fontSize: showImage ? GEO.qFontImage : GEO.qFontNoImage, fontWeight: 500, lineHeight: 1.35, margin: 0 }}>
                {question}
              </p>
            </div>
            <span style={{ position: 'absolute', bottom: 8, left: 16, color: '#113656', fontSize: 13, fontWeight: 700 }}>
              {counter}
            </span>
          </div>
        </div>

        {/* ── Right column — placeholders only ────────────────────────── */}
        <div aria-hidden style={{ display: 'flex', flexDirection: 'column', flex: '1 1 0', minWidth: 0, minHeight: 0, padding: '10px 14px', boxSizing: 'border-box' }}>

          {/* Type label row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: GEO.ansTopGap, flexShrink: 0 }}>
            <div style={{ width: '34%', height: '2.2cqi', borderRadius: 999, backgroundColor: SHAPE }} />
            <div style={{ width: '18%', height: '1.6cqi', borderRadius: 999, backgroundColor: SHAPE }} />
          </div>

          {/* Answer region — choice bars, or a single field for short answer */}
          {answerStyle === 'field' ? (
            <div style={{ flex: 1, minHeight: 0, padding: '0 8px' }}>
              <div style={{ width: '100%', height: '42%', borderRadius: 8, backgroundColor: SHAPE }} />
            </div>
          ) : (
            <div style={{ flex: 1, minHeight: 0, padding: '0 8px', display: 'flex', flexDirection: 'column', gap: GEO.choiceGap }}>
              {Array.from({ length: choiceCount }).map((_, i) => (
                <div key={i} style={{ width: '100%', flex: '1 1 0', minHeight: 0, maxHeight: GEO.choiceMaxH, borderRadius: 8, backgroundColor: SHAPE, display: 'flex', alignItems: 'center', gap: 8, padding: GEO.choicePad, boxSizing: 'border-box' }}>
                  <div style={{ width: '2.1cqi', height: '2.1cqi', borderRadius: 5, flexShrink: 0, backgroundColor: SHAPE_DARK }} />
                </div>
              ))}
            </div>
          )}

          {/* Secondary action row — reserved, empty */}
          <div style={{ marginTop: GEO.ansRowGap, height: GEO.ansSecondaryH, flexShrink: 0 }} />

          {/* Bottom action row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: GEO.ansRowGap, paddingTop: GEO.ansRowGap, borderTop: '1px solid #E5E5E5', height: GEO.ansActionH, flexShrink: 0, boxSizing: 'border-box' }}>
            <div style={{ width: '42%', height: '2.4cqi', borderRadius: 999, backgroundColor: SHAPE }} />
            <div style={{ width: '14%', height: '2.4cqi', borderRadius: 999, backgroundColor: SHAPE }} />
          </div>
        </div>
      </div>
    </div>
  );
}