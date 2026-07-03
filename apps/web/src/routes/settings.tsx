import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { GoBack } from "@/components/ui/go-back";
import { PageHeader } from "@/components/ui/page-header";
import { SettingRow, SettingSection } from "@/components/ui/setting-row";
import { Switch, SwitchWrapper } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/hooks/use-settings";
import { useSelectionStore } from "@/stores/selection-store";
import { useAuth } from "@/hooks/use-auth";
import { useTRPC } from "@/utils/trpc";
import { formatDataExport, type ExportData } from "@/lib/format-data-export";
import { useHaptics } from "@/components/providers/haptics-provider";
import { HAPTIC } from "@/lib/haptics";
import { IconTrash, IconArrowDoorOut, IconDownload, IconClipboard } from "nucleo-micro-bold";
import { usePWA } from "@/hooks/use-pwa";
import { getDebugId } from "@/lib/debug-id";

export const Route = createFileRoute("/settings")({
  component: SettingsComponent,
  head: () => ({
    meta: [
      { title: "Settings - skowt.cc" },
      { name: "description", content: "Change all client-side settings on skowt." },
      { name: "og:title", content: "Settings - skowt.cc" },
      { name: "og:description", content: "Change all client-side settings on skowt." },
    ],
  }),
});

function SettingsComponent() {
  const { settings, toggleSetting } = useSettings();
  const { clearSelection } = useSelectionStore();
  const { isAuthenticated, signOut } = useAuth();
  const { triggerHaptic } = useHaptics();
  const queryClient = useQueryClient();
  const trpc = useTRPC();
  const [isClearing, setIsClearing] = useState(false);
  const [isClearingCookies, setIsClearingCookies] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportRetryAfter, setExportRetryAfter] = useState<number | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const { canInstall, isInstalled, showIOSInstall, promptInstall } = usePWA();

  const handleClearCache = async () => {
    setIsClearing(true);

    clearSelection();
    queryClient.clear();
    localStorage.removeItem("skowt-selection");

    await new Promise((r) => setTimeout(r, 300));
    setIsClearing(false);
    triggerHaptic(HAPTIC.SUCCESS);
  };

  const handleClearCookies = async () => {
    setIsClearingCookies(true);

    const cookies = document.cookie.split(";");
    for (const cookie of cookies) {
      const name = cookie.split("=")[0].trim();
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=.skowt.cc`;
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=skowt.cc`;
    }

    await new Promise((r) => setTimeout(r, 300));
    setIsClearingCookies(false);
    triggerHaptic(HAPTIC.SUCCESS);
  };

  const handleExportData = async () => {
    setIsExporting(true);
    setExportRetryAfter(null);
    try {
      await queryClient.invalidateQueries({ queryKey: trpc.user.exportData.queryKey() });
      const data = (await queryClient.fetchQuery({
        ...trpc.user.exportData.queryOptions(),
        staleTime: 0,
      })) as ExportData;
      const txt = formatDataExport(data);

      const blob = new Blob([txt], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `skowt-data-export-${new Date().toISOString().split("T")[0]}.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      triggerHaptic(HAPTIC.SUCCESS);
    } catch (error) {
      const trpcError = error as { data?: { code?: string }; message?: string };
      if (trpcError.data?.code === "TOO_MANY_REQUESTS") {
        const match = trpcError.message?.match(/in (\d+) seconds/);
        const retryAfter = match ? parseInt(match[1], 10) : 3600;
        setExportRetryAfter(retryAfter);
      } else {
        console.error("Export failed:", error);
      }
      triggerHaptic(HAPTIC.ERROR);
    } finally {
      setIsExporting(false);
    }
  };

  const formatRetryTime = (seconds: number): string => {
    if (seconds < 60) return `${seconds} seconds`;
    const minutes = Math.ceil(seconds / 60);
    return `${minutes} minute${minutes > 1 ? "s" : ""}`;
  };

  const handleCopyDebugInfo = async () => {
    /* debug ID goes first: it's the single most useful field for support since
    it lets them search Better Stack for every log + trace from this browser */
    const debugId = getDebugId();
    const debugInfo = [
      `NOTE: The below info contains identifying information, be careful who you share it with.`,
      debugId ? `Debug ID: ${debugId}` : `Debug ID: (unavailable, localStorage blocked)`,
      `User Agent: ${navigator.userAgent}`,
      `Platform: ${navigator.platform}`,
      `Language: ${navigator.language}`,
      `Screen Resolution: ${window.screen.width}x${window.screen.height}`,
      `Device Pixel Ratio: ${window.devicePixelRatio}`,
      `Viewport Size: ${window.innerWidth}x${window.innerHeight}`,
      `Color Depth: ${window.screen.colorDepth}`,
      `Online: ${navigator.onLine}`,
      `Cookies Enabled: ${navigator.cookieEnabled}`,
      `Timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`,
      `Timestamp: ${new Date().toISOString()}`,
    ].join("\n");

    try {
      await navigator.clipboard.writeText(debugInfo);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
      triggerHaptic(HAPTIC.SUCCESS);
    } catch (error) {
      console.error("Failed to copy debug info:", error);
      triggerHaptic(HAPTIC.ERROR);
    }
  };

  return (
    <div className="page-container">
      <GoBack className="mb-8" />
      <PageHeader
        title="Settings"
        description="Change all client-side settings on skowt."
        className="mb-8"
      />

      <div className="flex flex-col md:flex-row gap-8">
        <div className="w-full md:w-1/2 space-y-8">
          <SettingSection title="Display">
            <SettingRow
              title="Show suggestive content"
              description="When disabled, potentially suggestive assets will be blurred."
            >
              <SwitchWrapper>
                <Switch
                  checked={settings.showSuggestiveContent}
                  onCheckedChange={() => {
                    toggleSetting("showSuggestiveContent");
                    triggerHaptic(HAPTIC.LIGHT_ACTION);
                  }}
                  size="sm"
                />
              </SwitchWrapper>
            </SettingRow>

            <SettingRow
              title="Use game abbreviations"
              description="Always show abbreviated game names (e.g. GI instead of Genshin Impact)."
            >
              <SwitchWrapper>
                <Switch
                  checked={settings.useGameAbbreviations}
                  onCheckedChange={() => {
                    toggleSetting("useGameAbbreviations");
                    triggerHaptic(HAPTIC.LIGHT_ACTION);
                  }}
                  size="sm"
                />
              </SwitchWrapper>
            </SettingRow>

            <SettingRow title="Haptic feedback" description="Vibrate on touch interactions.">
              <SwitchWrapper>
                <Switch
                  checked={settings.enableHaptics}
                  onCheckedChange={() => {
                    toggleSetting("enableHaptics");
                    triggerHaptic(HAPTIC.LIGHT_ACTION);
                  }}
                  size="sm"
                />
              </SwitchWrapper>
            </SettingRow>
          </SettingSection>

          <SettingSection title="App">
            <SettingRow
              title={isInstalled ? "App installed" : "Install skowt"}
              description={
                isInstalled
                  ? "skowt is installed on your device."
                  : showIOSInstall
                    ? 'Tap Share, then "Add to Home Screen" in Safari.'
                    : canInstall
                      ? "Add skowt to your home screen for an app-like experience."
                      : "Use your browser's install option to add skowt to your home screen."
              }
            >
              {canInstall && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    await promptInstall();
                    triggerHaptic(HAPTIC.SUCCESS);
                  }}
                  className="gap-2"
                  data-haptic="action"
                >
                  <IconDownload className="size-4" />
                  Install
                </Button>
              )}
            </SettingRow>
          </SettingSection>
        </div>

        <div className="w-full md:w-1/2 space-y-8">
          {isAuthenticated && (
            <SettingSection title="Account">
              <SettingRow
                title="Discord account"
                description="Profile changes on Discord will sync on next sign-in."
              >
                <Button variant="outline" size="sm" onClick={signOut} className="gap-2">
                  <IconArrowDoorOut className="size-4" />
                  Sign out
                </Button>
              </SettingRow>

              <SettingRow
                title="Download your data"
                description={
                  exportRetryAfter
                    ? `You can request your data again in ${formatRetryTime(exportRetryAfter)}.`
                    : "Export all your personal data as a text file. Available once per hour."
                }
              >
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportData}
                  disabled={isExporting || exportRetryAfter !== null}
                  className="gap-2"
                >
                  <IconDownload className="size-4" />
                  {isExporting ? "Exporting..." : "Download"}
                </Button>
              </SettingRow>
            </SettingSection>
          )}

          <SettingSection title="Debug">
            <SettingRow
              title="Clear cache"
              description="Remove cached queries and selection data. Your saved assets are not affected."
            >
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearCache}
                disabled={isClearing}
                className="gap-2"
              >
                <IconTrash className="size-4" />
                {isClearing ? "Clearing..." : "Clear"}
              </Button>
            </SettingRow>

            <SettingRow
              title="Clear cookies"
              description="Remove all browser cookies. You will need to sign in again."
            >
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearCookies}
                disabled={isClearingCookies}
                className="gap-2"
              >
                <IconTrash className="size-4" />
                {isClearingCookies ? "Clearing..." : "Clear"}
              </Button>
            </SettingRow>

            <SettingRow
              title="Copy debug info"
              description="Copy device information to clipboard to share for troubleshooting."
            >
              <Button variant="outline" size="sm" onClick={handleCopyDebugInfo} className="gap-2">
                <IconClipboard className="size-4" />
                {isCopied ? "Copied!" : "Copy"}
              </Button>
            </SettingRow>
          </SettingSection>
        </div>
      </div>
    </div>
  );
}
