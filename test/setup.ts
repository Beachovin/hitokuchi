import { applyD1Migrations, env } from "cloudflare:test";

// 本番と同じマイグレーション（db/migrations）をテスト用 DB に適用する
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
