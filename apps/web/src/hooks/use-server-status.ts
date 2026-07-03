import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/utils/trpc";
import { useAuth } from "@/hooks/use-auth";

const DISCORD_INVITE_URL = "https://discord.gg/noid";

export function useServerStatus() {
  const { isAuthenticated } = useAuth();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    ...trpc.downloads.serverStatus.queryOptions(),
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const refreshMutation = useMutation({
    ...trpc.downloads.refreshServerStatus.mutationOptions(),
    onSuccess: (result) => {
      queryClient.setQueryData(trpc.downloads.serverStatus.queryKey(), {
        inServer: result.inServer,
      });
    },
  });

  return {
    inServer: data?.inServer ?? false,
    isLoading,
    isAuthenticated,
    canDownload: isAuthenticated && (data?.inServer ?? false),
    discordInviteUrl: DISCORD_INVITE_URL,
    refresh: refreshMutation.mutateAsync,
    isRefreshing: refreshMutation.isPending,
  };
}
