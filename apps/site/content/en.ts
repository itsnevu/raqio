import * as site from "./site";

export const en = {
  nav: site.nav, hero: site.hero, quote: site.quote, applications: site.applications, carousel: site.carousel,
  cardGrid: site.cardGrid, blog: site.blog, videoCta: site.videoCta, footer: site.footer,
  ui: {
    home: "Raqio home", main: "Main", menu: "Menu", menuSuffix: "menu", openMenu: "Open menu", closeMenu: "Close menu",
    login: "Log in", getStarted: "Get started", scroll: "Scroll to explore", skip: "Skip to content",
    prev: "Previous", next: "Next", language: "Language", pauseVideo: "Pause video", playVideo: "Play video",
    sections: { intro: "Introduction", why: "Why Raqio", industries: "Industries", useCases: "Use cases", products: "Products", latest: "Latest", demo: "Book a demo" },
    report: { label: "Sample report preview", scope: "Clinics · South Jakarta", sample: "Sample" },
    legal: "Privacy · Terms",
  },
};

export type Dict = typeof en;
