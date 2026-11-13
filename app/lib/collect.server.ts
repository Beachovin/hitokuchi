// 収集ワークフローの開始。無料プランでは 1 回の実行で外部へのリクエストが 50 件までなので、
// 収集元ごとに別の実行に分け、同じサイトへ同時にアクセスしないよう開始を 2 分ずつずらす。

const STAGGER_MINUTES = 2;

export async function startCollection(env: Env, trigger: "cron" | "manual") {
  const { results } = await env.DB.prepare("SELECT id FROM scrape_sources WHERE enabled = 1 AND adapter IS NOT NULL ORDER BY id").all<{ id: number }>();
  const ids: string[] = [];
  for (const [i, s] of results.entries()) {
    const inst = await env.SCRAPE_WORKFLOW.create({ params: { trigger, sourceId: s.id, startAfterMinutes: i * STAGGER_MINUTES } });
    ids.push(inst.id);
  }
  return { started: ids.length, ids, finishesAfterMinutes: results.length * STAGGER_MINUTES };
}

/** 説明が未取得の商品について、各社の詳細ページから説明を補う（1 回 40 件まで） */
export async function startBackfill(env: Env, trigger: "cron" | "manual", startAfterMinutes = 0) {
  const inst = await env.SCRAPE_WORKFLOW.create({ params: { trigger, mode: "backfill-details", startAfterMinutes } });
  return inst.id;
}
