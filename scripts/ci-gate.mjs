// `npm run build` の前に自動で呼ばれる（package.json の prebuild）。
// Cloudflare Workers Builds（本番デプロイ）の中でだけ、型チェックと自動テストを先に実行し、
// 1 つでも失敗したらビルドを止める。＝テストが通らないコードは本番に出ない。
// 手元の `npm run build` / `npm run deploy` では何もしない（速さ優先。必要なら `npm run check`）。
import { spawnSync } from "node:child_process";

if (!process.env.WORKERS_CI) process.exit(0);

for (const script of ["typecheck", "test"]) {
  console.log(`\n▶ npm run ${script}`);
  const r = spawnSync("npm", ["run", script], { stdio: "inherit" });
  if (r.status !== 0) {
    console.error(`\n✘ ${script} に失敗したため、デプロイを中止します。`);
    process.exit(r.status ?? 1);
  }
}
