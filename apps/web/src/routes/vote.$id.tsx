import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/vote/$id")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/request/$id", params: { id: params.id } });
  },
});
