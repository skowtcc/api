import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@skowt-monorepo/api/routers/index";

type RouterOutput = inferRouterOutputs<AppRouter>;

export type AssetDetail = NonNullable<RouterOutput["asset"]["getById"]>;
export type AssetRelatedItem = RouterOutput["asset"]["getRelated"]["items"][number];
