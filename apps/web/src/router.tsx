import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { TRPCClientError } from "@trpc/client";
import Loader from "./components/loader";
import "./index.css";
import { routeTree } from "./routeTree.gen";
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { toast } from "sonner";
import type { AppRouter } from "@skowt-monorepo/api/routers/index";
import { TRPCProvider } from "./utils/trpc";
import { useErrorDialogStore } from "./stores/error-dialog-store";
import { GlobalErrorDialog } from "./components/error/global-error-dialog";
import { HapticsProvider } from "./components/providers/haptics-provider";
import { WEB_SERVER_URL } from "./lib/env";
import { getDebugId } from "./lib/debug-id";

function isDiscordMembershipError(error: unknown): boolean {
  return (
    error instanceof TRPCClientError &&
    error.data?.code === "FORBIDDEN" &&
    error.message.includes("Discord")
  );
}

function isRateLimitError(error: unknown): boolean {
  return error instanceof TRPCClientError && error.data?.code === "TOO_MANY_REQUESTS";
}

function getSafeErrorMessage(error: unknown): string {
  if (!(error instanceof TRPCClientError)) {
    return "Something went wrong";
  }

  const code = error.data?.code;
  switch (code) {
    case "UNAUTHORIZED":
      return "Please sign in to continue";
    case "FORBIDDEN":
      return "You don't have permission to do that";
    case "NOT_FOUND":
      return "The requested item was not found";
    case "BAD_REQUEST":
      return error.message || "Invalid request";
    case "CONFLICT":
      return "This action conflicts with existing data";
    case "INTERNAL_SERVER_ERROR":
      return "Something went wrong. Please try again later.";
    default:
      return "Something went wrong";
  }
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      if (isDiscordMembershipError(error)) return;
      if (isRateLimitError(error)) return;

      toast.error(getSafeErrorMessage(error), {
        action: {
          label: "retry",
          onClick: () => {
            queryClient.invalidateQueries();
          },
        },
      });
    },
  }),
  mutationCache: new MutationCache({
    onError: (error) => {
      if (isDiscordMembershipError(error)) {
        useErrorDialogStore.getState().open("discord");
        return;
      }

      if (isRateLimitError(error)) {
        useErrorDialogStore.getState().open("rate_limit");
        return;
      }
    },
  }),
  defaultOptions: { queries: { staleTime: 60 * 1000 } },
});

const trpcClient = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${WEB_SERVER_URL}/trpc`,
      headers() {
        /* x-debug-id is a stable per-browser identifier (see lib/debug-id.ts) that
           lets support find a user's recent requests in Better Stack from a single
           value the user can copy from settings; conditional spread because
           getDebugId returns undefined in SSR / private-mode browsers */
        const debugId = getDebugId();
        return debugId ? { "x-debug-id": debugId } : {};
      },
      fetch(url, options) {
        return fetch(url, {
          ...options,
          credentials: "include",
        });
      },
    }),
  ],
});

const trpc = createTRPCOptionsProxy({
  client: trpcClient,
  queryClient: queryClient,
});

export const getRouter = () => {
  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    context: { trpc, queryClient },
    defaultPendingComponent: () => <Loader />,
    defaultNotFoundComponent: () => <div>Not Found</div>,
    Wrap: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
          <HapticsProvider>
            {children}
            <GlobalErrorDialog />
          </HapticsProvider>
        </TRPCProvider>
      </QueryClientProvider>
    ),
  });
  return router;
};

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
