import { z } from "zod";
import {
  publicProcedure,
  protectedProcedure,
  contributorProcedure,
  staffProcedure,
  router,
} from "../index";
import { withRateLimit, RATE_LIMITS } from "../lib/rate-limit";
import {
  db,
  request,
  requestVote,
  requestComment,
  commentUpvote,
  game,
  requestTypes,
  requestStatuses,
  eq,
  and,
  or,
  desc,
  lt,
  like,
  sql,
  inArray,
} from "@skowt-monorepo/db";
import { requireCanModify } from "../lib/authorization";
import { paginationSchema } from "../lib/schemas";
import { enqueueLazyProfileRefresh, toPublicUser } from "../lib/discord-profile";
import { notFound, badRequest } from "../lib/errors";
import { paginateResults, keysetPage } from "../lib/pagination";
import { encodeCursor, decodeCursor } from "../lib/cursor";

type RequestListCursor = {
  voteCount: number;
  createdAt: Date;
  id: string;
};

function parseRequestListCursor(cursor: string): RequestListCursor | null {
  return decodeCursor(cursor, (raw) => {
    if (
      typeof raw.voteCount === "number" &&
      typeof raw.createdAt === "string" &&
      typeof raw.id === "string"
    ) {
      const createdAt = new Date(raw.createdAt);
      if (!Number.isNaN(createdAt.getTime())) {
        return { voteCount: raw.voteCount, createdAt, id: raw.id };
      }
    }
    return null;
  });
}

function encodeRequestListCursor(entry: {
  voteCount: number;
  createdAt: Date;
  id: string;
}): string {
  return encodeCursor({
    voteCount: entry.voteCount,
    createdAt: entry.createdAt.toISOString(),
    id: entry.id,
  });
}

