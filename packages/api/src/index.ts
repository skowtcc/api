import { initTRPC, TRPCError } from "@trpc/server";
import {
  wrapInSpan,
  getCurrentSpan,
  recordProcedure,
  recordUserId,
  recordErrorCode,
  reportError,
  SpanStatusCode,
} from "@skowt-monorepo/observability/server";
import type { Context } from "./context";
import type { UserRole } from "@skowt-monorepo/db/schema/auth";
import { checkDiscordServerMembership } from "./lib/discord-server";
import { hasMinimumRole, parseUserRole } from "./lib/roles";

export const t = initTRPC.context<Context>().create({
  /* route unexpected procedure failures (anything that throws something other
     than a tRPC-handled error code) into the central error reporter so they
     emit a structured `level: error` log + ERROR-status span. known errors
     (UNAUTHORIZED, BAD_REQUEST, NOT_FOUND, FORBIDDEN, …) are intentional user
     outcomes and stay out of the alert stream */
  errorFormatter({ shape, error }) {
    if (error.code === "INTERNAL_SERVER_ERROR") {
      reportError(error.cause ?? error, { source: "trpc.errorFormatter" });
    }
    return shape;
  },
});

export const router = t.router;

/* open a child span per tRPC procedure call. sits under the Elysia HTTP request
   span so the BS waterfall shows per-procedure timing even when the client
   (httpBatchLink, used in apps/web/src/router.tsx) bundles several procedures
   into one HTTP POST. mutating the parent span instead would race: every
   procedure in the batch would rewrite the parent's name, last write wins,
   and N-1 procedures' timing would vanish into the combined HTTP duration

   each child span owns its own start/end timestamps, so the waterfall reveals
   which specific procedure was slow in a batched request. for example, an initial
   page load that fans out asset.list + games.list + user.me in parallel will
   show three sibling spans, each with its own DB-query children

   attribute names follow OTel RPC semconv:
     rpc.system     - "trpc"
     rpc.service    - tRPC router identifier ("appRouter")
     rpc.method     - procedure path, e.g. "bookmark.list"
     trpc.type      - "query" | "mutation" | "subscription"
     rpc.error_code - set only on failure, e.g. "UNAUTHORIZED"

   the span also gets setStatus(ERROR) on failure so the BS "failed traces"
   view picks it up. rpc.error_code uses the same field name on the wide
   event (elysia-plugin enrich callback) so a single BS query filters both
   signals */
const tracedProcedure = t.procedure.use(async ({ path, type, ctx, next }) => {
  /* push request-level facts into the per-request stats store so the wide
     event at request end carries them flat. without this, batched requests
     would only show one procedure in the log row even though several ran */
  recordProcedure(path);
  if (ctx.session?.user?.id) recordUserId(ctx.session.user.id);

  return wrapInSpan(`trpc.${path}`, async () => {
    const span = getCurrentSpan();
    if (span) {
      span.setAttribute("rpc.system", "trpc");
      span.setAttribute("rpc.service", "appRouter");
      span.setAttribute("rpc.method", path);
      span.setAttribute("trpc.type", type);
      /* identity on the procedure span so a single trace view shows who ran
         what. debug_id covers both authed and unauthed users; user_id only
         when a session is present (most procedures inherit from
         protectedProcedure so this is the common case) */
      if (ctx.debugId) span.setAttribute("debug_id", ctx.debugId);
      if (ctx.session?.user?.id) span.setAttribute("user_id", ctx.session.user.id);
    }
    const result = await next();
    if (!result.ok) {
      /* setStatus(ERROR) is what BS's "failed traces" view and span-status
         filters read; the attribute alone is invisible to those views */
      span?.setStatus({ code: SpanStatusCode.ERROR, message: result.error.message });
      span?.setAttribute("rpc.error_code", result.error.code);
      recordErrorCode(result.error.code);
    }
    return result;
  });
});

export const publicProcedure = tracedProcedure;

export const protectedProcedure = tracedProcedure.use(({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authentication required",
      cause: "No session",
    });
  }
  return next({
    ctx: {
      ...ctx,
      session: ctx.session,
    },
  });
});

export const serverMemberProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const inServer = await checkDiscordServerMembership(ctx.session.user.id);
  if (!inServer) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "You must be a member of our Discord server to download assets. Join at discord.gg/noid",
    });
  }
  return next({ ctx });
});

function createMinimumRoleProcedure(requiredRole: UserRole, message: string) {
  return protectedProcedure.use(({ ctx, next }) => {
    const userRole = parseUserRole(ctx.session.user.role);
    if (!hasMinimumRole(userRole, requiredRole)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message,
      });
    }
    return next({ ctx });
  });
}

export const contributorProcedure = createMinimumRoleProcedure(
  "contributor",
  "Contributor access required",
);

export const staffProcedure = createMinimumRoleProcedure("staff", "Staff access required");

export const developerProcedure = createMinimumRoleProcedure(
  "developer",
  "Developer access required",
);
