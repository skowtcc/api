import { TRPCError } from "@trpc/server";

export function notFound(resource: string): never {
  throw new TRPCError({ code: "NOT_FOUND", message: `${resource} not found` });
}

export function forbidden(message: string): never {
  throw new TRPCError({ code: "FORBIDDEN", message });
}

export function badRequest(message: string): never {
  throw new TRPCError({ code: "BAD_REQUEST", message });
}
