// 年代・性別（クライアントでも使う）
export const AGE_GROUPS = [
  { id: "10s", label: "10代" },
  { id: "20s", label: "20代" },
  { id: "30s", label: "30代" },
  { id: "40s", label: "40代" },
  { id: "50s", label: "50代" },
  { id: "60s", label: "60代以上" },
] as const;

export const GENDERS = [
  { id: "female", label: "女性" },
  { id: "male", label: "男性" },
  { id: "other", label: "その他" },
] as const;

export const ageLabel = (id: string | null | undefined) => AGE_GROUPS.find((a) => a.id === id)?.label ?? null;
export const genderLabel = (id: string | null | undefined) => GENDERS.find((g) => g.id === id)?.label ?? null;

/** 公開設定済みの年代・性別を「20代・女性」の形で */
export function demographicLabel(age: string | null | undefined, gender: string | null | undefined) {
  return [ageLabel(age), genderLabel(gender)].filter(Boolean).join("・") || null;
}

/** 選べる元画像の上限（端末側で縮小してから送るので、スマホ写真がそのまま選べる大きさ） */
export const AVATAR_INPUT_MAX_BYTES = 20 * 1024 * 1024;
/** 保存する画像の上限。端末側で 240px・約 20KB 以下に圧縮したものだけを受け付ける */
export const AVATAR_STORE_MAX_BYTES = 100 * 1024;
/** 表示は最大 80px。高精細画面（3 倍）でもぼやけない大きさ */
export const AVATAR_PX = 240;
/** 圧縮の目標サイズ（これを下回るまで画質を段階的に下げる） */
export const AVATAR_TARGET_BYTES = 20 * 1024;
export { IMAGE_TYPES as AVATAR_TYPES } from "./image";
