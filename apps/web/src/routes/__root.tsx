import { useEffect } from "react";
import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from "@tanstack/react-router";
import { Sidebar } from "../components/navigation/sidebar";
import { MobileNav } from "../components/navigation/mobile-nav";
import { NotFound } from "../components/error/not-found";
import { ErrorBoundary } from "../components/error/error-boundary";
import { FloatingActions } from "../components/floating-actions";
import { Footer } from "../components/footer/footer";
import { Toaster } from "sonner";
import appCss from "../index.css?url";
import type { QueryClient } from "@tanstack/react-query";

import type { TRPCOptionsProxy } from "@trpc/tanstack-react-query";
import type { AppRouter } from "@skowt-monorepo/api/routers/index";
export interface RouterAppContext {
  trpc: TRPCOptionsProxy<AppRouter>;
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover",
      },
      {
        title: "skowt.cc",
      },
      {
        name: "description",
        content: "Comprehensive game asset database that's community-driven and free for everyone.",
      },
      { name: "theme-color", content: "#09090b" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      {
        name: "apple-mobile-web-app-status-bar-style",
        content: "black-translucent",
      },
      { name: "apple-mobile-web-app-title", content: "skowt" },
      { name: "mobile-web-app-capable", content: "yes" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      {
        rel: "icon",
        href: "/favicon.ico",
      },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
    ],
  }),

  component: RootDocument,
  notFoundComponent: NotFound,
  errorComponent: ({ error, reset }) => <ErrorBoundary error={error} reset={reset} />,
});

function useRegisterSW() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
}

function RootDocument() {
  useRegisterSW();
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body className="min-h-svh">
        <div className="relative">
          <Sidebar className="hidden md:flex" />

          <div className="md:ml-[calc(var(--sidebar-width)-12px)] flex flex-col min-h-svh">
            <main className="flex-1 py-6 pb-20 md:pb-6">
              <Outlet />
            </main>
            <Footer />
          </div>

          <MobileNav />
          <FloatingActions />
        </div>
        {/* the query/mutation caches in router.tsx toast errors; without a
            mounted Toaster those calls render nothing */}
        <Toaster theme="dark" position="bottom-right" />
        <Scripts />
      </body>
    </html>
  );
}
