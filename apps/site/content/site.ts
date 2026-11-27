// All Raqio copy lives here. Product facts come from the repo README / current marketing site; no invented stats or customers.

export type NavLink = { label: string; href: string };
export type NavColumn = { heading: string; links: NavLink[] };
export type NavItem = { label: string; columns: NavColumn[][]; media: { label: string; tone: "a2" | "a3" | "a4"; image?: string } | { cards: { title: string; href: string; tag: string; image?: string }[] } };

export const nav: NavItem[] = [
  { label: "AI Agents", media: { label: "Research Agent", tone: "a4", image: "/media/menu-agents.jpg" }, columns: [
    [{ heading: "Understand", links: [{ label: "Research Agent", href: "/agents/research" }, { label: "SEO Agent", href: "/agents/seo" }] }],
    [{ heading: "Act", links: [{ label: "Marketing Agent", href: "/agents/marketing" }, { label: "Customer Service Agent", href: "/agents/customer-service" }] },
     { heading: "Compare", links: [{ label: "All agents", href: "/compare" }] }],
  ] },
  { label: "Solutions", media: { label: "Clinics", tone: "a3", image: "/media/menu-solutions.jpg" }, columns: [
    [{ heading: "By industry", links: [{ label: "Clinics", href: "/solutions/clinics" }, { label: "Food & Beverage", href: "/solutions/fnb" }, { label: "Property", href: "/solutions/property" }, { label: "Education", href: "/solutions/education" }, { label: "Retail", href: "/solutions/retail" }] }],
    [{ heading: "By team", links: [{ label: "Sales", href: "/solutions/sales" }, { label: "Customer Service", href: "/solutions/customer-service" }, { label: "Owners", href: "/solutions/owners" }] }],
  ] },
  { label: "Research", media: { label: "How we score", tone: "a2", image: "/media/menu-research.jpg" }, columns: [
    [{ heading: "Methods", links: [{ label: "How we score", href: "/research/scoring" }, { label: "Data sources", href: "/research/sources" }, { label: "Industry benchmarks", href: "/research/benchmarks" }] }],
    [{ heading: "Evaluate", links: [{ label: "Report samples", href: "/research/samples" }, { label: "Accuracy notes", href: "/research/accuracy" }] }],
  ] },
  { label: "Resources", media: { cards: [{ title: "Reading a competitor map in ten minutes", href: "/guides/competitor-map", tag: "Guide", image: "/media/menu-guide.jpg" }, { title: "Running a team WhatsApp inbox without losing deals", href: "/blog/team-inbox", tag: "Blog", image: "/media/menu-blog.jpg" }] }, columns: [
    [{ heading: "Learn", links: [{ label: "Blog", href: "/blog" }, { label: "Guides", href: "/guides" }, { label: "Compare products", href: "/compare" }] }],
    [{ heading: "Company", links: [{ label: "About", href: "/about" }, { label: "Security", href: "/security" }, { label: "Book a demo", href: "/demo" }] }],
  ] },
];

export const hero = {
  headline: "Know your market. Reach your customers.",
  tags: ["Clinic", "Café", "Grocery", "Pharmacy", "Barbershop", "Bakery"],
  focus: "Competitor · 4.6★",
  sourcesLabel: "Data sources and links we check",
  waLabel: "One dashboard, the whole team",
  detect: { status: "Scanning", area: "South Jakarta", found: "Businesses found", sample: "Illustrative sample",
    records: [{ name: "Klinik Sehat Sentosa", meta: "★ 4.8 · 1,284 reviews · 08:00–21:00" }, { name: "Kopi Tepi Jalan", meta: "★ 4.6 · 712 reviews · 07:00–23:00" }, { name: "Apotek Sinar", meta: "★ 4.4 · 389 reviews · 24 hours" }],
    leads: ["Prospect score 91", "Prospect score 87"], chats: [{ from: "New chat · Dental Care Plus", text: "Is the 10am slot still open tomorrow?" }, { from: "Raqio · assigned to Rina", text: "Yes, booked. Down-payment reminder sent ✓" }] },
  trackLabels: { car: "Car", truck: "Truck", bus: "Bus", motorcycle: "Motorbike", person: "Person", boat: "Ship", bottle: "Bottle", cup: "Cup", bowl: "Bowl" } as Record<string, string>,
  report: { area: "Clinics · South Jakarta", business: "Business", reviews: "Reviews", score: "Strength score", tabs: ["Strength", "Reviews", "5 km"] },
  stages: [
    { eyebrow: "", title: "Good decisions start with the whole market.", body: "Raqio maps every business in your industry and region from public Google Maps data and scores each one with a fixed formula. A 5.0 rating from 6 reviews no longer outranks a 4.7 from 1,200.", cta: null },
    { eyebrow: "Research Agent", title: "See every competitor before they see you.", body: "Pick an industry and an area. Every business gets a 0–100 prospect score: reachable on WhatsApp +25, no website +20, rating 4.5 or higher +15. Scores of 40 and up make your prospect list.", cta: { label: "Explore Research Agent", href: "/agents/research" } },
    { eyebrow: "Customer Service Agent", title: "Every WhatsApp conversation in one team inbox.", body: "One dashboard for the whole team. Every chat is tracked until the deal closes, a chat left 4 operating hours without a reply counts as unanswered, and down-payment reminders go out on time.", cta: { label: "Explore Customer Service Agent", href: "/agents/customer-service" } },
  ],
};

