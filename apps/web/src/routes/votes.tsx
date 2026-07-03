import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/votes")({
  beforeLoad: () => {
    throw redirect({ to: "/requests" });
  },
});
