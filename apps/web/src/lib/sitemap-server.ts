import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@skowt-monorepo/api/routers/index";
import { WEB_SERVER_URL } from "./env";

/* vanilla tRPC client for the sitemap server routes - they run in Nitro
   request handlers, outside React, so the router-context proxy isn't available */
export const serverTrpc = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: `${WEB_SERVER_URL}/trpc` })],
});

/* must match SITEMAP_PAGE_SIZE in packages/api asset.router.ts - the index
   route derives its page count from the site totals using this size */
export const SITEMAP_PAGE_SIZE = 10_000;

export function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/* sitemaps regenerate hourly at most (the API caches the underlying queries
   for an hour); let crawlers and the CDN hold them just as long */
export function xmlResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
