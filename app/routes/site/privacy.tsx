import { Link } from "react-router";
import type { Route } from "./+types/privacy";
import { usePublicSettings } from "~/lib/monetize";
import { OperatorInfo } from "~/components/operator-info";

export const meta: Route.MetaFunction = () => [
  { title: "プライバシーポリシー・外部送信について｜ひとくち" },
  { name: "description", content: "ひとくちが取得する情報と利用目的、広告・アフィリエイト、外部送信についての説明です。" },
];

// 電気通信事業法の外部送信規律に基づく公表事項を含むページ。運営者情報は管理画面の「設定」で入力する。
export default function Privacy() {
  const s = usePublicSettings();
  return (
    <article className="mx-auto max-w-3xl px-4 pt-4 md:pt-10 leading-relaxed text-stone-700 dark:text-stone-300">
      <h1 className="font-display text-3xl font-black text-stone-900 dark:text-white">プライバシーポリシー</h1>

      <h2 className="mt-10 text-xl font-bold text-stone-900 dark:text-white">取得する情報と利用目的</h2>
      <p className="mt-3">Google アカウントでログインした場合、Google から次の情報を受け取ります。</p>
      <ul className="mt-3 list-disc space-y-1 pl-6">
        <li>Google のユーザー識別子、メールアドレス、氏名、プロフィール画像の URL</li>
      </ul>
      <p className="mt-3">
        これらはログイン状態の管理と本人確認、お問い合わせ対応にのみ利用し、サイト上には公開しません。口コミに表示されるのは、ご自身で設定したニックネームのみです。
        ログイン状態の維持のため Cookie（セッション情報）を使用します。プロフィール画像・口コミの写真は、アップロード時に端末側で縮小・再圧縮され、位置情報などの付帯情報は保存されません。マイページの「退会する」から、アカウントと口コミ・Good / Bad をいつでも削除できます。
      </p>

      <h2 className="mt-10 text-xl font-bold text-stone-900 dark:text-white">広告・アフィリエイトについて</h2>
      <p className="mt-3">
        当サイトは、第三者配信の広告サービス（Google AdSense）およびアフィリエイトプログラム（Amazonアソシエイト、楽天アフィリエイト）を利用しています。
        広告およびアフィリエイトリンクには「広告」「PR」と表示しています。広告主から対価を受け取っても、口コミの掲載順や評価は変更しません。
      </p>
      <p className="mt-3 text-sm">Amazonのアソシエイトとして、当サイトは適格販売により収入を得ています。</p>

      <h2 className="mt-10 text-xl font-bold text-stone-900 dark:text-white">外部送信について</h2>
      <p className="mt-3">当サイトでは、以下の事業者へ利用者の情報が送信される場合があります。</p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-stone-300 text-left dark:border-white/15">
            <tr><th className="py-2 pr-4">送信先</th><th className="py-2 pr-4">送信される情報</th><th className="py-2">目的</th></tr>
          </thead>
          <tbody className="divide-y divide-stone-200 dark:divide-white/10">
            <tr><td className="py-2 pr-4">Google LLC（Google ログイン）</td><td className="py-2 pr-4">ログイン時の認証情報（ログインを選択した場合のみ）</td><td className="py-2">本人確認・ログイン</td></tr>
            <tr><td className="py-2 pr-4">Google LLC（Google AdSense）</td><td className="py-2 pr-4">閲覧ページのURL、Cookie、端末・ブラウザ情報、IPアドレス</td><td className="py-2">広告の配信・効果測定</td></tr>
            <tr><td className="py-2 pr-4">アマゾンジャパン合同会社</td><td className="py-2 pr-4">リンクのクリック、Cookie</td><td className="py-2">アフィリエイトの成果計測</td></tr>
            <tr><td className="py-2 pr-4">楽天グループ株式会社</td><td className="py-2 pr-4">リンクのクリック、Cookie</td><td className="py-2">アフィリエイトの成果計測</td></tr>
            <tr><td className="py-2 pr-4">商品画像の配信元（各コンビニ公式サイト）</td><td className="py-2 pr-4">IPアドレス、ブラウザ情報</td><td className="py-2">商品画像の表示</td></tr>
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-sm">
        Google による広告のパーソナライズは、
        <a href="https://adssettings.google.com/" target="_blank" rel="noopener" className="underline">広告設定</a>
        から無効にできます。
      </p>

      <h2 className="mt-10 text-xl font-bold text-stone-900 dark:text-white">掲載情報について</h2>
      <p className="mt-3">商品名・価格・画像などは各社の公開情報をもとに掲載しています。最新の情報は各社の公式サイトをご確認ください。</p>

      <h2 className="mt-10 text-xl font-bold text-stone-900 dark:text-white">運営者・お問い合わせ</h2>
      <OperatorInfo name={s?.operator_name} contact={s?.operator_contact} />
      <p className="mt-6 text-sm"><Link to="/terms" className="underline">利用規約</Link>もあわせてご確認ください。</p>
    </article>
  );
}
