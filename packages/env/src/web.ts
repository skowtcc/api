import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

const webClientSchema = {
  VITE_SERVER_URL: z
    .string()
    .url("VITE_SERVER_URL must be a valid URL")
    .default("https://den.skowt.cc"),
} as const;

export type WebRuntimeEnv = Record<string, string | undefined>;

export function validateWebEnv(runtimeEnv: WebRuntimeEnv) {
  return createEnv({
    clientPrefix: "VITE_",
    client: webClientSchema,
    runtimeEnv,
    emptyStringAsUndefined: true,
  });
}
