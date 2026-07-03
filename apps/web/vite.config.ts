import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";

export default defineConfig({
  // bind the dev server to localhost only - never expose it on an untrusted LAN
  server: { host: "127.0.0.1" },
  plugins: [tsconfigPaths(), tailwindcss(), tanstackStart(), nitro({ preset: "bun" }), viteReact()],
});
