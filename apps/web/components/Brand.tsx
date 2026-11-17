// Aset logo yang sama dipakai di web dan aplikasi mobile.
import Image from "next/image";
import Link from "next/link";

export function BrandMark() {
  return (
    <Image className="mark" src="/brand-transparent.svg" alt="" width={32} height={32} unoptimized />
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
