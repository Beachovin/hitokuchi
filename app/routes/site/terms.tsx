import { Link } from "react-router";
import type { Route } from "./+types/terms";
import { usePublicSettings } from "~/lib/monetize";
import { OperatorInfo } from "~/components/operator-info";

export const meta: Route.MetaFunction = () => [
  { title: "利用規約｜ひとくち" },
  { name: "description", content: "ひとくちの利用規約です。口コミの投稿ルール、禁止事項、免責事項などを定めています。" },
];

const H = ({ children }: { children: React.ReactNode }) => <h2 className="mt-10 text-xl font-bold text-stone-900 dark:text-white">{children}</h2>;

export default function Terms() {
  const s = usePublicSettings();
  return (
    <article className="mx-auto max-w-3xl px-4 pt-4 leading-relaxed text-stone-700 md:pt-10 dark:text-stone-300">
      <h1 className="font-display text-3xl font-black text-stone-900 dark:text-white">利用規約</h1>
      <p className="mt-4">この規約は、「ひとくち」（以下「当サイト」）の利用条件を定めるものです。当サイトを利用した時点で、この規約に同意したものとみなします。</p>

      <H>1. アカウント</H>
      <ul className="mt-3 list-disc space-y-1 pl-6">
        <li>口コミの投稿などには Google アカウントでのログインが必要です。</li>
        <li>アカウントは本人が管理し、第三者に利用させないでください。</li>
        <li>マイページの「退会する」から、いつでもアカウントと投稿内容を削除できます。</li>
      </ul>

      <H>2. 口コミ・写真の投稿</H>
      <ul className="mt-3 list-disc space-y-1 pl-6">
        <li>実際に食べた・購入した商品について、ご自身の感想を投稿してください。</li>
        <li>投稿した口コミ・写真の著作権は投稿者に残ります。投稿者は当サイトに対し、サイト内での掲載、要約・抜粋の作成、紹介のための利用を無償で許諾するものとします。</li>
        <li>掲載中の商品は、発売から約 1 か月を過ぎると口コミとともに自動的に削除されます。</li>
      </ul>

      <H>3. 禁止事項</H>
      <ul className="mt-3 list-disc space-y-1 pl-6">
        <li>事実と異なる内容、食べていない商品への投稿、同じ内容の連続投稿</li>
        <li>対価を受け取っていることを隠した宣伝（いわゆるステルスマーケティング）、自社・競合商品の評価の操作</li>
        <li>他人を誹謗中傷する内容、差別的な内容、わいせつな内容、個人を特定できる情報の掲載</li>
        <li>他人の著作権・肖像権などの権利を侵害する文章や写真の投稿</li>
        <li>複数アカウントの利用や自動化された手段による Good / Bad・バトル投票の操作</li>
        <li>当サイトへの不正アクセス、過度な負荷をかける行為、法令または公序良俗に反する行為</li>
      </ul>

      <H>4. 投稿の非公開・アカウントの停止</H>
      <p className="mt-3">禁止事項にあたる、またはそのおそれがあると運営者が判断した投稿は、予告なく非公開・削除することがあります。違反が重大または繰り返される場合は、アカウントを停止することがあります。不適切な口コミを見つけた場合は、各口コミの「通報」からお知らせください。</p>

      <H>5. 掲載情報について</H>
      <p className="mt-3">商品名・価格・発売日・販売地域・画像などは、各社が公開している情報をもとに掲載しています。内容の正確さや最新であることは保証しません。購入の際は各社の公式サイトや店頭でご確認ください。商品名・ロゴ・画像などの権利は各権利者に帰属します。</p>

      <H>6. 広告について</H>
      <p className="mt-3">当サイトには広告およびアフィリエイトリンクが含まれます。詳しくは<Link to="/privacy" className="underline">プライバシーポリシー</Link>をご覧ください。</p>

      <H>7. 免責事項</H>
      <p className="mt-3">口コミは投稿者個人の感想であり、運営者の見解ではありません。当サイトの利用または利用できなかったことによって生じた損害について、運営者に故意または重大な過失がある場合を除き、運営者は責任を負いません。当サイトは、予告なく内容の変更・中断・終了をすることがあります。</p>

      <H>8. 規約の変更</H>
      <p className="mt-3">運営者は、必要に応じてこの規約を変更できます。変更後の規約は、当サイトに掲載した時点から効力を持ちます。</p>

      <H>9. 準拠法・管轄</H>
      <p className="mt-3">この規約は日本法に準拠します。当サイトに関する紛争は、運営者の所在地を管轄する裁判所を第一審の専属的合意管轄裁判所とします。</p>

      <H>運営者・お問い合わせ</H>
      <OperatorInfo name={s?.operator_name} contact={s?.operator_contact} />
    </article>
  );
}
