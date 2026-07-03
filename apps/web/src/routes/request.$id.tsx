import { createFileRoute } from "@tanstack/react-router";
import { RequestDetail, RequestDetailSkeleton } from "@/components/requests/request-detail";

export const Route = createFileRoute("/request/$id")({
  component: RouteComponent,
  pendingComponent: RequestDetailSkeleton,
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(
      context.trpc.request.getById.queryOptions({ id: params.id }),
    );
    const cached = context.queryClient.getQueryData<{ title: string; description: string | null }>(
      context.trpc.request.getById.queryKey({ id: params.id }),
    );
    return { title: cached?.title ?? null, description: cached?.description ?? null };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData?.title ? `${loaderData.title} - skowt.cc` : "Request - skowt.cc" },
      { name: "description", content: loaderData?.description ?? "View request on skowt.cc" },
      {
        property: "og:title",
        content: loaderData?.title ? `${loaderData.title} - skowt.cc` : "Request - skowt.cc",
      },
      {
        property: "og:description",
        content: loaderData?.description ?? "View request on skowt.cc",
      },
    ],
  }),
});

function RouteComponent() {
  const { id } = Route.useParams();
  return <RequestDetail id={id} />;
}
