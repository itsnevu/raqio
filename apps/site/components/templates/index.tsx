"use client";
import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";
import { useLang } from "@/content/i18n";
import type { L, ProductPage, Solution, Article, Block, Item } from "@/content/pages";
import { products, solutions, articles, indexes, common, about, security, compare, demo, APP_URL, CONTACT_EMAIL } from "@/content/pages";
import { Button, ArrowBox } from "@/components/ui/Button";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Glyph } from "@/components/ui/Glyph";
import { SourceLogos } from "@/components/ui/SourceLogos";
import { VideoCta } from "@/components/slices/VideoCta";
import { useScaleIn, useWordReveal } from "@/lib/motion/hooks";

/** resolve an {en,id} leaf for the active language */
function useL() { const { lang } = useLang(); return (v: L) => v[lang]; }

// ── building blocks (scale.com product-page rhythm: light hero → media → features → dark steps → audience → CTA) ──

export function PageHero({ eyebrow, title, body, image, imageAlt, ctas = true }: { eyebrow?: string; title: string; body?: string; image?: string; imageAlt?: string; ctas?: boolean }) {
  const l = useL(); const { lang } = useLang(); const root = useRef<HTMLElement>(null); const head = useRef<HTMLHeadingElement>(null);
  useWordReveal(root, head, { y: 24, stagger: 0.03, duration: 0.6, start: "top 90%" });
  useScaleIn(root, "[data-hero-media]", 0.94, 0);
  return (
    <section ref={root} data-theme="light" className="bg-fg pb-10 pt-32 md:pt-44">
      <div className="grid-layout">
        <div className="col-span-8 flex flex-col gap-6 md:col-span-8 md:col-start-2">
          {eyebrow && <Eyebrow className="text-ink-muted">{eyebrow}</Eyebrow>}
          <h1 ref={head} className="header2 max-w-[20ch] text-balance">{title}</h1>
          {body && <p className="body1 max-w-[52ch] text-ink-muted">{body}</p>}
          {ctas && <div className="flex flex-wrap gap-2 pt-2"><Button href="/demo">{l(common.requestDemo)}</Button><Button href={`${APP_URL}?lang=${lang}`} variant="outline" arrow={false}>{l(common.tryIt)}</Button></div>}
        </div>
      </div>
      {image && (
        <div className="mt-14 px-[18px] md:mt-20">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <span data-hero-media className="block aspect-[16/8] w-full overflow-hidden rounded-card"><img data-parallax="8" src={image} alt={imageAlt ?? ""} className="size-full scale-[1.18] object-cover" /></span>
        </div>
      )}
    </section>
  );
}

