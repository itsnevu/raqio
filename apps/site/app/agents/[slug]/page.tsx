import { notFound } from "next/navigation";
import { ProductTemplate } from "@/components/templates";

const SLUGS = { research: "research", seo: "seo", marketing: "marketing", "customer-service": "customerService" } as const;
const TITLES: Record<string, string> = { research: "Research Agent", seo: "SEO Agent", marketing: "Marketing Agent", "customer-service": "Customer Service Agent" };

export function generateStaticParams() { return Object.keys(SLUGS).map((slug) => ({ slug })); }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) { const { slug } = await params; return { title: `${TITLES[slug] ?? "Agent"} | Raqio` }; }
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params; const id = SLUGS[slug as keyof typeof SLUGS]; if (!id) notFound();
  return <ProductTemplate id={id} />;
}
