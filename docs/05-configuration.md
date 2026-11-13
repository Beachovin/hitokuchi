# 5. 設定一覧

設定は 6 か所にあります。どこで何を決めているかを、変更方法と一緒にまとめます。

| 場所 | 何を決めるか | 変更方法 |
|---|---|---|
| 5.1 `wrangler.jsonc` | Cloudflare のリソースと定期実行 | ファイルを編集してプッシュ |
| 5.2 環境変数（`wrangler.jsonc` の `vars`） | 公開してよい設定値 | ファイルを編集してプッシュ |
| 5.3 シークレット | API キーなどの秘密情報 | `npx wrangler secret put <名前> --name hitokuchi` |
| 5.4 管理画面の設定 | 運用中に切り替える項目 | `/admin/settings` |
| 5.5 収集元 | どのページから集めるか | `/admin/sources`（有効／停止）、追加はマイグレーション |
| 5.6 コード内の定数 | 上限値やしきい値 | コードを編集してプッシュ |
| 5.7 外部サービス側 | Google、Cloudflare、GitHub など | 各サービスの管理画面 |

## 5.1 wrangler.jsonc（Cloudflare のリソース）

| 項目 | 値 | 意味 |
|---|---|---|
| `name` | `hitokuchi` | Worker の名前。URL は `hitokuchi.<アカウント>.workers.dev` |
| `main` | `./workers/app.ts` | 入口 |
| `compatibility_date` | `2026-11-01` | ランタイムの挙動を固定する日付 |
| `compatibility_flags` | `nodejs_compat` | Node.js 互換 API を使う（Anthropic SDK 用） |
| `observability.enabled` | `true` | ログをダッシュボードで見られるようにする |
| `d1_databases` | binding `DB` / `hitokuchi-db` / `migrations_dir: db/migrations` | データベース |
| `r2_buckets` | binding `IMAGES` / `hitokuchi-images` | 画像の保存先 |
| `workflows` | binding `SCRAPE_WORKFLOW` / `scrape-workflow` / class `ScrapeWorkflow` | 収集パイプライン |
| `triggers.crons` | `0 21 * * *`, `0 23 * * SUN` | 毎日 6:00 と月曜 8:00（日本時間）。曜日は数字ではなく `SUN` と書く（数字の `0` は Cloudflare に拒否される） |

## 5.2 環境変数（vars）

| 名前 | 現在の値 | 意味 |
|---|---|---|
| `ADMIN_HOST` | 空 | 指定すると、そのドメイン以外の `/admin` は 404 になる（例：`admin.example.com`） |
| `ADMIN_REQUIRE_ACCESS` | 空 | `true` にすると、Cloudflare Access の認証メールとログイン中のメールの一致も必須にする |
| `ADMIN_SESSION_HOURS` | `12` | 管理操作ができるのはログインから何時間以内か |
| `ADMIN_DEV_BYPASS` | 空（本番は必ず空） | ローカルでだけ `.dev.vars` で `true` にし、開発用ログインを有効にする |
| `GOOGLE_CLIENT_ID` | OAuth クライアント ID | Google ログイン用 |
| `DIGEST_FROM` | 空 | ダイジェストメールの送信元（Resend で認証したドメインのアドレス） |
| `SITE_ORIGIN` | `https://hitokuchi.ak-lumina-inc.workers.dev` | メール内リンクの基準 URL。独自ドメインにしたら変更する |

## 5.3 シークレット

リポジトリには置きません。本番は `wrangler secret put`、ローカルは `.dev.vars`（Git の管理外）に書きます。

| 名前 | 必須 | 用途 | 本番の状態 |
|---|---|---|---|
| `ADMIN_EMAILS` | 必須 | オーナーの Google メールアドレス。ここに書いたメールでログインすると自動で管理者になる。カンマ区切りで複数指定可。リポジトリを公開しているので、メールアドレスを設定ファイルに書かずシークレットにしている | 登録済み |
| `GOOGLE_CLIENT_SECRET` | 必須 | Google ログイン | 登録済み |
| `ANTHROPIC_API_KEY` | 任意 | Claude 整形、口コミの AI 要約。無ければルール整形のみ・要約なしで動く | 未登録 |
| `RESEND_API_KEY` | 任意 | ダイジェストメール。無ければ送信しない | 未登録 |

## 5.4 管理画面の設定（D1 の `settings` テーブル）

