import { createFileRoute, Outlet, useMatches } from "@tanstack/react-router";
import { AssetBrowser } from "@/components/assets/asset-browser";
import type { PinnedBrowse } from "@/hooks/use-server-assets";

/**
 * pathless layout: "/", "/games/$slug" and "/games/$slug/$category" share ONE
 * AssetBrowser instance. children render only their hero (through the header
 * slot via Outlet) and may expose `pinned` in loader data. because the
 * browser never unmounts across these routes, a pin-breaking filter change
 * swaps the URL and hero while the open popover, grid and scroll position
 * survive the transition
 */
export const Route = createFileRoute("/_browse")({
  component: BrowseLayout,
});

function BrowseLayout() {
  const matches = useMatches();
  const pinned = matches.reduce<PinnedBrowse | undefined>(
    (found, m) => (m.loaderData as { pinned?: PinnedBrowse } | undefined)?.pinned ?? found,
    undefined,
  );

  return <AssetBrowser mode="assets" pinned={pinned} header={<Outlet />} />;
}
