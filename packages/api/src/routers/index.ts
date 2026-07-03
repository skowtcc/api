import { isDiscordConfigured } from "@skowt-monorepo/env/server";
import { publicProcedure, router } from "../index";
import { assetRouter } from "./asset.router";
import { bookmarkRouter } from "./bookmark.router";
import { uploadsRouter } from "./uploads.router";
import { moderationRouter } from "./moderation.router";
import { adminRouter } from "./admin.router";
import { requestRouter } from "./request.router";
import { downloadsRouter } from "./downloads.router";
import { userRouter } from "./user.router";
import { statsRouter } from "./stats.router";

export const appRouter = router({
  /* server-derived capability flags so the web app can explain a degraded
     dev environment (e.g. sign-in disabled without Discord OAuth creds)
     instead of failing silently. only ever false in dev - the env schema
     requires the underlying creds in prod */
  capabilities: publicProcedure.query(() => ({
    discordAuth: isDiscordConfigured(),
  })),

  asset: assetRouter,
  bookmark: bookmarkRouter,
  uploads: uploadsRouter,
  moderation: moderationRouter,
  admin: adminRouter,
  request: requestRouter,
  downloads: downloadsRouter,
  user: userRouter,
  stats: statsRouter,
});

export type AppRouter = typeof appRouter;
