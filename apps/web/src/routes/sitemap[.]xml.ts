import { createFileRoute } from "@tanstack/react-router";
import { serverTrpc, xmlResponse, xmlEscape, SITEMAP_PAGE_SIZE } from "@/lib/sitemap-server";
import { SITE_URL } from "@/lib/seo";

/* sitemap index: one core sitemap (static pages + game/category landings) and
   N asset sitemaps of SITEMAP_PAGE_SIZE urls each, referenced from robots.txt */
export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const totals = await serverTrpc.stats.getSiteTotals.query();
        const assetPages = Math.max(1, Math.ceil(totals.assets / SITEMAP_PAGE_SIZE));

        const locs = [
          `${SITE_URL}/sitemap-core.xml`,
          ...Array.from(
            { length: assetPages },
            (_, i) => `${SITE_URL}/sitemap-assets.xml?page=${i + 1}`,
          ),
        ];

        const body = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${locs.map((loc) => `  <sitemap><loc>${xmlEscape(loc)}</loc></sitemap>`).join("\n")}
</sitemapindex>
`;
        return xmlResponse(body);
      },
    },
  },
});
