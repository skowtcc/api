import type { Context as ElysiaContext } from "elysia";
import { auth } from "@skowt-monorepo/auth";

export type CreateContextOptions = {
  context: ElysiaContext;
};

export async function createContext({ context }: CreateContextOptions) {
  const session = await auth.api.getSession({
    headers: context.request.headers,
  });
  /* client-generated stable ID stored in localStorage and sent on every
     request. surfaces in logs + spans so support can find a user's recent
     requests in BS from a single ID they share. works for both authed and
     unauthed users. absent for direct API hits without the header

     hard-capped at 64 chars so a malicious client can't ship a multi-KB
     header that gets stamped on every span + wide event in the request
     (attribute amplification). UUIDs are 36 chars; 64 leaves headroom for
     mobile-client variants without giving up bound-safety */
  const debugIdHeader = context.request.headers.get("x-debug-id");
  const debugId = debugIdHeader ? debugIdHeader.slice(0, 64) : undefined;
  return {
    session,
    headers: context.request.headers,
    debugId,
    set: context.set,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
