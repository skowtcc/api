import { createMiddleware } from "@tanstack/react-start";

// runs server-side only - read from process.env directly
function getServerUrl(): string {
  return process.env.SERVER_URL || process.env.VITE_SERVER_URL || "https://den.skowt.cc";
}

export const authMiddleware = createMiddleware().server(async ({ next, request }) => {
  const cookie = request.headers.get("cookie");

  if (!cookie) {
    return next({ context: { session: null } });
  }

  try {
    const response = await fetch(`${getServerUrl()}/api/auth/get-session`, {
      headers: { cookie },
    });

    if (!response.ok) {
      return next({ context: { session: null } });
    }

    const session = await response.json();
    return next({ context: { session: session || null } });
  } catch {
    return next({ context: { session: null } });
  }
});
