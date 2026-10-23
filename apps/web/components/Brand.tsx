// Logo Raqio: satu-satunya tempat SVG brand didefinisikan.
import Link from "next/link";

export function BrandMark() {
  return (
    <svg className="mark" viewBox="0 0 32 32" aria-hidden="true">
      <path d="M5 29V3H18A8 8 0 0 1 18 19H11" fill="none" stroke="currentColor" strokeWidth="4" />
      <path d="M17 19L27 29" stroke="var(--good, #FFB020)" strokeWidth="4" />
    </svg>
  );
}

export default function Brand({ href }: { href?: string }) {
  const inner = (
    <>
      <BrandMark />
      <span className="word">raqio</span>
    </>
  );
  if (!href) return <span className="brand" aria-label="Raqio">{inner}</span>;
  return (
    <Link className="brand" href={href} style={{ textDecoration: "none" }} aria-label="Raqio, ke halaman riset">
      {inner}
    </Link>
  );
}
