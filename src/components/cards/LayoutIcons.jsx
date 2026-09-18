// Layout preview glyphs. Drawn with `fill-current` / `stroke-current` so they inherit the
// button's text color and tint with the selected state in both themes. Inline SVG rather
// than hosted assets: no upload step, no CDN dependency, sharp at any DPR.

export default function LayoutGlyph({ variant, className }) {
  return (
    <svg viewBox="0 0 48 34" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="1" y="1" width="46" height="32" rx="2.5" className="stroke-current fill-none opacity-30" strokeWidth="1.2" />

      {variant === 'landscape-l' &&
        <g>
          <rect x="5" y="7" width="16" height="20" rx="1.5" className="fill-current opacity-20" />
          <circle cx="10" cy="13" r="1.6" className="fill-current opacity-50" />
          <path d="M7 23 L12 16 L18 23 Z" className="fill-current opacity-50" />
          <rect x="25" y="9" width="18" height="1.8" rx="0.9" className="fill-current opacity-40" />
          <rect x="25" y="13.5" width="18" height="1.8" rx="0.9" className="fill-current opacity-40" />
          <rect x="25" y="18" width="18" height="1.8" rx="0.9" className="fill-current opacity-40" />
          <rect x="25" y="22.5" width="11" height="1.8" rx="0.9" className="fill-current opacity-40" />
        </g>
      }

      {variant === 'portrait' &&
        <g>
          <rect x="5" y="5" width="38" height="13" rx="1.5" className="fill-current opacity-20" />
          <circle cx="12" cy="9.5" r="1.6" className="fill-current opacity-50" />
          <path d="M8 15.5 L13 10 L19 15.5 Z" className="fill-current opacity-50" />
          <rect x="5" y="21" width="38" height="1.8" rx="0.9" className="fill-current opacity-40" />
          <rect x="5" y="25" width="38" height="1.8" rx="0.9" className="fill-current opacity-40" />
          <rect x="5" y="29" width="24" height="1.8" rx="0.9" className="fill-current opacity-40" />
        </g>
      }

      {variant === 'landscape-r' &&
        <g>
          <rect x="27" y="7" width="16" height="20" rx="1.5" className="fill-current opacity-20" />
          <circle cx="32" cy="13" r="1.6" className="fill-current opacity-50" />
          <path d="M29 23 L34 16 L40 23 Z" className="fill-current opacity-50" />
          <rect x="5" y="9" width="18" height="1.8" rx="0.9" className="fill-current opacity-40" />
          <rect x="5" y="13.5" width="18" height="1.8" rx="0.9" className="fill-current opacity-40" />
          <rect x="5" y="18" width="18" height="1.8" rx="0.9" className="fill-current opacity-40" />
          <rect x="5" y="22.5" width="11" height="1.8" rx="0.9" className="fill-current opacity-40" />
        </g>
      }
    </svg>
  );
}