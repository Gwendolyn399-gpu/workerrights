import {
  Banknote,
  CircleHelp,
  Clock3,
  HandCoins,
  HardHat,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";

import { StartCaseButton } from "@/components/home/start-actions";
import { Badge } from "@/components/ui/badge";

const scenes: Array<{
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  available: boolean;
}> = [
  {
    id: "construction_wage_arrears",
    title: "工资一直没拿到",
    description: "建筑工地、包工头、总包分包场景的欠薪线索整理。",
    icon: Banknote,
    available: true,
  },
  {
    id: "wage_deduction",
    title: "工资被克扣",
    description: "无故扣款、罚款、少算工天等情况。",
    icon: HandCoins,
    available: false,
  },
  {
    id: "overtime",
    title: "加班没有报酬",
    description: "加班时长、加班费计算和举证问题。",
    icon: Clock3,
    available: false,
  },
  {
    id: "work_injury",
    title: "工作中受伤",
    description: "工伤认定、劳动能力鉴定和赔偿路径。",
    icon: ShieldAlert,
    available: false,
  },
  {
    id: "unfair_dismissal",
    title: "被无故辞退",
    description: "违法解除、经济补偿和仲裁路径。",
    icon: HardHat,
    available: false,
  },
  {
    id: "other",
    title: "其他劳动权益问题",
    description: "社保、平台就业等场景将逐步开放。",
    icon: CircleHelp,
    available: false,
  },
];

export function SceneGrid() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {scenes.map((scene, index) => {
        const Icon = scene.icon;
        const content = (
          <>
            <div className="flex items-start justify-between gap-3">
              <span
                className={
                  scene.available
                    ? "flex h-11 w-11 items-center justify-center rounded-xl bg-brand-900 text-white"
                    : "flex h-11 w-11 items-center justify-center rounded-xl bg-ink-100 text-ink-400"
                }
              >
                <Icon className="h-5 w-5" />
              </span>
              {scene.available ? (
                <Badge variant="success">首期完整支持</Badge>
              ) : (
                <Badge variant="neutral">后续开放</Badge>
              )}
            </div>
            <h3 className="mt-4 text-lg font-bold tracking-tight text-ink-900">{scene.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-500">{scene.description}</p>
            {scene.available ? (
              <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-800">
                用大白话开始
                <span aria-hidden="true">→</span>
              </span>
            ) : (
              <span className="mt-4 inline-block text-xs text-ink-400">
                正在整理法律与办事规则
              </span>
            )}
          </>
        );

        if (!scene.available) {
          return (
            <div
              key={scene.id}
              className="rounded-2xl border border-dashed border-ink-200 bg-white/60 p-5 opacity-80"
              aria-disabled="true"
            >
              {content}
            </div>
          );
        }

        return (
          <div key={scene.id} className="animate-fade-up" style={{ animationDelay: `${index * 40}ms` }}>
            <StartCaseButton
              variant="outline"
              size="default"
              showArrow={false}
              className="block h-full w-full [&>button]:h-auto [&>button]:w-full [&>button]:items-stretch [&>button]:justify-start [&>button]:rounded-2xl [&>button]:border-ink-200 [&>button]:p-5 [&>button]:text-left [&>button]:hover:shadow-card"
            >
              <span className="block w-full">{content}</span>
            </StartCaseButton>
          </div>
        );
      })}
    </div>
  );
}
