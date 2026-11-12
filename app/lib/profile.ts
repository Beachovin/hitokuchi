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

export const AVATAR_MAX_BYTES = 5 * 1024 * 1024; // 5MB（スマホ写真の平均的なサイズを想定）
export const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
