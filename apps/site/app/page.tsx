import { Hero } from "@/components/slices/Hero";
import { ScrollingQuote } from "@/components/slices/ScrollingQuote";
import { Applications } from "@/components/slices/Applications";
import { FullWidthCardCarousel } from "@/components/slices/FullWidthCardCarousel";
import { CardGrid } from "@/components/slices/CardGrid";
import { BlogPreview } from "@/components/slices/BlogPreview";
import { VideoCta } from "@/components/slices/VideoCta";
import { ScrollRevealSection } from "@/components/ui/ScrollRevealSection";

// Section order and light/dark sequence follow the measured scale.com homepage (research/home.spec.md, frames/home__*.jpg).
export default function Home() {
  return (
    <>
      <Hero />
      <ScrollingQuote />
      <Applications />
      <ScrollRevealSection backdrop="bg-light" label="Use cases" className="z-[3]"><FullWidthCardCarousel /></ScrollRevealSection>
      {/* later sections stack above the pinned Applications block (z-[2]) so they cover it, as on scale.com */}
      <div className="relative z-[3]">
        <CardGrid />
        <BlogPreview />
        <VideoCta />
      </div>
    </>
  );
}
