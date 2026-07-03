import { createFileRoute } from "@tanstack/react-router";
import { serverTrpc, xmlResponse, xmlEscape } from "@/lib/sitemap-server";
import { SITE_URL } from "@/lib/seo";
import { buildRawAssetUrl } from "@/lib/api-transforms";

/* asset sitemap pages (?page=N, N from the sitemap index): every approved
asset's detail page with an image-sitemap entry pointing at the full-size
original - Google Images is the channel AI Overviews can't intercept, and
the raw file (not the 300px thumb) is what should rank there */
export const Route = createFileRoute("/sitemap-assets.xml")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const pageParam = new URL(request.url).searchParams.get("page");
        const page = Number(pageParam ?? "1");
        if (!Number.isInteger(page) || page < 1) {
          return xmlResponse("<!-- invalid page -->", 404);
        }

        const { items, total, pageSize } = await serverTrpc.asset.sitemap.query({ page });
        if (items.length === 0 && page > Math.max(1, Math.ceil(total / pageSize))) {
          return xmlResponse("<!-- page out of range -->", 404);
        }

        const urls = items.map((a) => {
          const title = `${a.name} - ${a.gameName} ${a.categoryName}`;
          return `  <url>
    <loc>${xmlEscape(`${SITE_URL}/asset/${a.id}`)}</loc>
    <lastmod>${a.lastmod}</lastmod>
    <image:image>
      <image:loc>${xmlEscape(buildRawAssetUrl(a.id, a.extension))}</image:loc>
      <image:title>${xmlEscape(title)}</image:title>
    </image:image>
  </url>`;
        });

        const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls.join("\n")}
</urlset>
`;
        return xmlResponse(body);
      },
    },
  },
});
