import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// テストは本番と同じ Workers ランタイム（workerd）の中で動く。
// D1・R2 はテストごとに独立したローカルのものが用意され、本番のデータには一切触れない。
export default defineConfig(async () => {
  const migrations = await readD1Migrations(fileURLToPath(new URL("./db/migrations", import.meta.url)));
  return {
    plugins: [
      cloudflareTest({
        miniflare: {
          compatibilityDate: "2026-11-01",
          compatibilityFlags: ["nodejs_compat"],
          d1Databases: ["DB"],
          r2Buckets: ["IMAGES"],
          bindings: {
            TEST_MIGRATIONS: migrations,
            ADMIN_EMAILS: "owner@example.test",
            ADMIN_HOST: "",
            ADMIN_REQUIRE_ACCESS: "",
            ADMIN_SESSION_HOURS: "12",
            ADMIN_DEV_BYPASS: "",
            GOOGLE_CLIENT_ID: "",
            SITE_ORIGIN: "https://hitokuchi.example.test",
            DIGEST_FROM: "",
          },
        },
      }),
    ],
    resolve: { alias: { "~": fileURLToPath(new URL("./app", import.meta.url)) } },
    test: {
      include: ["test/**/*.test.ts"],
      setupFiles: ["./test/setup.ts"],
    },
  };
});
