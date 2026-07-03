import { validateWebEnv } from "@skowt-monorepo/env/web";

const DEFAULT_SERVER_URL = "https://den.skowt.cc";

function getProcessEnvVar(name: string): string | undefined {
  const processEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env;
  return processEnv?.[name];
}

function normalizeUrl(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    const url = new URL(trimmed);
    return url.toString().replace(/\/$/, "");
  } catch {
    return undefined;
  }
}

function resolveServerUrl(): string {
  const runtimeEnv = import.meta.env as Record<string, string | undefined>;
  const candidates = [
    runtimeEnv.VITE_SERVER_URL,
    getProcessEnvVar("VITE_SERVER_URL"),
    getProcessEnvVar("SERVER_URL"),
    DEFAULT_SERVER_URL,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeUrl(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return DEFAULT_SERVER_URL;
}

const env = validateWebEnv({
  VITE_SERVER_URL: resolveServerUrl(),
});

export const WEB_SERVER_URL = env.VITE_SERVER_URL;
