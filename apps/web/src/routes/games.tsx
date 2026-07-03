import { createFileRoute, redirect } from "@tanstack/react-router";

/* bare /games has no content of its own - the game landing pages live at
   /games/$slug. send strays (typed URLs, trimmed links) to the browse page */
export const Route = createFileRoute("/games")({
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
});
