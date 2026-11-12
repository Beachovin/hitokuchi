export const REPORT_REASONS = [
  { id: "spam", label: "スパム・宣伝" },
  { id: "abuse", label: "誹謗中傷・嫌がらせ" },
  { id: "impersonation", label: "なりすまし" },
  { id: "inappropriate", label: "不適切な内容・画像" },
  { id: "other", label: "その他" },
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number]["id"];
export const reasonLabel = (id: string) => REPORT_REASONS.find((r) => r.id === id)?.label ?? id;
