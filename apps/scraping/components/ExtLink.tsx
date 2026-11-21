// Link eksternal: hanya http(s), selalu target=_blank + rel="noopener noreferrer". Href tidak valid dirender sebagai teks biasa.
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { safeHttpUrl } from "@/lib/safe";

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "target" | "rel"> & { href: string | null | undefined; children: ReactNode };

export default function ExtLink({ href, children, className, ...rest }: Props) {
  const url = safeHttpUrl(href);
  if (!url) return <span className={className}>{children}</span>;
  return (
    <a {...rest} className={className} href={url} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}
