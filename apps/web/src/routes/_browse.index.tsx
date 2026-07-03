import { createFileRoute } from "@tanstack/react-router";
import { HomeHero } from "@/components/home-hero";
import { validateAssetSearch } from "@/lib/asset-search";
import { SITE_URL, JsonLd } from "@/lib/seo";

const DESCRIPTION =
  "Comprehensive game asset database that's community-driven and free for everyone. Previously known as wanderer.moe.";

export const Route = createFileRoute("/_browse/")({
  component: HomeComponent,
  validateSearch: validateAssetSearch,
  head: () => ({
    meta: [
      { title: "skowt.cc" },
      { name: "description", content: DESCRIPTION },
      // og:* must use property= (not name=) or scrapers ignore them
      { property: "og:title", content: "skowt.cc" },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: SITE_URL },
      { property: "og:site_name", content: "skowt.cc" },
      { property: "og:image", content: `${SITE_URL}/pwa-512x512.png` },
      /* square logo -> small summary card, not the (previously imageless)
         summary_large_image */
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "skowt.cc" },
      { name: "twitter:description", content: DESCRIPTION },
      { name: "twitter:image", content: `${SITE_URL}/pwa-512x512.png` },
    ],
    links: [{ rel: "canonical", href: SITE_URL }],
  }),
});

// the layout owns the AssetBrowser; this route contributes only the hero
function HomeComponent() {
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "skowt.cc",
          alternateName: "wanderer.moe",
          url: SITE_URL,
          description: DESCRIPTION,
        }}
      />
      <HomeHero />
    </>
  );
}
