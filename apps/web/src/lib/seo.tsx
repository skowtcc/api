/* canonical origin for absolute URLs in heads, sitemaps, and JSON-LD, always
   prod: canonicals/sitemaps only matter to crawlers, and pointing dev/staging
   pages at the prod URL is exactly what a canonical is for */
export const SITE_URL = "https://skowt.cc";

/* search-visible aliases woven into landing-page descriptions: abbreviations
   people actually type into Google that never appear in the game's DB name
   (GSC: the "pjsk stamps" cluster alone was ~3.2k clicks/16mo on wanderer.moe) */
export const GAME_ALIASES: Record<string, string[]> = {
  "project-sekai": ["PJSK"],
};

/* fixed-locale count formatting: rendered in SSR'd heads and H1 sublines, so
   it must not vary with the server/browser locale (hydration mismatch) */
const countFormat = new Intl.NumberFormat("en-US");
export function formatCount(n: number): string {
  return countFormat.format(n);
}

/* JSON-LD structured-data block, lives in the page body (Google parses it
   anywhere in the document) so routes don't depend on head() supporting
   inline script children, `<` is escaped to keep any data content from
   terminating the script element */
export function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
