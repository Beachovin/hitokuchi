import { type RouteConfig, index, layout, prefix, route } from "@react-router/dev/routes";

export default [
  // お客様向け
  layout("routes/site/layout.tsx", [
    index("routes/site/home.tsx"),
    route("products", "routes/site/products.tsx"),
    route("products/:id", "routes/site/product.tsx"),
    route("weekly", "routes/site/weekly-index.tsx"),
    route("weekly/:week", "routes/site/weekly.tsx"),
    route("features", "routes/site/features/index.tsx"),
    route("features/region/:slug", "routes/site/features/region.tsx"),
    route("features/:slug", "routes/site/features/season.tsx"),
    route("about", "routes/site/about.tsx"),
    route("privacy", "routes/site/privacy.tsx"),
    route("terms", "routes/site/terms.tsx"),
    route("login", "routes/site/login.tsx"),
    route("mypage", "routes/site/mypage.tsx"),
    route("favorites", "routes/site/favorites.tsx"),
    route("post", "routes/site/post.tsx"),
    route("notifications", "routes/site/notifications.tsx"),
    route("mypage/digest", "routes/site/digest-preview.tsx"),
  ]),

  // 認証
  route("auth/google", "routes/auth/google.ts"),
  route("auth/google/callback", "routes/auth/callback.ts"),
  route("auth/logout", "routes/auth/logout.ts"),
  route("auth/dev", "routes/auth/dev.ts"),
  route("api/bookmark", "routes/api/bookmark.ts"),
  route("api/eaten", "routes/api/eaten.ts"),
  route("api/battle", "routes/api/battle.ts"),

  // SEO・広告
  route("sitemap.xml", "routes/seo/sitemap.ts"),
  route("robots.txt", "routes/seo/robots.ts"),
  route("ads.txt", "routes/seo/ads.ts"),

  // 管理画面（Google ログイン＋管理者ロール。本番は Cloudflare Access も併用推奨）
  route("admin/login", "routes/admin/login.tsx"),
  route("admin/api/products", "routes/admin/api-products.ts"),
  ...prefix("admin", [
    layout("routes/admin/layout.tsx", [
      index("routes/admin/dashboard.tsx"),
      route("candidates", "routes/admin/candidates.tsx"),
      route("products", "routes/admin/products.tsx"),
      route("products/:id", "routes/admin/product-edit.tsx"),
      route("reviews", "routes/admin/reviews.tsx"),
      route("sources", "routes/admin/sources.tsx"),
      route("settings", "routes/admin/settings.tsx"),
      route("reports", "routes/admin/reports.tsx"),
      route("features", "routes/admin/features.tsx"),
      route("features/:id", "routes/admin/feature-edit.tsx"),
      route("users", "routes/admin/users.tsx"),
      route("audit", "routes/admin/audit.tsx"),
    ]),
  ]),
] satisfies RouteConfig;
