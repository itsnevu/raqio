import type { ReactNode } from "react";
import { LogoMark } from "@/components/ui/Logo";

/**
 * detail-mono label (13px uppercase mono). The marker is a mini Raqio mark (four connected nodes) instead of a plain
 * dot, the way scale.com uses a fragment of its logo. It turns in once on hover of the parent group.
 */
export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p className={`detail-mono group/eyebrow flex items-center gap-2 ${className}`}>
      <LogoMark className="h-[11px] w-auto shrink-0 transition-transform duration-700 ease-expo group-hover/eyebrow:rotate-90" />
      {children}
    </p>
  );
}