| キー | 画面上の名前 | 初期値 | 意味 |
|---|---|---|---|
| `use_claude` | Claude で仕上げ整形する | オフ | ルール整形のあとに Claude で商品名・カテゴリ・食品判定を仕上げる |
| `claude_model` | 使用するモデル | `claude-haiku-5-5` | 整形と要約に使うモデル |
| `auto_publish` | 承認せずにそのまま公開する | オフ | 収集結果をすぐ公開する。重複の可能性があるものは除外 |
| `max_items_per_source` | 1 サイトあたりの最大取り込み件数 | 80 | 1〜200 |
| `ai_summary_enabled` | 口コミの AI 要約 | オン | 口コミが 5 件以上の商品に要約を出す（API キーが必要） |
| `digest_enabled` | 週 1 回のダイジェストメール | オフ | 月曜 8:00 に配信 |
| `ads_enabled` | 広告を表示する | オフ | AdSense の広告枠を出す。確認用コードと ads.txt は、このスイッチに関係なくクライアント ID があれば入る（審査用） |
| `adsense_client` | AdSense クライアント ID | 空 | `ca-pub-…`。`/ads.txt` にも使う |
| `adsense_slot` | 広告スロット ID | 空 | 数字 |
| `amazon_tag` | Amazon アソシエイトのタグ | 空 | 例：`xxxx-22` |
| `rakuten_affiliate_id` | 楽天アフィリエイト ID | 空 | — |
| `rakuten_ads_enabled` | 楽天の画像広告を表示する | オフ | 広告枠に楽天のバナー・モーションウィジェットを出す（AdSense が出ている枠では AdSense を優先） |
| `rakuten_ad_sp` / `rakuten_ad_pc` | 楽天の広告コード（スマホ用・PC 用） | 空 | 楽天アフィリエイトで作ったコード。楽天以外のサイトを読み込むコードは保存できない |
| `operator_name` | 運営者名 | 空 | 利用規約・プライバシーポリシーに表示 |
| `operator_contact` | お問い合わせ先 | 空 | メールアドレス、または `https://` のフォーム URL |
| `maintenance_last` | （自動） | — | 毎朝の後片付けの結果（JSON）。ダッシュボードに表示 |
| `image_sweep_cursor` | （自動） | — | 未使用画像の確認がどこまで進んだか |

## 5.5 収集元

| 名前 | アダプター | URL |
|---|---|---|
| セブン-イレブン 今週の新商品 | `seven` | `https://www.sej.co.jp/products/a/thisweek/` |
| セブン-イレブン 来週の新商品 | `seven` | `https://www.sej.co.jp/products/a/nextweek/` |
| ファミリーマート 今週の新商品 | `familymart` | `https://www.family.co.jp/goods/newgoods.html` |
| ファミリーマート 来週の新商品 | `familymart` | `https://www.family.co.jp/goods/newgoods/nextweek.html` |
| ローソン 新商品 | `lawson` | `https://www.lawson.co.jp/recommend/new/` |
| ミニストップ 今週のおすすめ | `ministop` | `https://www.ministop.co.jp/syohin/js/recommend.json` |
| デイリーヤマザキ 新商品 | `dailyyamazaki` | `https://www.daily-yamazaki.jp/new/` |

カテゴリ（9）：スイーツ、スナック、チョコレート、パン、おにぎり・弁当、ドリンク、アイス、カップ麺・麺類、お惣菜。

## 5.6 コード内の定数

