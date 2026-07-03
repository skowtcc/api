import { createServerFn } from "@tanstack/react-start";

import { authMiddleware } from "@/middleware/auth";

export const getUser = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const session = context.session;
    if (!session?.user) return null;

    /* return only the fields the route gates + UI actually use. critically NOT
       session.token / ipAddress / userAgent: TanStack dehydrates a route's
       beforeLoad return into the client HTML, so returning the full session here
       would leak the session token into client-readable markup and defeat the
       httpOnly cookie. the four gated routes only read user.id / user.role */
    return {
      user: {
        id: session.user.id,
        name: session.user.name,
        image: session.user.image,
        role: session.user.role,
      },
    };
  });
