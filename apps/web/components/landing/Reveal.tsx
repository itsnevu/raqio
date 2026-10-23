"use client";
// Fade-in saat seksi masuk viewport: menandai elemen [data-reveal] dengan kelas "in" lewat
// IntersectionObserver (sekali saja per elemen). Transisinya di landing.css. Pengguna
// prefers-reduced-motion atau browser tanpa IO langsung melihat semuanya tanpa animasi.
import { useEffect } from "react";

export default function Reveal() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (!els.length) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || typeof IntersectionObserver === "undefined") {
      els.forEach((e) => e.classList.add("in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          if (en.isIntersecting) {
            en.target.classList.add("in");
            io.unobserve(en.target);
          }
        }
      },
      { threshold: 0.16, rootMargin: "0px 0px -8% 0px" },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);
  return null;
}
