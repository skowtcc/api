import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";

export function useAuth() {
  const { data: session, isPending } = authClient.useSession();

  const signIn = async () => {
    const { error } = await authClient.signIn.social({
      provider: "discord",
      callbackURL: `${window.location.origin}${window.location.pathname}`,
    });
    /* surfaces any auth misconfig instead of a silently dead button - in
       particular a dev server running without Discord OAuth creds */
    if (error) {
      toast.error("Sign-in is unavailable: Discord OAuth is not configured on this server.");
    }
  };

  const signOut = async () => {
    await authClient.signOut();
  };

  return {
    user: session?.user ?? null,
    session: session?.session ?? null,
    isAuthenticated: !!session?.user,
    isLoading: isPending,
    signIn,
    signOut,
  };
}
