/* browser entry point for @skowt-monorepo/observability. not yet implemented. the browser sink
   (a fetch-based POST to /__telemetry, a React error-boundary hook, a Web Vitals collector) is
   future work. the file exists so the package.json exports map resolves, and so any accidental
   import from apps/web fails loudly rather than silently */

throw new Error(
  "@skowt-monorepo/observability/browser is not yet implemented. " +
    "Do not import it from apps/web.",
);

export {};
