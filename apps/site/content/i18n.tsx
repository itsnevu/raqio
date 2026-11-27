"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { en, type Dict } from "./en";
import { id } from "./id";

import { LANG_COOKIE, type Lang } from "./lang";
export type { Lang };
const dicts: Record<Lang, Dict> = { en, id };

const Ctx = createContext<{ lang: Lang; t: Dict; setLang: (l: Lang) => void }>({ lang: "en", t: en, setLang: () => {} });

/** initial language comes from the cookie (read on the server in layout.tsx), so the first paint is already in the right language */
export function LangProvider({ initial, children }: { initial: Lang; children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initial);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    document.cookie = `${LANG_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
  }, []);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  return <Ctx.Provider value={{ lang, t: dicts[lang], setLang }}>{children}</Ctx.Provider>;
}

export const useLang = () => useContext(Ctx);
export const useT = () => useContext(Ctx).t;

/** Re-mount children when the language changes (GSAP word-splitting rewrites text nodes that React would otherwise patch). */
export function LangKeyed({ children }: { children: ReactNode }) {
  const { lang } = useLang();
  return <div key={lang} className="contents">{children}</div>;
}