export const quote = {
  text: "Raqio replaces guesswork with numbers: every business in your market gets a 0–100 prospect score and a review-weighted strength score, and every customer chat is tracked until the deal closes.",
  attribution: "What Raqio is for",
};

export const applications = {
  title: "Market Intelligence",
  prefix: "For",
  rotator: ["Clinics", "Food & Beverage", "Property", "Education", "Retail", "Automotive", "Beauty", "Logistics"],
  cta: { label: "See industries", href: "/solutions/clinics" },
};

export const carousel = {
  title: "Built for how local businesses actually sell.",
  cards: [
    { tag: "Clinics", title: "Find every clinic within five kilometres and see which ones answer reviews.", icon: "map" },
    { tag: "Food & Beverage", title: "Rank outlets by rating, reviews and price before choosing a location.", icon: "chart" },
    { tag: "Property", title: "Route every listing enquiry from WhatsApp to the right agent.", icon: "chat" },
    { tag: "Education", title: "Remind parents of down payments before the intake closes.", icon: "bell" },
    { tag: "Retail", title: "Track which competitors open, close or change prices in your area.", icon: "pin" },
    { tag: "Owners", title: "See pipeline, chats unanswered for 4+ operating hours and cash in, every morning.", icon: "chart" },
  ],
};

export const cardGrid = {
  title: "Four AI agents. One market, worked end to end.",
  cards: [
    { icon: "research", title: "Research Agent", body: "Maps every business in your industry and area and gives each a 0–100 prospect score. 40 and up is worth contacting.", cta: { label: "Research Agent", href: "/agents/research" }, fill: "a2" as const },
    { icon: "prospects", title: "SEO Agent", body: "Computes a 0–100 ranking per industry and area: 60% review quality, 25% scale, 15% reach.", cta: { label: "SEO Agent", href: "/agents/seo" }, fill: "a3" as const },
    { icon: "reach", title: "Marketing Agent", body: "Writes and sends personal outreach on WhatsApp, Instagram and email, with recipients picked by prospect score.", cta: { label: "Marketing Agent", href: "/agents/marketing" }, fill: "a4" as const },
    { icon: "inbox", title: "Customer Service Agent", body: "Runs the team WhatsApp dashboard, deals and reminders; a chat with no reply for 4 operating hours counts as unanswered.", cta: { label: "Customer Service Agent", href: "/agents/customer-service" }, fill: "a2" as const },
  ],
};

export const blog = {
  title: "From the field to your pipeline.",
  posts: [
    { tag: "Guide", title: "Reading a competitor map in ten minutes", href: "/guides/competitor-map", hero: true },
    { tag: "Product", title: "How Raqio scores business strength", href: "/research/scoring" },
    { tag: "Blog", title: "Running a team WhatsApp inbox without losing deals", href: "/blog/team-inbox" },
    { tag: "Guide", title: "Choosing a location with review data", href: "/guides/location" },
    { tag: "Product", title: "Down-payment reminders that customers do not ignore", href: "/blog/dp-reminders" },
    { tag: "Blog", title: "What unanswered chats cost a small team", href: "/blog/unanswered" },
  ],
};

export const videoCta = { title: "Know the market. Then work it.", body: "Book a short demo and see a live report for your industry and area.", cta: { label: "Book a demo", href: "/demo" } };

export const footer = {
  columns: [
    { heading: "AI Agents", links: [{ label: "Research Agent", href: "/agents/research" }, { label: "SEO Agent", href: "/agents/seo" }, { label: "Marketing Agent", href: "/agents/marketing" }, { label: "Customer Service Agent", href: "/agents/customer-service" }] },
    { heading: "Solutions", links: [{ label: "Clinics", href: "/solutions/clinics" }, { label: "Food & Beverage", href: "/solutions/fnb" }, { label: "Property", href: "/solutions/property" }, { label: "Education", href: "/solutions/education" }] },
    { heading: "Research", links: [{ label: "How we score", href: "/research/scoring" }, { label: "Data sources", href: "/research/sources" }] },
    { heading: "Resources", links: [{ label: "Blog", href: "/blog" }, { label: "Guides", href: "/guides" }, { label: "Compare products", href: "/compare" }] },
    { heading: "Company", links: [{ label: "About", href: "/about" }, { label: "Security", href: "/security" }, { label: "Book a demo", href: "/demo" }, { label: "Research", href: "/research" }] },
  ],
  wordmark: "Know your market. Reach your customers.",
};
