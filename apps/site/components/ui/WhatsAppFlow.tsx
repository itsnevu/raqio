/**
 * Animated WhatsApp illustration for the Customer Service Agent: one number (WhatsApp mark, pulsing) fans out over
 * flowing wires to three team chats: typing, read (double blue tick), new message. CSS-only animation; static under
 * prefers-reduced-motion. WhatsApp mark: Simple Icons (CC0 SVG), trademark of its owner.
 */
const WA = "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z";
const CHATS = [16, 40, 64];

export function WhatsAppFlow({ label, className = "" }: { label?: string; className?: string }) {
  return (
    <figure className={`flex flex-col gap-3 ${className}`}>
      {label && <figcaption className="detail-mono opacity-60">{label}</figcaption>}
      <svg viewBox="0 0 280 80" className="h-auto w-[280px] overflow-visible" role="img" aria-label={label ?? "WhatsApp team inbox"}>
        {/* wires: one number → three chats */}
        {CHATS.map((y, i) => (
          <path key={y} className="wa-wire" style={{ animationDelay: `${i * -0.6}s` }} d={`M64 40 C 96 40, 108 ${y}, 138 ${y}`} fill="none" stroke="currentColor" strokeOpacity=".45" strokeWidth="1.4" strokeDasharray="3 5" />
        ))}
        {/* WhatsApp mark with a slow pulse ring */}
        <circle className="wa-pulse" cx="36" cy="40" r="27" fill="none" stroke="#25D366" strokeWidth="2" />
        <circle cx="36" cy="40" r="27" fill="#25D366" />
        <g transform="translate(19.2 23.2) scale(1.4)" fill="#fff"><path d={WA} /></g>
        {/* chat 1: typing */}
        <g transform="translate(140 6)">
          <rect width="120" height="20" rx="10" fill="currentColor" fillOpacity=".08" stroke="currentColor" strokeOpacity=".25" />
          {[0, 1, 2].map((k) => <circle key={k} className="wa-dot" style={{ animationDelay: `${k * 0.18}s` }} cx={16 + k * 9} cy="10" r="2.6" fill="currentColor" />)}
        </g>
        {/* chat 2: read, double blue tick */}
        <g transform="translate(140 30)">
          <rect width="120" height="20" rx="10" fill="currentColor" fillOpacity=".08" stroke="currentColor" strokeOpacity=".25" />
          <rect x="12" y="8" width="62" height="4" rx="2" fill="currentColor" fillOpacity=".45" />
          <path d="M88 10.5l3 3 6-6.5M93 13.5l1 .8 6-6.8" fill="none" stroke="#53BDEB" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </g>
        {/* chat 3: new message */}
        <g transform="translate(140 54)">
          <rect width="120" height="20" rx="10" fill="currentColor" fillOpacity=".08" stroke="currentColor" strokeOpacity=".25" />
          <rect x="12" y="8" width="46" height="4" rx="2" fill="currentColor" fillOpacity=".45" />
          <circle className="wa-new" cx="106" cy="10" r="4" fill="#25D366" />
        </g>
      </svg>
      <style>{`
        .wa-wire{animation:wa-flow 1.8s linear infinite}@keyframes wa-flow{to{stroke-dashoffset:-16}}
        .wa-pulse{transform-origin:36px 40px;animation:wa-pulse 2.6s ease-out infinite}@keyframes wa-pulse{0%{transform:scale(1);opacity:.8}100%{transform:scale(1.5);opacity:0}}
        .wa-dot{animation:wa-type 1.2s ease-in-out infinite}@keyframes wa-type{0%,60%,100%{opacity:.3;transform:translateY(0)}30%{opacity:1;transform:translateY(-2px)}}
        .wa-new{animation:wa-blink 1.6s ease-in-out infinite}@keyframes wa-blink{50%{opacity:.35}}
        @media (prefers-reduced-motion: reduce){.wa-wire,.wa-pulse,.wa-dot,.wa-new{animation:none}}
      `}</style>
    </figure>
  );
}
