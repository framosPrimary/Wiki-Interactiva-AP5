import { z } from "zod";

const provider = z.enum(["none", "openai", "openai-compatible", "gemini"]);

const schema = z.object({
  DATABASE_URL: z.string().min(1).default("postgres://ap5wiki:ap5wiki@localhost:5432/ap5wiki"),
  ARCHITECTURE_SOURCE_PATH: z.string().default("../Architecture"),
  CONTENT_ASSET_PATH: z.string().default("./data/content"),
  CONTENT_COMMIT_SHA: z.string().optional(),
  LOCAL_FILESYSTEM_MODE: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  SYNC_WEBHOOK_SECRET: z.string().min(8).default("change-me-local"),
  AI_PROVIDER: provider.default("none"),
  AI_CHAT_MODEL: z.string().optional(),
  AI_API_KEY: z.string().optional(),
  AI_BASE_URL: z.string().optional(),
  EMBEDDING_PROVIDER: provider.default("none"),
  EMBEDDING_MODEL: z.string().optional(),
  EMBEDDING_API_KEY: z.string().optional(),
  EMBEDDING_BASE_URL: z.string().optional(),
  EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(1536),
  CHAT_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(20),
  SEARCH_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(60),
});

export type AppConfig = z.infer<typeof schema>;
let cached: AppConfig | undefined;

export function config(): AppConfig {
  cached ??= schema.parse(process.env);
  return cached;
}

export function resetConfigForTests() {
  cached = undefined;
}
