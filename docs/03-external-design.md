# 3. 外部設計

## 3.1 画面一覧（お客様向け）

| URL | 画面 | ログイン | 内容 |
|---|---|---|---|
| `/` | ホーム | 不要 | チェーン別の今週の新商品、新着、評価の高い商品、バトル、特集、新着口コミ、おすすめ（会員） |
| `/products` | 商品一覧 | 不要 | 検索（`q`）、カテゴリ（`category`）、チェーン（`channel`）、並べ替え（`sort`）、もっと見る（`page`） |
| `/products/:id` | 商品詳細 | 不要 | 商品情報、AI 要約、口コミ一覧、口コミ投稿、ひとこと口コミ、気になる、食べた、通販リンク、シェア |
| `/weekly` | 週間まとめ一覧 | 不要 | 週の一覧 |
| `/weekly/:week` | 週間まとめ | 不要 | その週の新商品（チェーン別）、バトル（`#battles`） |
| `/features` | 特集一覧 | 不要 | 管理者が作った特集、地域限定リスト |
| `/features/:slug` | 特集 | 不要 | 管理者が作った特集（下書きは管理者が `?preview` で確認） |
| `/features/region/:slug` | 地域限定 | 不要 | エリア別の限定商品 |
| `/favorites` | 気になる | 必要 | 気になるに登録した商品 |
| `/post` | 口コミを書く | 必要 | 商品を選んで口コミを書く入口 |
| `/notifications` | 通知 | 必要 | 通知一覧 |
| `/mypage` | マイページ | 必要 | ランク、実績、自分の口コミ、プロフィール設定、ダイジェスト配信の希望、退会 |
| `/mypage/digest` | ダイジェストの見本 | 必要 | 自分宛てのメールの内容を確認 |
| `/login` | ログイン | 不要 | Google でログイン |
| `/terms` | 利用規約 | 不要 | 投稿ルール、禁止事項、免責 |
| `/privacy` | プライバシーポリシー | 不要 | 取得する情報、広告、外部送信、運営者情報 |

共通部品：ヘッダー（検索、気になる、通知、プロフィール）、スマホ用の下部タブバー（ホーム、さがす、＋書く、気になる、マイページ）、フッター。

## 3.2 画面一覧（管理者向け）

すべて管理者のみ。未ログイン・権限なしは `/admin/login` へ送る。