export function FeatureGrid({ title, items, cols = 4 }: { title: string; items: Item[]; cols?: 2 | 3 | 4 }) {
  const l = useL(); const root = useRef<HTMLElement>(null);
  useScaleIn(root, "[data-card]", 0.96, 0.05);
  const grid = { 2: "md:grid-cols-2", 3: "md:grid-cols-3", 4: "md:grid-cols-2 xl:grid-cols-4" }[cols];
  return (
    <section ref={root} data-theme="light" className="bg-fg py-16 md:py-24">
      <div className="grid-layout">
        <h2 className="header3 col-span-8 mb-10 md:col-span-6 md:col-start-2">{title}</h2>
        <ul className={`col-span-8 grid gap-2 md:col-span-10 md:col-start-2 ${grid}`}>
          {items.map((it) => (
            <li key={l(it.title)} data-card className="flex min-h-[240px] flex-col gap-5 rounded-card bg-card p-6 text-ink md:p-8">
              {it.icon && <Glyph name={it.icon} className="size-16 text-ink" />}
              <h3 className="header5">{l(it.title)}</h3>
              <p className="body2 mt-auto text-ink-muted">{l(it.body)}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function StepsBand({ title, steps }: { title: string; steps: string[] }) {
  const root = useRef<HTMLElement>(null);
  useScaleIn(root, "[data-step]", 0.96, 0.08);
  return (
    <section ref={root} data-theme="dark" className="bg-ink py-20 text-fg md:py-32">
      <div className="grid-layout">
        <h2 className="header3 col-span-8 mb-12 md:col-span-6 md:col-start-2">{title}</h2>
        <ol className="col-span-8 grid gap-2 md:col-span-10 md:col-start-2 md:grid-cols-4">
          {steps.map((s, i) => (
            <li key={s} data-step className="flex min-h-[200px] flex-col justify-between rounded-card border border-line bg-surface p-6">
              <span className="detail-mono text-fg-muted">{String(i + 1).padStart(2, "0")}</span>
              <span className="header5">{s}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function RowList({ title, items, dark = false }: { title: string; items: Item[]; dark?: boolean }) {
  const l = useL();
  return (
    <section data-theme={dark ? "dark" : "light"} className={`${dark ? "bg-ink text-fg" : "bg-fg"} py-16 md:py-24`}>
      <div className="grid-layout">
        <h2 className="header3 col-span-8 mb-8 md:col-span-4 md:col-start-2">{title}</h2>
        <dl className="col-span-8 md:col-span-6 md:col-start-6">
          {items.map((it) => (
            <div key={l(it.title)} className={`grid gap-2 border-t py-6 md:grid-cols-[1fr_1.4fr] md:gap-8 ${dark ? "border-line" : "border-ink/10"}`}>
              <dt className="header5">{l(it.title)}</dt>
              <dd className={`body2 ${dark ? "text-fg-muted" : "text-ink-muted"}`}>{l(it.body)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <div className="grid-layout bg-fg pb-16"><p className="detail-mono col-span-8 text-ink-muted md:col-span-8 md:col-start-2">{children}</p></div>;
}

// ── page templates ──

export function ProductTemplate({ id }: { id: keyof typeof products }) {
  const l = useL(); const p: ProductPage = products[id];
  return (
    <>
      <PageHero eyebrow={l(p.eyebrow)} title={l(p.title)} body={l(p.body)} image={p.image} imageAlt={l(p.imageAlt)} />
      <FeatureGrid title={l(common.features)} items={p.features} />
      <StepsBand title={l(common.steps)} steps={p.steps.map(l)} />
      {p.extra && p.extraTitle && <RowList title={l(p.extraTitle)} items={p.extra} />}
      <RowList title={l(common.audience)} items={p.audience} dark />
      <section data-theme="light" className="bg-fg pt-16"><div className="grid-layout"><div className="col-span-8 md:col-span-10 md:col-start-2"><Link href={p.other.href} className="group/cta inline-flex items-center gap-3 header5">{l(p.other.label)}<ArrowBox tone="current" /></Link></div></div></section>
      <Note>{l(p.note)}</Note>
      <VideoCta />
    </>
  );
}

export function SolutionTemplate({ slug }: { slug: string }) {
  const l = useL(); const s: Solution = solutions[slug];
  const items: Item[] = [
    { icon: "research", title: common.research, body: s.research },
    { icon: "reach", title: common.reach, body: s.reach },
    { icon: "close", title: common.close, body: s.close },
  ];
  return (
    <>
      <PageHero eyebrow={l(common.howRaqio).replace(".", "")} title={l(s.title)} body={l(s.body)} image={s.image} />
      <FeatureGrid title={l(common.howRaqio)} items={items} cols={3} />
      <StepsBand title={l(common.steps)} steps={s.steps.map(l)} />
      <VideoCta />
    </>
  );
}

function BlockView({ b }: { b: Block }) {
  const l = useL();
  return (
    <div className="flex flex-col gap-4">
      {b.h && <h2 className="header4 mt-6">{l(b.h)}</h2>}
      {b.p && <p className="body1 text-ink/85">{l(b.p)}</p>}
      {b.list && <ul className="flex list-disc flex-col gap-2 pl-6 body1 text-ink/85 marker:text-ink-muted">{b.list.map((x) => <li key={l(x)}>{l(x)}</li>)}</ul>}
      {b.code && <pre className="overflow-x-auto rounded-card bg-ink p-6 font-mono text-sm leading-relaxed text-fg">{b.code}</pre>}
      {b.table && (
        <div className="overflow-x-auto rounded-card border border-ink/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-light"><tr>{b.table.head.map((h) => <th key={l(h)} className="detail-mono px-4 py-3 text-ink-muted">{l(h)}</th>)}</tr></thead>
            <tbody>{b.table.rows.map((r, i) => <tr key={i} className="border-t border-ink/10">{r.map((c, j) => <td key={j} className={`px-4 py-3 ${j > 0 ? "tabular-nums" : ""}`}>{l(c)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )}
      {b.note && <p className="rounded-card bg-card p-5 body2 text-ink">{l(b.note)}</p>}
    </div>
  );
}

export function ArticleTemplate({ slug }: { slug: string }) {
  const l = useL(); const a: Article = articles[slug];
  const indexHref = `/${slug.split("/")[0]}`;
  return (
    <>
      <PageHero eyebrow={l(common.kinds[a.kind])} title={l(a.title)} body={l(a.lead)} image={a.image} ctas={false} />
      <article data-theme="light" className="bg-fg pb-20">
        <div className="grid-layout">
          <div className="col-span-8 flex flex-col gap-6 md:col-span-6 md:col-start-4">
            {slug === "research/sources" && <SourceLogos className="text-ink" />}
            {a.blocks.map((b, i) => <BlockView key={i} b={b} />)}
            <Link href={indexHref} className="group/cta mt-8 inline-flex items-center gap-3 text-sm font-medium"><span className="rotate-180"><ArrowBox tone="current" /></span>{l(common.back)}</Link>
          </div>
        </div>
      </article>
      <VideoCta />
    </>
  );
}

export function IndexTemplate({ which }: { which: keyof typeof indexes }) {
  const l = useL(); const ix = indexes[which]; const root = useRef<HTMLElement>(null);
  useScaleIn(root, "[data-tile]", 0.97, 0.04);
  return (
    <>
      <PageHero title={l(ix.title)} body={l(ix.lead)} ctas={false} />
      <section ref={root} data-theme="light" className="bg-fg pb-24">
        <div className="grid-layout">
          <ul className="col-span-8 grid gap-2 md:col-span-10 md:col-start-2 md:grid-cols-3">
            {ix.keys.map((k) => { const a = articles[k]; return (
              <li key={k} data-tile>
                <Link href={`/${k}`} className="group/tile flex h-full flex-col overflow-hidden rounded-card bg-light">
                  {a.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <span className="block aspect-[16/10] overflow-hidden"><img src={a.image} alt="" loading="lazy" className="size-full object-cover transition-transform duration-700 ease-expo group-hover/tile:scale-105" /></span>
                  ) : <span className="block aspect-[16/10] bg-card" />}
                  <span className="flex flex-1 flex-col gap-3 p-6">
                    <span className="detail-mono text-ink-muted">{l(common.kinds[a.kind])}</span>
                    <span className="header5">{l(a.title)}</span>
                    <span className="body2 text-ink-muted">{l(a.lead)}</span>
                  </span>
                </Link>
              </li>
            ); })}
          </ul>
        </div>
      </section>
    </>
  );
}

export function AboutTemplate() {
  const l = useL();
  return (
    <>
      <PageHero title={l(about.title)} body={l(about.body)} image="/media/raqio-jakarta-skyline.webp" ctas={false} />
      <FeatureGrid title={l(common.principles)} items={about.principles} cols={3} />
      <VideoCta />
    </>
  );
}

export function SecurityTemplate() {
  const l = useL();
  return (<><PageHero title={l(security.title)} body={l(security.lead)} ctas={false} /><FeatureGrid title={l(security.title)} items={security.items} cols={3} /><VideoCta /></>);
}

export function CompareTemplate() {
  const l = useL();
  return (
    <>
      <PageHero title={l(compare.title)} body={l(compare.lead)} ctas={false} />
      <section data-theme="light" className="bg-fg pb-16">
        <div className="grid-layout">
          <div className="col-span-8 overflow-x-auto rounded-card border border-ink/10 md:col-span-10 md:col-start-2">
            <table className="w-full min-w-[900px] text-left">
              <thead className="bg-light"><tr><th className="p-5" />{compare.agents.map((a) => <th key={a} className="header5 p-5">{a}</th>)}</tr></thead>
              <tbody>{compare.rows.map((r) => <tr key={l(r[0])} className="border-t border-ink/10 align-top"><th className="detail-mono p-5 text-ink-muted">{l(r[0])}</th>{r.slice(1).map((c, k) => <td key={k} className="body2 p-5">{l(c)}</td>)}</tr>)}</tbody>
            </table>
          </div>
        </div>
      </section>
      <section data-theme="dark" className="bg-ink py-20 text-fg md:py-28">
        <div className="grid-layout">
          <div className="col-span-8 mb-10 flex flex-col gap-3 md:col-span-6 md:col-start-2"><h2 className="header3">{l(common.plans)}</h2><p className="body1 text-fg-muted">{l(common.plansLead)}</p></div>
          <ul className="col-span-8 grid gap-2 md:col-span-10 md:col-start-2 md:grid-cols-3">
            {compare.plans.map((p) => (
              <li key={l(p.name)} className="flex flex-col gap-5 rounded-card border border-line bg-surface p-8">
                <h3 className="header4">{l(p.name)}</h3><p className="body2 text-fg-muted">{l(p.body)}</p>
                <ul className="flex flex-col gap-2 border-t border-line pt-5 text-sm">{p.items.map((i) => <li key={l(i)}>✓ {l(i)}</li>)}</ul>
              </li>
            ))}
          </ul>
          <p className="body2 col-span-8 mt-8 text-fg-muted md:col-span-8 md:col-start-2">{l(compare.pricing)}</p>
        </div>
      </section>
      <VideoCta />
    </>
  );
}

export function DemoTemplate({ variant = "start" }: { variant?: "start" | "book" }) {
  const l = useL(); const f = demo.fields; const o = demo.options; const head = demo[variant]; const [error, setError] = useState("");
  const agentNames = ["Research Agent", "SEO Agent", "Marketing Agent", "Customer Service Agent"];
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const d = new FormData(e.currentTarget);
    if (!CONTACT_EMAIL) { setError(l(f.missing)); return; }
    const body = [
      `${l(f.first)}: ${d.get("first")} ${d.get("last")}`, `${l(f.company)}: ${d.get("company")}`, `${l(f.job)}: ${d.get("job")}`, `${l(f.contact)}: ${d.get("contact")}`,
      `${l(f.country)}: ${d.get("country")}`, `${l(f.type)}: ${d.get("type")}`, `${l(f.hear)}: ${d.get("hear")}`, `${l(f.agents)}: ${d.getAll("agents").join(", ") || "-"}`,
    ].join("\n");
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(l(f.subject))}&body=${encodeURIComponent(body)}`;
  };
  // scale.com /demo field geometry: 46px inputs, 1px border, 6px radius, 16px gaps
  const input = "h-[46px] w-full rounded-md border border-ink/20 bg-fg px-4 text-[15px] text-ink outline-none transition-colors placeholder:text-ink-muted focus:border-accent";
  const select = input + " appearance-none pr-10";
  return (
    <>
      <section data-theme="light" className="bg-fg pb-20 pt-28 md:pt-32">
        <div className="grid-layout gap-y-12">
          <div className="col-span-8 md:col-span-5 md:col-start-2">
            <h1 className="header3 mb-3">{l(head.title)}</h1>
            <p className="body2 mb-10 text-ink-muted">{l(head.lead)}</p>
            <form onSubmit={submit} className="grid grid-cols-2 gap-4">
              <input name="first" required placeholder={l(f.first) + "*"} aria-label={l(f.first)} className={input} />
              <input name="last" required placeholder={l(f.last) + "*"} aria-label={l(f.last)} className={input} />
              <input name="company" required placeholder={l(f.company) + "*"} aria-label={l(f.company)} className={input} />
              <input name="job" placeholder={l(f.job)} aria-label={l(f.job)} className={input} />
              <input name="contact" required placeholder={l(f.contact) + "*"} aria-label={l(f.contact)} className={`${input} col-span-2`} />
              {(["country", "type", "hear"] as const).map((k) => (
                <div key={k} className="relative col-span-2">
                  <select name={k} required defaultValue="" aria-label={l(f[k])} className={`${select} invalid:text-ink-muted`}>
                    <option value="" disabled>{l(f[k])}*</option>
                    {o[k].map((v) => <option key={l(v)} value={l(v)}>{l(v)}</option>)}
                  </select>
                  <svg aria-hidden viewBox="0 0 12 8" className="pointer-events-none absolute right-4 top-1/2 h-2 w-3 -translate-y-1/2"><path d="M0 0h12L6 8z" fill="currentColor" /></svg>
                </div>
              ))}
              <fieldset className="col-span-2 mt-2">
                <legend className="mb-3 text-sm text-ink-muted">{l(f.agents)}</legend>
                <div className="flex flex-wrap gap-2">{[...agentNames, l(f.all)].map((a) => (
                  <label key={a} className="flex cursor-pointer items-center gap-2 rounded-md border border-ink/15 bg-fg px-3 py-2 text-sm has-checked:border-accent has-checked:bg-accent/5">
                    <input type="checkbox" name="agents" value={a} className="accent-[var(--accent-primary)]" />{a}
                  </label>))}</div>
              </fieldset>
              <p className="col-span-2 mt-2 text-sm text-ink-muted">{l(f.privacy)} <Link href="/security" className="text-ink underline underline-offset-2">{l(f.privacyLink)}</Link>.</p>
              <div className="col-span-2 mt-2 flex flex-col items-start gap-3">
                <button type="submit" className="group/cta inline-flex h-10 items-center gap-3 rounded-md bg-ink pl-4 pr-1 text-sm font-medium text-fg">{l(f.submit)}<ArrowBox tone="light" /></button>
                <p role="status" className="text-xs text-ink-muted">{error || l(f.check)}</p>
              </div>
            </form>
          </div>
          {/* right panel: Raqio's own mission and real next steps (no invented testimonials or customer logos) */}
          <aside className="col-span-8 h-fit rounded-card bg-card p-8 text-ink md:col-span-5 md:col-start-8 md:p-10">
            <blockquote className="header5 text-balance">“{l(demo.panel.quote)}”</blockquote>
            <p className="mt-6 text-sm font-medium">{l(demo.panel.by)}</p><p className="text-sm text-ink-muted">{l(demo.panel.role)}</p>
            <div className="my-8 h-px bg-ink/15" />
            <p className="detail-mono mb-4 text-center text-ink-muted">{l(demo.panel.next)}</p>
            <ol className="flex flex-col">{demo.after.map((s, i) => (
              <li key={i} className="grid grid-cols-[40px_1fr] gap-3 border-t border-ink/10 py-4 first:border-t-0">
                <span className="detail-mono text-ink-muted">{String(i + 1).padStart(2, "0")}</span>
                <span><b className="font-medium">{l(s.title)}</b><span className="body2 block text-ink-muted">{l(s.body)}</span></span>
              </li>))}</ol>
          </aside>
        </div>
      </section>
      <section data-theme="light" className="bg-fg pb-24">
        <div className="grid-layout">
          <h2 className="header3 col-span-8 mb-6 md:col-span-4 md:col-start-2">{l(common.faq)}</h2>
          <div className="col-span-8 md:col-span-6 md:col-start-6">
            {demo.faq.map((q) => <details key={l(q.q)} className="group border-t border-ink/10 py-5"><summary className="flex cursor-pointer list-none items-center justify-between header5">{l(q.q)}<span className="text-ink-muted transition-transform group-open:rotate-45">+</span></summary><p className="body2 mt-3 text-ink-muted">{l(q.a)}</p></details>)}
          </div>
        </div>
      </section>
    </>
  );
}
