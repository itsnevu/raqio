# PLAN — Raqio site on the scale.com structure

Status: **Phase 1 done · Phase 2 decided 2026-11-27 · Phase 3 building in `apps/site` (:3003).**

**Decisions (user, 2026-11-27):** D1 = real Scale transition · D2 = real Raqio copy (market research + WA-Suite) · D3 = new `apps/site` on :3003 · D4 = the brief's purple TOKENS · D5 = Figtree + Geist Mono.
Evidence: `research/*.spec.md` (20 pages), `research/TOKENS.measured.md`, `research/raw/nav.json`, `research/frames/` (358 scroll frames), `research/raw/js` (Scale's GSAP configs).

---

## 0. Decisions needed before build

| # | Question | Recommendation | Why |
|---|---|---|---|
| D1 | Section transition: **real Scale** (an absolutely positioned backdrop starts inset 24px with 16px top radius and grows to full bleed; the content does not move) or **the brief's** (next section rises from 100%, previous one scales to .96 and dims to .7)? | **Real Scale** | The brief says "replicate exactly". The brief's version is not on scale.com (`ScrollRevealSection` source, `TOKENS.measured.md` §6). |
| D2 | Copy: **real Raqio** (market research + WhatsApp team inbox, as on the current site) or **the brief's live-audio creators**? | **Real Raqio** | The brief's copy would describe a product Raqio doesn't sell. |
| D3 | Where to build | **New app `apps/site`, port 3003.** Swap it into `apps/web` (port 3000) only after it's verified. | Keeps the live marketing site untouched until the new one passes Phase 4. |
| D4 | Palette | **The brief's TOKENS** (purple primary) | You supplied them. The current site uses amber `#FFB020`. To keep amber, only the `--accent-primary` and `--highlight` values change; the roles stay the same. |
| D5 | Font | **Figtree** 400/500 + **Geist Mono**, self-hosted | Measured as the closest free match to Aeonik: width error 1.5%, x-height 1.7% (`TOKENS.measured.md`). |

---

## 1. Token file (`apps/site/app/tokens.css`)

```css
:root{
  --ink:#0A0A0F; --surface:#111119; --surface-2:#181822; --line:#242430;
  --fg:#F5F5F7; --fg-muted:#9A9AA8; --light:#EFEFF2;
  --accent-primary:#6C4CF1; --accent-2:#FF6B4A; --accent-3:#22D3A6; --accent-4:#5B8DEF; --highlight:#A78BFA;
  --ink-muted: color-mix(in srgb, var(--ink) 72%, var(--light)); /* muted text on light sections; derived from neutrals, not a new hue */

  /* type: measured scale (desktop ≥768 / mobile) */
  --t-header1: 7.5rem/1;      --t-header1-m: 2.5rem/1.05;
  --t-header2: 4rem/1.05;     --t-header2-m: 2rem/1.05;   /* hero uses 28px/30px on mobile */
  --t-header3: 2.5rem/1.25;   --t-header3-m: 1.5rem/1.05;
  --t-header4: 2rem/1.5;      --t-header4-m: 1.5rem/1.05; /* ls -.03em */
  --t-header5: 1.5rem/1.5;    --t-header5-m: 1.375rem/1.05;
  --t-header6: 1.25rem/1.5;   --t-header6-m: 1.125rem/1.05;
  --t-body1: 1.25rem/1.5;     --t-body1-m: 1rem/1.45;
  --t-body2: 1rem/1.5;        --t-body2-m: .875rem/1.35;
  --t-body3: .875rem/1.5;
  --t-detail: .75rem/1.2;     --t-detail-m: .625rem/1.2;
  --t-mono: .813rem/1.2;      --t-mono-m: .625rem/1.2;    /* uppercase */
  --tracking-display: -.01em; /* measured: 64px → -0.64px, 40px → -0.4px */

  /* grid / radius / motion */
  --gutter: 1.5rem; --col-gap: .5rem; --col-max: 150px; --page-max: 2048px;
  --r-card: 1rem; --r-section: 1.5rem; --r-btn: .375rem; --r-chip: .75rem; --r-tile: .5rem;
  --ease-out-expo: cubic-bezier(.16,1,.3,1); --ease-in-out: cubic-bezier(.65,0,.35,1); --ease-tw: cubic-bezier(.4,0,.2,1);
}
```

**Grid (measured, different from the brief):** 12 columns `minmax(0,150px)`, **8px** gap, centred, 24px page padding. Mobile uses 8 columns with `1fr`. The brief's "24px gutter" is the page padding, not the column gap.

### Contrast (computed, WCAG 2.x)

| pair | ratio | rule |
|---|---|---|
| `--fg` on `--accent-primary` | 4.89 ✅ | primary button text is `--fg` |
| `--accent-primary` as text on `--ink` | 3.71 ❌ | never use the accent as text on dark; accented text on dark uses `--highlight` (7.26 ✅) |
| `--fg-muted` on `--ink` / `--surface` / `--surface-2` | 7.11 / 6.76 / 6.34 ✅ | |
| `--fg-muted` on `--light` | 2.42 ❌ | on light sections use `--ink-muted` (re-verify at build) |
| `--accent-primary` on `--light` | 4.64 ✅ | links in light sections |
| text on accent-2/3/4 hover fills | `--ink` 7.01 / 10.29 / 6.11 ✅ · `--fg` 2.59 / 1.76 / 2.97 ❌ | **hover-fill cards switch their text to `--ink`** |

---

## 2. Component inventory (`components/ui`)

| component | props | measured basis |
|---|---|---|
| `Button` | `variant: 'primary'\|'outline'\|'ghost'`, `href`, `arrow?: boolean`, `size?: 'md'\|'lg'` | FlatCta: h 40, `rounded-md`, 14px/500. The arrow box slides on hover. |
| `ArrowBox` | `tone: 'accent'\|'ink'` | the 32px box at the right of CTAs |
| `Eyebrow` | `children`, `tone` | `detail-mono` 13px uppercase |
| `Section` | `bg: 'ink'\|'surface'\|'light'`, `width: 'medium'\|'full'`, `parallaxOut?`, `children` | inner card radius 24px, width 90→100% scrubbed (power3.out) |
| `ScrollRevealSection` | `backdrop: token`, `children` | backdrop scaleX `1−48/w → 1`, top radius 16 → 0, progress .5–1 of `top bottom → top top` |
| `Grid` | `as`, `cols?: 12\|8`, `className` | `.grid-layout-desktop` / `-mobile` |
| `Card` | `icon`, `title`, `body`, `cta`, `fill: 'a2'\|'a3'\|'a4'` | CardGrid: 380px columns, header5 title, fill scaleY 0 → 1 from the bottom over 500ms ease-out |
| `Marquee` | `items`, `speed` (px/s), `pauseOnHover` | logo row (CSS `logo-marquee` keyframes) |
| `Carousel` | `items`, `cardWidth=404`, `drag` | FullWidthCardCarousel |
| `Chip` | `label`, `tone: 'a2'\|'a3'\|'a4'` | category chips, `rounded-xl` |
| `MegaMenu` | `items: {label, columns:{heading, links}[], media}` | see §5 |

**Slices (`components/slices`), homepage order:** `Hero` · `ScrollingQuote` · `Applications` · `LogoCloud` · `CardGrid` · `BlogPreview` · `VideoCta` · `Footer`.
The rebuild measured **5** footer link columns (the brief said 6), a 116px wordmark, socials, and a mono 13px small print.

---

## 3. Page templates (one per archetype, reused)

| template | Scale pages it covers | slices |
|---|---|---|
| `HomeTemplate` | `/` | full homepage list above |
| `SolutionTemplate` | enterprise, healthcare, insurance, public-sector, national-security, global-public-sector | PageHero · pinned media (SteppedVideo → CSS frames) · CardGrid · ClientTestimonials (pinned 1.5vh) · BlogPreview · CTA |
| `ProductTemplate` | data-engine, generative-ai-data-engine, physical-ai | PageHero · feature rows · SgpStack (scale .98 → 1) · CardGrid · CTA |
| `EvaluationTemplate` | evaluation/enterprise, evaluation/model-developers | PageHero · leaderboard table · CardGrid · CTA |
| `CompanyTemplate` | about, security | text hero · OneColumnRichText · stats · CTA |
| `ConversionTemplate` | demo (`/pricing` redirects to `/demo`: same canonical) | split form + logos |
| `ResourceTemplate` | blog, guides, events | index header · filter chips · bento/list grid |
| `CampaignTemplate` | customers/time | case-study hero · rich text · quote panel · related |

**Raqio routes (if D2 = real Raqio):** `/` · `/market-research` (product) · `/wa-suite` (product) · `/solutions/[industry]` · `/about` · `/security` · `/demo` · `/blog` · `/customers/[slug]`. All CTAs go to `/start` or `/demo`.

---

## 4. Motion registry (`lib/motion`) — values from Scale's source and measurements

| hook | trigger | animation | timing |
|---|---|---|---|
| `useHeroPin` | pin 450dvh (232dvh <768), `pinSpacing:false` | headline words y 30 → 0 · columns pull apart · block exit | values from `home.spec.md` §2a |
| `useScrollReveal` | `top bottom → top top` | backdrop scaleX and radius (D1) | linear map |
| `useSectionWidth` | `top bottom → bottom 75%`, scrub | inner card width 90% → 100% | power3.out 1.15 |
| `useParallaxOut` | `bottom 100% → bottom top`, scrub | yPercent 0 → 20, inner opacity 1 → 0 | power3.in / none |
| `useQuotePin` | pin `top 20%`, `+=2vh` | wrapper yPercent 25 → 0 · media 67 → 0 · exit scale .9 / op 0 / yPercent −20 · words seek 1.4·p | power3.out .75 · cubic.inOut 2.25 · power2.inOut .75 |
| `useApplicationsPin` | pin `bottom bottom`, `+=1.5vh` | inner y → −20vh, overlay op 0 → .35 | power1.out |
| `useMotionPathLoop` | always (paused off-screen) | tiles on an SVG ellipse, 28s loop, scale by position; hover sets timeScale → 0 | none · power2.out 1s |
| `useRotator` | interval (measured in spec) | word in xP −10 / yP 100 → 0, out yP −102, container width tween | expo.out .5 |
| `useWordReveal` | in-view or scrub | per-word opacity / y with stagger | per slice |
| `useClipReveal` | `top bottom → top center` | `rect(0 0 0 0 round 10%)` → full, autoAlpha | power2.out .5, delay 1, stagger .1 |
| `useMarquee`, `useDragCarousel` | — | — | — |

Global: Lenis plus ScrollTrigger (`lenis.on('scroll', ScrollTrigger.update)`), debounced `refresh()`. Pins only at ≥768px. With `prefers-reduced-motion`: no pins, no scrub, no Lenis, and every hook applies its end state (Scale's source does the same: `gsap.set(t,{width:"100%"})`).

---

## 5. Nav and mega-menu (measured)

- **Header bar:** 88px tall, white with black text over light sections, black with white text over dark ones (y 400–5000 on the homepage). It is driven by `setSectionTheme`, not scroll distance, and is **not blurred**. I'll follow the measured behaviour; the brief's "blur after 40px" doesn't match.
- **Panel:** `rgba(255,255,255,.92)` + `backdrop-blur-lg` + `0 18px 60px -20px rgba(0,0,0,.16)`, full width. It first paints about 240ms after hover, then scaleY ≈.85 → 1 from the top over about 650ms (ease-out). Closing takes about 230ms; the panel is gone by about 700ms. Inactive top-level items dim.
- **Columns:** links at grid col 2 and col 4 (x 141 / 374 at 1440), 225px wide each, 36px row pitch. The media tile is at col 7 and spans 6 columns, 705×(192–324).
- **Column headers** ("Build AI"…): sans 14/20, ls .7px, grey ≈#737373, sentence case. The brief's mono 11px uppercase doesn't match Scale. I'll **follow Scale.**
- **Link hover** on Scale: 150ms colour only. The brief's 2px left-to-right underline wipe in `--accent-primary` is an addition. I'll **add it**, since it improves on Scale without contradicting the structure.
- **Keyboard:** Scale fails here (ArrowDown doesn't enter the menu, Esc doesn't close it). I'll implement the brief's requirements in full: focus trap, Esc, arrow keys, `aria-expanded` / `aria-haspopup`.
- **Mobile:** full-screen sheet in `--light`, items rise 4px over about 300ms. I'll add the brief's 30ms stagger.

---

## 6. Build order

1. Scaffold `apps/site` (Next 15, TS, Tailwind v4, GSAP + ScrollTrigger + MotionPath, Lenis), tokens, fonts, `Grid`, `Section`, and a reduced-motion provider.
2. **Header + MegaMenu**, since it frames everything, with keyboard tests.
3. Homepage slices in order: Hero → ScrollingQuote → Applications → LogoCloud → CardGrid → BlogPreview → VideoCta → Footer.
4. Section transitions (D1) across the homepage.
5. Templates and pages, one archetype at a time.
6. Phase 4: screenshots at 1440 and 390, frame-by-frame comparison against `research/frames`, Lighthouse mobile, axe-core, reduced-motion pass.

**Stubs first:** media are CSS gradient tiles (no Scale photos or video); the hero's scroll-scrubbed video becomes layered gradient panels; logos are placeholder SVGs using `mask-image` + `currentColor`.

## 7. Risks

- **Scale's hero is a WebCodecs video scrubbed by scroll.** The brief forbids canvas and WebGL, so the CSS version will match the structure and timing, not the visual.
- **LCP < 2.2s on mobile with a 450dvh pinned hero** is achievable only if hero media stays as CSS or tiny images.
- **The Applications MotionPath loop runs forever.** It must pause off-screen, or it hurts INP and battery.
