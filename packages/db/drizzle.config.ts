import { defineConfig } from "drizzle-kit";
import dotenv from "dotenv";
import { existsSync } from "fs";

const envPath = existsSync("../../apps/server/.env.development")
  ? "../../apps/server/.env.development"
  : "../../apps/server/.env";

dotenv.config({ path: envPath });

export default defineConfig({
  schema: "./src/schema",
  out: "./src/migrations",
  dialect: "turso",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
    authToken: process.env.DATABASE_AUTH_TOKEN,
  },
});
