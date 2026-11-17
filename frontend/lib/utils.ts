import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatAmount(value?: number | null, approximate = false): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "待核实";
  let text: string;
  if (value >= 10000) {
    text = `${(value / 10000).toFixed(1).replace(/\.0$/, "")}万元`;
  } else {
    text = `${value.toLocaleString("zh-CN")}元`;
  }
  return approximate ? `约${text}` : text;
}

export function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function shortDate(iso?: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export function statusLabel(status: string): string {
  return (
    {
      collecting: "补充信息中",
      ready: "信息已确认",
      planned: "已生成行动方案",
    }[status] || status
  );
}

export function verificationLabel(status: string): string {
  return (
    {
      verified: "已核验",
      transcribed: "待逐条核验",
      pending: "待核验",
      official_only: "仅官方填写",
      ready: "可填写",
      missing: "待补充",
      verify: "需核对",
    }[status] || status
  );
}
