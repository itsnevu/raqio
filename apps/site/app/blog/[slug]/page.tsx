import { notFound } from "next/navigation";
import { ArticleTemplate } from "@/components/templates";
import { articles } from "@/content/pages";
export function generateStaticParams() { return Object.keys(articles).filter((k) => k.startsWith("blog/")).map((k) => ({ slug: k.split("/")[1] })); }
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params; if (!articles["blog/" + slug]) notFound();
  return <ArticleTemplate slug={"blog/" + slug} />;
}
