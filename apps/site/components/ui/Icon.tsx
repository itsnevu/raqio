const paths: Record<string, string> = {
  search: "M11 19a8 8 0 1 1 5.3-14 8 8 0 0 1-5.3 14Zm10 2-4.3-4.3",
  chat: "M4 5h16v11H8l-4 4V5Z",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  map: "M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Zm0 0v14m6-12v14",
  bell: "M6 16V11a6 6 0 1 1 12 0v5l2 2H4l2-2Zm4 4h4",
  pin: "M12 21s-7-6.2-7-12a7 7 0 1 1 14 0c0 5.8-7 12-7 12Zm0-9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
};
export function Icon({ name, className = "size-6" }: { name: keyof typeof paths | string; className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden><path d={paths[name] ?? paths.search} stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg>;
}
