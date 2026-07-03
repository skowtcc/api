import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { AssetBrowser, AssetBrowserSkeleton } from "@/components/assets/asset-browser";
import { GoBack } from "@/components/ui/go-back";
import { PageHeader } from "@/components/ui/page-header";
import { getUser } from "@/functions/get-user";
import { cdnAssetUrl } from "@/lib/api-transforms";
import { validateAssetSearch } from "@/lib/asset-search";

// shown when you have no saved assets yet
const NO_SAVED_IMAGE = cdnAssetUrl("0198390e-6bff-775b-8027-bb8f7f0345e4");

export const Route = createFileRoute("/saved")({
  component: SavedComponent,
  pendingComponent: SavedPendingComponent,
  validateSearch: validateAssetSearch,
  beforeLoad: async () => {
    const session = await getUser();
    if (!session?.user) throw redirect({ to: "/" });
    return { session };
  },
  head: () => ({
    meta: [
      { title: "Saved Assets - skowt.cc" },
      {
        name: "description",
        content: "View and download your saved assets from skowt.cc.",
      },
      { name: "og:title", content: "Saved Assets - skowt.cc" },
      {
        name: "og:description",
        content: "View and download your saved assets from skowt.cc.",
      },
    ],
  }),
});

function SavedHeader() {
  return (
    <>
      <GoBack className="mb-6" />
      <PageHeader
        title="Saved assets"
        description="View and download your saved assets."
        className="mb-8"
      />
    </>
  );
}

function SavedPendingComponent() {
  return <AssetBrowserSkeleton header={<SavedHeader />} />;
}

function SavedComponent() {
  const navigate = useNavigate();

  return (
    <AssetBrowser
      mode="bookmarks"
      header={<SavedHeader />}
      emptyMessage="No saved assets yet"
      emptyImage={NO_SAVED_IMAGE}
      emptyAction={{
        label: "Browse assets",
        onClick: () => navigate({ to: "/" }),
      }}
    />
  );
}
