import { protectedProcedure, publicProcedure, router } from "../index";
import { withRateLimit, RATE_LIMITS } from "../lib/rate-limit";
import {
  db,
  user,
  savedAsset,
  requestVote,
  request,
  requestComment,
  commentUpvote,
  eq,
  desc,
  inArray,
} from "@skowt-monorepo/db";
import type { UserRole } from "@skowt-monorepo/db/schema/auth";
import { ROLE_HIERARCHY } from "../lib/roles";
import {
  enqueueLazyProfileRefresh,
  refreshDiscordProfile,
  toPublicUser,
} from "../lib/discord-profile";
import { z } from "zod";

export const userRouter = router({
  refreshDiscordProfile: publicProcedure
    .use(withRateLimit({ limit: 30, windowSeconds: 60 }))
    .input(z.object({ userId: z.string().min(1) }))
    .mutation(({ input }) => refreshDiscordProfile(input.userId)),

  getContributors: publicProcedure
    .use(withRateLimit({ limit: 30, windowSeconds: 60 }))
    .query(async () => {
      const rows = await db.query.user.findMany({
        where: inArray(user.role, ["contributor", "staff", "developer"]),
        columns: {
          id: true,
          name: true,
          displayName: true,
          image: true,
          role: true,
          profileUpdatedAt: true,
        },
      });

      enqueueLazyProfileRefresh(rows);

      // sort by role hierarchy: developers first, then staff, then contributors
      return (
        rows
          .sort((a, b) => {
            const aOrder = ROLE_HIERARCHY[a.role as UserRole] ?? 0;
            const bOrder = ROLE_HIERARCHY[b.role as UserRole] ?? 0;
            return bOrder - aOrder;
          })
          /* wrap in an arrow so T infers from each row (a bare `.map(toPublicUser)` defaults T to the constraint, dropping `role` and widening to `| null`) */
          .map((u) => toPublicUser(u))
      );
    }),

  exportData: protectedProcedure.use(withRateLimit(RATE_LIMITS.export)).query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const [userData, savedAssets, votes, createdEntries, comments, upvotes] = await Promise.all([
      db.query.user.findFirst({
        where: eq(user.id, userId),
        columns: {
          id: true,
          name: true,
          displayName: true,
          email: true,
          emailVerified: true,
          image: true,
          role: true,
          createdAt: true,
          updatedAt: true,
        },
      }),

      db.query.savedAsset.findMany({
        where: eq(savedAsset.userId, userId),
        orderBy: [desc(savedAsset.createdAt)],
        with: {
          asset: {
            columns: { id: true, name: true },
            with: {
              game: { columns: { name: true } },
              category: { columns: { name: true } },
            },
          },
        },
      }),

      db.query.requestVote.findMany({
        where: eq(requestVote.userId, userId),
        orderBy: [desc(requestVote.createdAt)],
        with: {
          entry: { columns: { id: true, title: true } },
        },
      }),

      db.query.request.findMany({
        where: eq(request.createdBy, userId),
        orderBy: [desc(request.createdAt)],
        columns: {
          id: true,
          type: true,
          title: true,
          description: true,
          status: true,
          voteCount: true,
          createdAt: true,
        },
      }),

      db.query.requestComment.findMany({
        where: eq(requestComment.userId, userId),
        orderBy: [desc(requestComment.createdAt)],
        columns: {
          id: true,
          content: true,
          upvoteCount: true,
          createdAt: true,
          updatedAt: true,
        },
        with: {
          entry: { columns: { id: true, title: true } },
        },
      }),

      db.query.commentUpvote.findMany({
        where: eq(commentUpvote.userId, userId),
        orderBy: [desc(commentUpvote.createdAt)],
        with: {
          comment: {
            columns: { id: true, content: true },
            with: {
              entry: { columns: { title: true } },
            },
          },
        },
      }),
    ]);

    return {
      user: userData,
      savedAssets,
      votes,
      createdEntries,
      comments,
      upvotes,
      exportedAt: new Date().toISOString(),
    };
  }),
});
