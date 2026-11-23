// Icon paths from WA-Suite public/index.html.
const icons = {
  railDashboard: <><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></>,
  railChat: <><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" /></>,
  railNumbers: <><rect x="6" y="2" width="12" height="20" rx="3" /><path d="M10 18h4" /></>,
  btnRules: <><path d="M8 5h12M8 12h12M8 19h12M3 5h.01M3 12h.01M3 19h.01" /></>,
  railTemplates: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 9v12" /></>,
  railAi: <><rect x="4" y="7" width="16" height="13" rx="3" /><path d="M12 3v4M8 12h.01M16 12h.01M8 16h8M1 12h3M20 12h3" /></>,
  railLabels: <><path d="m3 3 9 0 9 9-9 9-9-9Z" /><circle cx="8" cy="8" r="1" /></>,
  btnUsers: <><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></>,
  railBackups: <><rect x="3" y="3" width="18" height="5" rx="1" /><path d="M5 8v13h14V8M10 12h4" /></>,
  railDeals: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="m8 12 3 3 5-6" /></>,
  railAnalytics: <><path d="M4 20V10M10 20V4M16 20v-7M21 20H3" /></>,
  railNotifications: <><path d="M5 17h14l-2-4V8a5 5 0 0 0-10 0v5ZM10 21h4" /></>,
  railSearch: <><circle cx="10" cy="10" r="6" /><path d="m15 15 6 6" /></>,
  railMonitor: <><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4M5 10h3l2-4 4 8 2-4h3" /></>,
  railAccount: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  btnOut: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5M21 12H9" /></>,
  takeChat: <><circle cx="9" cy="7" r="4" /><path d="M2 21v-2a7 7 0 0 1 14 0v2M19 8v6M16 11h6" /></>,
  exportChat: <><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" /></>,
  labelPick: <><path d="M3 3h9l9 9-9 9-9-9Z" /><circle cx="8" cy="8" r="1" /></>,
  headDelete: <><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" /></>,
  tplPick: <><path d="M5 3h9l5 5v13H5ZM14 3v6h5M8 13h8M8 17h6" /></>,
  btnFile: <><path d="m8 13 7-7a3 3 0 0 1 4 4L9 20a5 5 0 0 1-7-7L12 3M5 16l10-10" /></>,
  plus: <path d="M12 5v14M5 12h14"/>,
  rename: <path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14Z"/>,
  pin: <path d="m16 3 5 5-4 1-4 4-1 4-5-5 4-1 4-4 1-4ZM7 17l-4 4"/>,
  release: <><circle cx="9" cy="7" r="4"/><path d="M2 21v-2a7 7 0 0 1 14 0v2M17 11h6"/></>,
  back: <path d="M15 18l-6-6 6-6"/>,
  menu: <path d="M4 6h16M4 12h16M4 18h16"/>,
  more: <path d="M5 12h.01M12 12h.01M19 12h.01"/>,
  send: <path d="M5 12h14M13 6l6 6-6 6"/>,
  select: <path d="m7 10 5 5 5-5"/>,
  help: <><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4M12 17h.01"/></>,
};

export type WaMockIconName = keyof typeof icons;

export function WaMockIcon({name}:{name:WaMockIconName}){
  return <svg viewBox="0 0 24 24">{icons[name]}</svg>;
}
