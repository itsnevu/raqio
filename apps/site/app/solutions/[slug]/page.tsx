import { notFound } from "next/navigation";
import { SolutionTemplate } from "@/components/templates";
import { solutions } from "@/content/pages";
export function generateStaticParams() { return Object.keys(solutions).map((slug) => ({ slug })); }
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params; if (!solutions[slug]) notFound();
  return <SolutionTemplate slug={slug} />;
}