| URL | 画面 | できること |
|---|---|---|
| `/admin/login` | 管理者ログイン | Google でログイン |
| `/admin` | ダッシュボード | 件数、収集ログ、Claude 利用額の目安、後片付けの結果。収集・バトル作成・通知生成・AI 要約・後片付けを手動で実行 |
| `/admin/candidates` | 承認待ち | 候補の確認・手直し・承認・却下（一括も可） |
| `/admin/products` `/admin/products/:id` | 商品 | 検索、編集、非公開 |
| `/admin/reviews` | 口コミ | 要確認の口コミの公開・非公開 |
| `/admin/reports` | 通報 | 通報の確認、対応済み／問題なし、アカウント停止 |
| `/admin/users` | ユーザー | 一覧、停止・解除 |
| `/admin/sources` | 収集元・ログ | 収集元の有効／停止、個別実行、説明の補完、実行ログ、更新確認の状況 |
| `/admin/features` `/admin/features/:id` | 特集 | 作成、商品の追加・並べ替え、公開、削除 |
| `/admin/settings` | 設定 | [設定一覧 5.4](05-configuration.md#54-管理画面の設定d1-の-settings-テーブル) の項目 |
| `/admin/audit` | 監査ログ | 管理操作の履歴 |

## 3.3 フォームと API

画面の操作は、そのページへの `POST`（React Router の action）で受ける。`intent` でどの操作かを区別する。

| 送信先 | intent / 用途 | 主な入力 |
|---|---|---|
| `POST /products/:id` | （なし）口コミ投稿 | `rating`, `taste`, `volume`, `value`, `title`, `body`, `image`, `quick` |
| `POST /products/:id` | `vote` | `reviewId`, `value`（1 / -1） |
| `POST /products/:id` | `report` | `reviewId`, `reason`, `detail` |
| `POST /api/bookmark` | 気になるの登録・解除 | `productId`, `on` |
| `POST /api/eaten` | 食べたの記録・解除 | `productId`, `on` |
| `POST /api/battle` | バトルに投票 | `battleId`, `choice`（a / b） |
| `POST /mypage` | `nickname` / `profile` / `digest` / `delete-review` / `delete-account` | ニックネーム、画像、年代、性別、公開設定、口コミの削除、退会 |
| `POST /notifications` | すべて既読 | — |
| `GET /auth/google` | Google ログイン開始 | `returnTo` |
| `GET /auth/google/callback` | Google からの戻り | `code`, `state` |
| `POST /auth/logout` | ログアウト | — |
| `POST /auth/dev` | 開発用ログイン（localhost かつ `ADMIN_DEV_BYPASS=true` のときだけ。本番は 404） | `label`, `admin` |
| `GET /admin/api/products` | 特集編集用の商品検索 | `q` |

そのほか：`GET /img/<key>`（R2 の画像）、`GET /sitemap.xml`、`GET /robots.txt`、`GET /ads.txt`、`GET /manifest.webmanifest`、`GET /sw.js`。

エラー時は、入力エラー 400、未ログイン 401、権限なし 403、存在しない 404、回数制限 429 を返す。別サイトから送られた書き込みリクエストは 403 で拒否する。

## 3.4 外部サービスとの連携

| 連携先 | 方向 | 用途 | 必要な設定 |
|---|---|---|---|
| Google OAuth 2.0 | Worker ↔ Google | ログイン（認可コード + PKCE）。取得するのは `openid email profile` | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, リダイレクト URI の登録 |
| コンビニ 5 社のサイト | Workflow → 各社 | 新商品一覧と詳細ページの取得 | なし（収集元は DB に登録済み） |
| コンビニ 5 社の画像サーバー | ブラウザ → 各社 | 商品画像の表示（`referrerPolicy="no-referrer"`） | なし |
| Claude API | Worker / Workflow → Anthropic | 収集データの仕上げ整形、口コミの要約 | `ANTHROPIC_API_KEY`（任意） |
| Resend | Worker → Resend | ダイジェストメールの送信 | `RESEND_API_KEY`, `DIGEST_FROM`（任意） |
| Google AdSense | ブラウザ → Google | 広告の表示 | 管理画面の広告設定 |
| Amazon / 楽天 | ブラウザ → 各社 | アフィリエイトリンク | 管理画面のアフィリエイト設定 |
| Google Fonts | ブラウザ → Google | Zen Maru Gothic、Noto Sans JP | なし |
| Cloudflare Access | Cloudflare → Worker | 管理画面の追加認証（任意） | `ADMIN_REQUIRE_ACCESS`, Zero Trust 側の設定 |

## 3.5 定期実行

| 時刻（日本時間） | cron（UTC） | 処理 |
|---|---|---|
| 毎日 6:00 | `0 21 * * *` | 収集ワークフローの開始（更新があった収集元だけ取り込み）、通知の生成、今週のバトルの作成、後片付け |
| 月曜 8:00 | `0 23 * * SUN` | ダイジェストメールの送信（設定 ON かつ `SITE_ORIGIN` があるとき） |

## 3.6 Cookie

| 名前 | 用途 | 期限 | 属性 |
|---|---|---|---|
| `hk_session` | ログイン状態（ランダムなトークン。DB にはハッシュだけ保存） | 30 日 | HttpOnly, SameSite=Lax, Secure |
| `hk_oauth` | Google ログイン中の state と PKCE の検証値 | 10 分 | HttpOnly, SameSite=Lax, Secure |
| `hk_bv` | 未ログインでのバトル投票の重複防止 | 1 年 | HttpOnly, SameSite=Lax, Secure |

## 3.7 PWA

- `manifest.webmanifest`：名前、アイコン（192 / 512 / maskable）、テーマ色、`display: standalone`。
- Service Worker（`public/sw.js`）：本番でだけ登録する。HTML とデータはキャッシュしない。`/assets/`、アイコン、`/img/` だけキャッシュする。`/admin`、`/auth`、`/api`、POST は素通しする。オフライン時は `offline.html` を出す。
- 緊急停止：`sw.js` の `KILL_SWITCH` を `true` にしてデプロイすると、利用者側の Service Worker が自分で解除される。
