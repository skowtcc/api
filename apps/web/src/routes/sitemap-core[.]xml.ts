import { createFileRoute } from "@tanstack/react-router";
import { serverTrpc, xmlResponse, xmlEscape } from "@/lib/sitemap-server";
import { SITE_URL } from "@/lib/seo";

const STATIC_PATHS = ["/", "/requests", "/faq", "/contributors", "/changelog"];

/* core sitemap: static pages plus every game and game/category landing page.
   category URLs come from getFilters' per-game category mapping, so only real
   pairings are listed (an unknown pair 404s via the route loader anyway) */
export const Route = createFileRoute("/sitemap-core.xml")({
  server: {
    handlers: {
      GET: async () => {
        const filters = await serverTrpc.asset.getFilters.query();

        const locs = [
          ...STATIC_PATHS.map((p) => `${SITE_URL}${p}`),
          ...filters.games.flatMap((g) => [
            `${SITE_URL}/games/${g.slug}`,
            ...g.categories.map((c) => `${SITE_URL}/games/${g.slug}/${c.slug}`),
          ]),
        ];

        const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${locs.map((loc) => `  <url><loc>${xmlEscape(loc)}</loc></url>`).join("\n")}
</urlset>
`;
        return xmlResponse(body);
      },
    },
  },
});
