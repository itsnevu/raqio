/**
 * Raqio logo, traced from the supplied mark: four equal circles in a diamond; the right circle joins the top and
 * bottom ones with metaball necks; the left circle stands apart. Inherits currentColor.
 */
export function LogoMark({ className = "h-[30px] w-auto" }: { className?: string }) {
  return (
    <svg viewBox="5 8 69 68" className={className} fill="currentColor" aria-hidden>
      <circle cx="17" cy="42" r="11" /><circle cx="40" cy="20" r="11" /><circle cx="62" cy="42" r="11" /><circle cx="40" cy="64" r="11" />
      <path d="M41.81 30.85Q50.01 31.99 51.15 40.19L60.19 31.15Q51.99 30.01 50.85 21.81ZM50.85 62.19Q51.99 53.99 60.19 52.85L51.15 43.81Q50.01 52.01 41.81 53.15Z" />
    </svg>
  );
}
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 text-[22px] font-medium leading-none tracking-[-0.02em] ${className}`}>
      <LogoMark />
      Raqio
    </span>
  );
}
