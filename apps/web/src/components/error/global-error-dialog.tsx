import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogBody,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useServerStatus } from "@/hooks/use-server-status";
import { useErrorDialogStore, type ErrorType } from "@/stores/error-dialog-store";

const ERROR_CONFIG: Record<
  ErrorType,
  {
    title: string;
    description: string;
    showDiscordButton: boolean;
    showRetryButton: boolean;
    footerText?: string;
  }
> = {
  discord: {
    title: "Join our Discord",
    description: "You need to be a member of our Discord server to download and save assets.",
    showDiscordButton: true,
    showRetryButton: true,
    footerText:
      'After joining, click "I\'ve joined" to verify. It can take up to 5 minutes to update due to caching.',
  },
  rate_limit: {
    title: "Slow down",
    description: "You're being rate limited. Please wait a moment before trying again.",
    showDiscordButton: false,
    showRetryButton: false,
  },
};

export function GlobalErrorDialog() {
  const { isOpen, errorType, close } = useErrorDialogStore();
  const { discordInviteUrl, refresh, isRefreshing } = useServerStatus();
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const config = errorType ? ERROR_CONFIG[errorType] : null;

  useEffect(() => {
    if (cooldown <= 0) return;

    const timer = setInterval(() => {
      setCooldown((c) => Math.max(0, c - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [cooldown]);

  useEffect(() => {
    if (isOpen) {
      setCooldown(0);
      setError(null);
    }
  }, [isOpen]);

  const handleCheckMembership = useCallback(async () => {
    if (cooldown > 0 || isRefreshing) return;

    setError(null);
    try {
      const result = await refresh();

      if (result.inServer) {
        close();
      } else {
        setError("Not found in server yet");
        setCooldown(15);
      }
    } catch {
      setError("Failed to check. Try again.");
      setCooldown(15);
    }
  }, [cooldown, isRefreshing, refresh, close]);

  const isDisabled = cooldown > 0 || isRefreshing;

  if (!config) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-display">{config.title}</DialogTitle>
          <DialogDescription>{config.description}</DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {config.showDiscordButton && (
            <Button asChild className="w-full h-10">
              <a href={discordInviteUrl} target="_blank" rel="noopener noreferrer">
                Join Discord Server
              </a>
            </Button>
          )}

          {config.showRetryButton && (
            <Button
              variant="outline"
              onClick={handleCheckMembership}
              disabled={isDisabled}
              className="w-full h-10"
            >
              {isRefreshing
                ? "Checking..."
                : cooldown > 0
                  ? `Try again in ${cooldown}s`
                  : "I've joined"}
            </Button>
          )}

          {error && <p className="text-xs text-destructive text-center">{error}</p>}

          {config.footerText && (
            <>
              <div className="h-px bg-border/40" />
              <p className="text-xs text-muted-foreground/60 text-center leading-relaxed">
                {config.footerText}
              </p>
            </>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
