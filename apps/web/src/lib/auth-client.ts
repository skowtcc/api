import type { auth } from "@skowt-monorepo/auth";
import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";
import { WEB_SERVER_URL } from "./env";
import { getDebugId } from "./debug-id";

export const authClient = createAuthClient({
  baseURL: WEB_SERVER_URL,
  plugins: [inferAdditionalFields<typeof auth>()],
  /*
   * mirror the x-debug-id header that the tRPC client sets in router.tsx
   * so support can find both auth-flow and tRPC requests for a user via
   * the same debug ID. resolved per-request inside onRequest so SSR or a
   * localStorage race at module-load time doesn't permanently disable the
   * header for the session; matches the per-request lookup pattern in
   * router.tsx's httpBatchLink
   */
  fetchOptions: {
    onRequest: (context) => {
      const debugId = getDebugId();
      if (debugId) context.headers.set("x-debug-id", debugId);
      return context;
    },
  },
});