| 定数 | 値 | 場所 | 意味 |
|---|---|---|---|
| `PRODUCT_RETENTION_DAYS` | 30 | `app/lib/retention.server.ts` | 発売から何日で商品を削除するか |
| `STALE_DAYS` | 30 | `workers/scrape-workflow.ts` | これより前に発売の商品は取り込まない（上と揃える） |
| `SWEEP_PAGES_PER_RUN` | 5 | `retention.server.ts` | 未使用画像を 1 回で確認する量（1 ページ 1,000 個） |
| `SWEEP_MIN_AGE_MS` | 24 時間 | `retention.server.ts` | アップロード直後の画像を消さない猶予 |
| 通知・監査ログ・収集ログの保存期間 | 90 日・365 日・90 日 | `retention.server.ts` | — |
| `DUPLICATE_THRESHOLD` | 0.85 | `workers/scrape/normalize.ts` | 自動公開で重複とみなす名前の似ている度合い |
| `DETAIL_LIMIT_PER_SOURCE` | 60 | `scrape-workflow.ts` | 1 回の収集で詳細ページを取得する上限 |
| `CLAUDE_BATCH` | 30 | `scrape-workflow.ts` | Claude に 1 回で渡す件数 |
| `AVATAR_PX` / `AVATAR_TARGET_BYTES` / `AVATAR_STORE_MAX_BYTES` | 240px / 20KB / 100KB | `app/lib/profile.ts` | プロフィール画像の大きさ・圧縮の目標・保存の上限 |
| `REVIEW_IMAGE_PX` / `REVIEW_IMAGE_TARGET_BYTES` / `REVIEW_IMAGE_STORE_MAX_BYTES` | 1280px / 200KB / 600KB | `app/lib/image.ts` | 口コミ写真の同上 |
| `REVIEWS_PER_DAY` | 30 | `app/routes/site/product.tsx` | 1 人が 1 日に投稿できる口コミ数 |
| `SESSION_DAYS` | 30 | `app/lib/auth.server.ts` | ログインの有効期間 |
| `SUMMARY_MIN_REVIEWS` / `RESUMMARIZE_EVERY` | 5 / 3 | `app/lib/summary.server.ts` | 要約を作る最小の口コミ数／何件増えたら作り直すか |
| `TIERS` | 0 / 10 / 30 / 80 / 200 | `app/lib/reviewer-tier.ts` | ランクの必要ポイント |
| `NG_WORDS` | 6 語 | `app/lib/moderation.ts` | 口コミを要確認にする語 |
| `AFFILIATE_CATEGORIES` | snack, chocolate, drink, noodle | `app/lib/monetize.ts` | 通販リンクを出すカテゴリ |
| `USER_AGENT` | `HitokuchiBot/1.0 …` | `workers/scrape/fetch.ts` | 収集時に名乗る名前 |
| `KILL_SWITCH` | `false` | `public/sw.js` | `true` にすると Service Worker を全利用者で解除 |

## 5.7 外部サービス側の設定

| サービス | 設定 | 現在の状態 |
|---|---|---|
| Google Cloud Console | OAuth クライアント（ウェブアプリケーション）。リダイレクト URI に `https://hitokuchi.ak-lumina-inc.workers.dev/auth/google/callback` と `http://localhost:5173/auth/google/callback` | 作成済み。同意画面が「テスト」のままだと登録したテストユーザーしかログインできないので、公開前に「本番環境」へ切り替える |
| Cloudflare D1 | `hitokuchi-db`。マイグレーションはデプロイ時に自動適用 | 0013 まで適用済み |
| Cloudflare R2 | `hitokuchi-images` | 作成済み |
| Cloudflare Workers Builds | リポジトリ `Beachovin/hitokuchi`、ブランチ `main`。Build command `npm run build`、Deploy command `npx wrangler d1 migrations apply hitokuchi-db --remote && npx wrangler deploy`、main 以外は `npx wrangler versions upload` | 接続済み |
| GitHub | 非公開リポジトリ。GitHub Actions で CI | 設定済み |
| 独自ドメイン | Workers の Custom Domain。設定したら `SITE_ORIGIN` と Google のリダイレクト URI を変更する | 未設定 |
| Cloudflare Access（任意） | `/admin*` に Access のポリシーを付け、`ADMIN_REQUIRE_ACCESS=true` にする | 未設定 |
| Resend（任意） | 送信ドメインの認証、API キー | 未設定 |
| Google AdSense（任意） | サイトの登録と審査 | 未申請 |
| Amazon アソシエイト・楽天アフィリエイト（任意） | 登録して ID を管理画面に入力 | 未登録 |

## 5.8 ローカル開発用のファイル

| ファイル | 内容 | Git 管理 |
|---|---|---|
| `.dev.vars` | ローカル用のシークレットと `ADMIN_DEV_BYPASS=true` | 対象外 |
| `.dev.vars.example` | 上のひな形。型チェックがシークレットの名前を知るためにも使う | 対象 |
| `.wrangler/` | ローカルの D1・R2 のデータ | 対象外 |
| `worker-configuration.d.ts` | `wrangler types` が作る型定義 | 対象外（自動生成） |
| `db/demo/` | デモデータの生成スクリプト（`npm run demo:add:local` / `demo:remove:local`） | スクリプトのみ対象 |
