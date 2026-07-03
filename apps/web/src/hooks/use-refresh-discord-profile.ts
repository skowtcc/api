import { useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/utils/trpc";

/* module-level dedupe so multiple avatar components rendering the same broken
   user fire one mutation in total. cleared when the request settles. this state
   is CSR-only; if SSR is added, scope per-request or this leaks between users */
const inFlight = new Map<string, Promise<unknown>>();

export function useRefreshDiscordProfile() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const mutation = useMutation(
    trpc.user.refreshDiscordProfile.mutationOptions({
      onSuccess: () => {
        /* refresh affects user shells rendered by these tRPC routers. invalidate
           their active queries only; re-fetching every active query in the app
           is needless amplification */
        void queryClient.invalidateQueries({
          predicate: (query) => {
            const root = query.queryKey[0];
            if (!Array.isArray(root)) return false;
            const router = root[0];
            return (
              router === "user" ||
              router === "asset" ||
              router === "moderation" ||
              router === "request"
            );
          },
          refetchType: "active",
        });
      },
    }),
  );

  const mutate = mutation.mutateAsync;

  return useCallback(
    (userId: string): void => {
      if (!userId || inFlight.has(userId)) return;

      const promise = mutate({ userId }).finally(() => {
        inFlight.delete(userId);
      });

      inFlight.set(userId, promise);
    },
    [mutate],
  );
}