export const requestRouter = router({
  list: publicProcedure
    .use(withRateLimit(RATE_LIMITS.public, { useIp: true }))
    .input(
      paginationSchema.extend({
        type: z.enum(requestTypes).optional(),
        status: z.enum(requestStatuses).optional(),
        query: z.string().trim().max(200).optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const { cursor, limit, type, status, query } = input;
      const userId = ctx.session?.user?.id;

      const conditions = [];
      if (status) conditions.push(eq(request.status, status));
      if (type) conditions.push(eq(request.type, type));
      if (query) {
        const pattern = `%${query}%`;
        conditions.push(or(like(request.title, pattern), like(request.description, pattern))!);
      }
      if (cursor) {
        const parsedCursor = parseRequestListCursor(cursor);
        if (parsedCursor) {
          conditions.push(
            or(
              lt(request.voteCount, parsedCursor.voteCount),
              and(
                eq(request.voteCount, parsedCursor.voteCount),
                lt(request.createdAt, parsedCursor.createdAt),
              ),
              and(
                eq(request.voteCount, parsedCursor.voteCount),
                eq(request.createdAt, parsedCursor.createdAt),
                lt(request.id, parsedCursor.id),
              ),
            )!,
          );
        }
      }

      const results = await db.query.request.findMany({
        where: conditions.length > 0 ? and(...conditions) : undefined,
        orderBy: [desc(request.voteCount), desc(request.createdAt), desc(request.id)],
        limit: limit + 1,
        with: {
          creator: {
            columns: {
              id: true,
              name: true,
              image: true,
              role: true,
              profileUpdatedAt: true,
            },
          },
          game: { columns: { id: true, slug: true, name: true } },
        },
      });

      enqueueLazyProfileRefresh(results.map((r) => r.creator));

      const { items, nextCursor } = keysetPage(results, limit, (last) =>
        encodeRequestListCursor(last),
      );

      let userVotes: Set<string> = new Set();
      if (userId && items.length > 0) {
        const entryIds = items.map((e) => e.id);
        const votes = await db.query.requestVote.findMany({
          where: and(eq(requestVote.userId, userId), inArray(requestVote.entryId, entryIds)),
          columns: { entryId: true },
        });
        userVotes = new Set(votes.map((v) => v.entryId));
      }

      return {
        items: items.map(({ creator, ...item }) => ({
          ...item,
          creator: toPublicUser(creator),
          hasVoted: userVotes.has(item.id),
        })),
        nextCursor,
      };
    }),

  getById: publicProcedure
    .use(withRateLimit(RATE_LIMITS.public, { useIp: true }))
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const entry = await db.query.request.findFirst({
        where: eq(request.id, input.id),
        with: {
          creator: {
            columns: {
              id: true,
              name: true,
              image: true,
              role: true,
              profileUpdatedAt: true,
            },
          },
          game: { columns: { id: true, slug: true, name: true } },
        },
      });

      if (!entry) {
        notFound("entry");
      }

      enqueueLazyProfileRefresh([entry.creator]);

      let hasVoted = false;
      if (ctx.session?.user?.id) {
        const userVote = await db.query.requestVote.findFirst({
          where: and(
            eq(requestVote.entryId, input.id),
            eq(requestVote.userId, ctx.session.user.id),
          ),
          columns: { id: true },
        });
        hasVoted = !!userVote;
      }

      const { creator, ...rest } = entry;
      return {
        ...rest,
        creator: toPublicUser(creator),
        hasVoted,
      };
    }),

  toggle: protectedProcedure
    .use(withRateLimit(RATE_LIMITS.vote))
    .input(z.object({ entryId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id;

      const entry = await db.query.request.findFirst({
        where: eq(request.id, input.entryId),
        columns: { id: true, status: true },
      });

      if (!entry) {
        notFound("entry");
      }

      if (entry.status === "completed" || entry.status === "rejected") {
        badRequest("cannot vote on closed entries");
      }

      return await db.transaction(async (tx) => {
        const existing = await tx.query.requestVote.findFirst({
          where: and(eq(requestVote.entryId, input.entryId), eq(requestVote.userId, userId)),
        });

        if (existing) {
          await tx.delete(requestVote).where(eq(requestVote.id, existing.id));
          await tx
            .update(request)
            .set({ voteCount: sql`${request.voteCount} - 1` })
            .where(eq(request.id, input.entryId));
          return { voted: false };
        } else {
          await tx.insert(requestVote).values({ entryId: input.entryId, userId });
          await tx
            .update(request)
            .set({ voteCount: sql`${request.voteCount} + 1` })
            .where(eq(request.id, input.entryId));
          return { voted: true };
        }
      });
    }),

  /* no current FE caller (the `list` query already returns `hasVoted` per row).
     tests retained as a behavioural contract; remove with its tests if a future
     pass confirms nothing else relies on the single-entry endpoint */
  hasVoted: protectedProcedure
    .use(withRateLimit(RATE_LIMITS.query))
    .input(z.object({ entryId: z.string() }))
    .query(async ({ input, ctx }) => {
      const userId = ctx.session.user.id;

      const existing = await db.query.requestVote.findFirst({
        where: and(eq(requestVote.entryId, input.entryId), eq(requestVote.userId, userId)),
        columns: { id: true },
      });

      return { voted: !!existing };
    }),

  create: contributorProcedure
    .use(withRateLimit(RATE_LIMITS.vote))
    .input(
      z.object({
        type: z.enum(requestTypes),
        title: z.string().trim().min(1).max(200),
        description: z.string().trim().max(2000).optional(),
        gameId: z.string().optional(), // for game_category type
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id;

      if (input.type === "game_category" && !input.gameId) {
        badRequest("gameId is required for game_category entries");
      }

      if (input.gameId) {
        const gameExists = await db.query.game.findFirst({
          where: eq(game.id, input.gameId),
          columns: { id: true },
        });
        if (!gameExists) {
          notFound("game");
        }
      }

      const [newEntry] = await db
        .insert(request)
        .values({
          type: input.type,
          title: input.title,
          description: input.description,
          gameId: input.gameId,
          createdBy: userId,
        })
        .returning();

      return newEntry;
    }),

  /* no current FE caller; the request detail surface is read-only post-create.
     tests retained as a behavioural contract for any future edit UI */
  update: contributorProcedure
    .use(withRateLimit(RATE_LIMITS.vote))
    .input(
      z.object({
        id: z.string(),
        title: z.string().trim().min(1).max(200).optional(),
        description: z.string().trim().max(2000).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      requireCanModify(
        await db.query.request.findFirst({ where: eq(request.id, input.id) }),
        (e) => e.createdBy,
        ctx.session.user,
        { notFound: "entry", forbidden: "you can only edit your own entries" },
      );

      const { id, ...updates } = input;
      await db.update(request).set(updates).where(eq(request.id, id));

      return { success: true };
    }),

  setStatus: staffProcedure
    .use(withRateLimit(RATE_LIMITS.moderate))
    .input(
      z.object({
        id: z.string(),
        status: z.enum(["open", "in_progress", "completed", "rejected"]),
      }),
    )
    .mutation(async ({ input }) => {
      const entry = await db.query.request.findFirst({
        where: eq(request.id, input.id),
        columns: { id: true },
      });

      if (!entry) {
        notFound("entry");
      }

      await db.update(request).set({ status: input.status }).where(eq(request.id, input.id));

      return { success: true };
    }),

  delete: protectedProcedure
    .use(withRateLimit(RATE_LIMITS.vote))
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      requireCanModify(
        await db.query.request.findFirst({
          where: eq(request.id, input.id),
          columns: { id: true, createdBy: true },
        }),
        (e) => e.createdBy,
        ctx.session.user,
        { notFound: "entry", forbidden: "you can only delete your own entries" },
      );

      await db.delete(request).where(eq(request.id, input.id));
      return { success: true };
    }),

  listComments: publicProcedure
    .use(withRateLimit(RATE_LIMITS.public, { useIp: true }))
    .input(
      z.object({
        entryId: z.string(),
        offset: z.number().min(0).default(0),
        limit: z.number().min(1).max(100).default(50),
      }),
    )
    .query(async ({ input, ctx }) => {
      const { entryId, offset, limit } = input;
      const userId = ctx.session?.user?.id;

      const results = await db.query.requestComment.findMany({
        where: eq(requestComment.entryId, entryId),
        orderBy: [desc(requestComment.upvoteCount), desc(requestComment.createdAt)],
        limit: limit + 1,
        offset,
        with: {
          user: {
            columns: {
              id: true,
              name: true,
              image: true,
              role: true,
              profileUpdatedAt: true,
            },
          },
        },
      });

      enqueueLazyProfileRefresh(results.map((r) => r.user));

      const { items, hasMore } = paginateResults(results, limit);

      let userUpvotes: Set<string> = new Set();
      if (userId && items.length > 0) {
        const commentIds = items.map((c) => c.id);
        const upvotes = await db.query.commentUpvote.findMany({
          where: and(
            eq(commentUpvote.userId, userId),
            inArray(commentUpvote.commentId, commentIds),
          ),
          columns: { commentId: true },
        });
        userUpvotes = new Set(upvotes.map((u) => u.commentId));
      }

      return {
        items: items.map(({ user: userRow, ...item }) => ({
          ...item,
          user: toPublicUser(userRow),
          hasUpvoted: userUpvotes.has(item.id),
        })),
        hasMore,
        nextOffset: hasMore ? offset + limit : null,
      };
    }),

  addComment: protectedProcedure
    .use(withRateLimit(RATE_LIMITS.comment))
    .input(
      z.object({
        entryId: z.string(),
        content: z.string().trim().min(1).max(2000),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id;

      const entry = await db.query.request.findFirst({
        where: eq(request.id, input.entryId),
        columns: { id: true },
      });

      if (!entry) {
        notFound("entry");
      }

      const [newComment] = await db
        .insert(requestComment)
        .values({
          entryId: input.entryId,
          userId,
          content: input.content,
        })
        .returning();

      return newComment;
    }),

  /* no current FE caller; comments are write-once in the UI. tests retained as
     a behavioural contract for any future inline-edit affordance */
  updateComment: protectedProcedure
    .use(withRateLimit(RATE_LIMITS.comment))
    .input(
      z.object({
        id: z.string(),
        content: z.string().trim().min(1).max(2000),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      requireCanModify(
        await db.query.requestComment.findFirst({ where: eq(requestComment.id, input.id) }),
        (c) => c.userId,
        ctx.session.user,
        { notFound: "comment", forbidden: "you can only edit your own comments" },
      );

      await db
        .update(requestComment)
        .set({ content: input.content, updatedAt: new Date() })
        .where(eq(requestComment.id, input.id));

      return { success: true };
    }),

  deleteComment: protectedProcedure
    .use(withRateLimit(RATE_LIMITS.comment))
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      requireCanModify(
        await db.query.requestComment.findFirst({ where: eq(requestComment.id, input.id) }),
        (c) => c.userId,
        ctx.session.user,
        { notFound: "comment", forbidden: "you can only delete your own comments" },
      );

      await db.delete(requestComment).where(eq(requestComment.id, input.id));

      return { success: true };
    }),

  toggleCommentUpvote: protectedProcedure
    .use(withRateLimit(RATE_LIMITS.vote))
    .input(z.object({ commentId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id;

      const comment = await db.query.requestComment.findFirst({
        where: eq(requestComment.id, input.commentId),
        columns: { id: true },
      });

      if (!comment) {
        notFound("comment");
      }

      return await db.transaction(async (tx) => {
        const existing = await tx.query.commentUpvote.findFirst({
          where: and(
            eq(commentUpvote.commentId, input.commentId),
            eq(commentUpvote.userId, userId),
          ),
        });

        if (existing) {
          await tx.delete(commentUpvote).where(eq(commentUpvote.id, existing.id));
          await tx
            .update(requestComment)
            .set({ upvoteCount: sql`${requestComment.upvoteCount} - 1` })
            .where(eq(requestComment.id, input.commentId));

          const updated = await tx.query.requestComment.findFirst({
            where: eq(requestComment.id, input.commentId),
            columns: { upvoteCount: true },
          });

          return { upvoted: false, upvoteCount: updated?.upvoteCount ?? 0 };
        } else {
          await tx.insert(commentUpvote).values({
            commentId: input.commentId,
            userId,
          });
          await tx
            .update(requestComment)
            .set({ upvoteCount: sql`${requestComment.upvoteCount} + 1` })
            .where(eq(requestComment.id, input.commentId));

          const updated = await tx.query.requestComment.findFirst({
            where: eq(requestComment.id, input.commentId),
            columns: { upvoteCount: true },
          });

          return { upvoted: true, upvoteCount: updated?.upvoteCount ?? 0 };
        }
      });
    }),
});
