/** 運営者名とお問い合わせ先（管理画面の設定で入力したもの） */
export function OperatorInfo({ name, contact }: { name?: string; contact?: string }) {
  if (!name && !contact) return <p className="mt-3 text-stone-400">（準備中です）</p>;
  return (
    <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
      {name && (
        <>
          <dt className="text-stone-500">運営者</dt>
          <dd>{name}</dd>
        </>
      )}
      {contact && (
        <>
          <dt className="text-stone-500">お問い合わせ</dt>
          <dd>
            {contact.startsWith("https://") ? (
              <a href={contact} target="_blank" rel="noopener" className="underline">お問い合わせフォーム</a>
            ) : (
              <a href={`mailto:${contact}`} className="underline">{contact}</a>
            )}
          </dd>
        </>
      )}
    </dl>
  );
}
